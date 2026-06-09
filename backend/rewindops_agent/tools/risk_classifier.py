"""Deterministic risk classification for agent write actions."""

import uuid
from datetime import datetime, timezone
from typing import Any
from rewindops_agent.config import RISK_WEIGHTS, RISK_THRESHOLDS, DANGEROUS_ACTIONS, APPROVAL_REQUIREMENTS, current_user_id
from rewindops_agent.services.mongo_client import get_business_db, get_rewindops_db

BILLING_FIELDS = {"amount", "monthly_amount", "currency", "refund_status", "status"}
SUBSCRIPTION_STATUS_FIELDS = {"status", "plan", "renewal_date"}
BILLING_COLLECTIONS = {"invoices", "subscriptions"}


async def classify_risk(
    action_type: str,
    collection: str,
    document_id: str,
    proposed_changes: dict[str, Any],
    operation_type: str = "UPDATE",
) -> dict:
    """Classify the risk level of a proposed write action and persist the initial receipt.

    Args:
        action_type: The type of action (e.g., cancel_subscription, refund_invoice, update_customer_plan).
        collection: The MongoDB collection being modified (e.g., subscriptions, invoices, customers).
        document_id: The _id of the document being modified.
        proposed_changes: A dict of field names to their new values.
        operation_type: The type of mutation (INSERT, UPDATE, DELETE). Defaults to UPDATE.

    Returns:
        A dict with action_id, risk_level, score, reasons, approval_required, checkpoint_required, and rollback_supported.
    """
    action_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"

    if action_type in DANGEROUS_ACTIONS:
        return {
            "status": "blocked",
            "action_id": action_id,
            "risk_level": "critical",
            "score": 100,
            "reasons": [f"Action '{action_type}' is permanently blocked. This action is destructive and irreversible."],
            "approval_required": False,
            "checkpoint_required": False,
            "rollback_supported": False,
            "decision": "BLOCK",
        }

    score = 0
    reasons = []

    score += RISK_WEIGHTS["write_action"]
    reasons.append("Write action detected (+10)")

    if collection in BILLING_COLLECTIONS:
        score += RISK_WEIGHTS["billing_related"]
        reasons.append(f"Billing-related collection '{collection}' (+20)")

    changed_fields = set(proposed_changes.keys())

    if changed_fields & SUBSCRIPTION_STATUS_FIELDS:
        score += RISK_WEIGHTS["subscription_status_change"]
        reasons.append(f"Subscription status/plan fields modified: {changed_fields & SUBSCRIPTION_STATUS_FIELDS} (+20)")

    if "refund_status" in changed_fields or action_type == "refund_invoice":
        score += RISK_WEIGHTS["refund_modification"]
        reasons.append("Refund state modification (+15)")

    if "delete" in action_type or "remove" in action_type or "drop" in action_type:
        score += RISK_WEIGHTS["destructive_action"]
        reasons.append(f"Destructive action type '{action_type}' (+20)")

    db = get_business_db()
    try:
        if collection == "subscriptions":
            doc = await db[collection].find_one({"_id": document_id})
            if doc:
                customer = await db["customers"].find_one({"_id": doc.get("customer_id")})
                if customer and customer.get("tier") == "enterprise":
                    score += RISK_WEIGHTS["enterprise_customer"]
                    reasons.append(f"Enterprise customer '{customer.get('name')}' affected (+20)")
        elif collection == "customers":
            doc = await db[collection].find_one({"_id": document_id})
            if doc and doc.get("tier") == "enterprise":
                score += RISK_WEIGHTS["enterprise_customer"]
                reasons.append(f"Enterprise customer '{doc.get('name')}' affected (+20)")
    except Exception as e:
        # FAIL SECURE GATING
        return {
            "status": "classified",
            "action_id": action_id,
            "risk_level": "critical",
            "score": 100,
            "reasons": [
                f"Fail-Secure: Database connection fault occurred ({str(e)}). "
                "Defaulting to critical risk to prevent unapproved execution."
            ],
            "approval_required": True,
            "checkpoint_required": True,
            "rollback_supported": True,
            "decision": "HOLD_FOR_APPROVAL",
        }

    rollback_supported = True
    score += RISK_WEIGHTS["rollback_available"]
    reasons.append("Rollback available (-10)")

    risk_level = "low"
    for level, (low, high) in RISK_THRESHOLDS.items():
        if low <= score <= high:
            risk_level = level
            break

    if risk_level in ("high", "critical"):
        approval_required = True
        decision = "HOLD_FOR_APPROVAL"
    elif risk_level == "medium":
        approval_required = False
        decision = "CHECKPOINT_AND_PROCEED"
    else:
        approval_required = False
        decision = "ALLOW"

    checkpoint_required = risk_level in ("medium", "high", "critical")

    # Persist initial action receipt context
    try:
        rewindops_db = get_rewindops_db()
        now = datetime.now(timezone.utc)
        receipt = {
            "_id": action_id,
            "agent_id": "support-agent-demo",
            "user_id": current_user_id.get(),
            "action_type": action_type,
            "collection": collection,
            "document_id": document_id,
            "proposed_changes": proposed_changes,
            "operation_type": operation_type.upper(),
            "risk_level": risk_level,
            "risk_score": score,
            "risk_reasons": reasons,
            "approval_required": approval_required,
            "required_approvals": APPROVAL_REQUIREMENTS.get(risk_level, 1),
            "approvals": [],
            "approval_status": "approved" if not approval_required else "pending",
            "execution_status": "pending",
            "rollback_status": "not_applicable",
            "pipeline_state": "classified",
            "created_at": now.isoformat(),
        }
        await rewindops_db["action_receipts"].replace_one(
            {"_id": action_id}, receipt, upsert=True
        )
    except Exception as e:
        # FAIL SECURE GATING ON PERSISTENCE FAULT
        return {
            "status": "classified",
            "action_id": action_id,
            "risk_level": "critical",
            "score": 100,
            "reasons": [
                f"Fail-Secure: Receipts persistence fault occurred ({str(e)}). "
                "Defaulting to critical risk to prevent unapproved execution."
            ],
            "approval_required": True,
            "checkpoint_required": True,
            "rollback_supported": True,
            "decision": "HOLD_FOR_APPROVAL",
        }

    return {
        "status": "classified",
        "action_id": action_id,
        "risk_level": risk_level,
        "score": score,
        "reasons": reasons,
        "approval_required": approval_required,
        "checkpoint_required": checkpoint_required,
        "rollback_supported": rollback_supported,
        "decision": decision,
    }
