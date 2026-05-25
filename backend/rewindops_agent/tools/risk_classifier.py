"""Deterministic risk classification for agent write actions."""

from typing import Any
from rewindops_agent.config import RISK_WEIGHTS, RISK_THRESHOLDS, DANGEROUS_ACTIONS
from rewindops_agent.services.mongo_client import get_business_db

BILLING_FIELDS = {"amount", "monthly_amount", "currency", "refund_status", "status"}
SUBSCRIPTION_STATUS_FIELDS = {"status", "plan", "renewal_date"}
BILLING_COLLECTIONS = {"invoices", "subscriptions"}


async def classify_risk(
    action_type: str,
    collection: str,
    document_id: str,
    proposed_changes: dict[str, Any],
) -> dict:
    """Classify the risk level of a proposed write action.

    Args:
        action_type: The type of action (e.g., cancel_subscription, refund_invoice, update_customer_plan).
        collection: The MongoDB collection being modified (e.g., subscriptions, invoices, customers).
        document_id: The _id of the document being modified.
        proposed_changes: A dict of field names to their new values.

    Returns:
        A dict with risk_level, score, reasons, approval_required, checkpoint_required, and rollback_supported.
    """
    if action_type in DANGEROUS_ACTIONS:
        return {
            "status": "blocked",
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
    except Exception:
        pass

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

    return {
        "status": "classified",
        "risk_level": risk_level,
        "score": score,
        "reasons": reasons,
        "approval_required": approval_required,
        "checkpoint_required": checkpoint_required,
        "rollback_supported": rollback_supported,
        "decision": decision,
    }
