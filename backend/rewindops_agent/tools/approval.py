"""Approval gate — returns structured approval request for the frontend."""

import uuid
from datetime import datetime, timezone
from typing import Any
from rewindops_agent.services.mongo_client import get_rewindops_db


async def request_approval(
    action_id: str,
    action_type: str,
    collection: str,
    document_id: str,
    risk_level: str,
    risk_score: int,
    risk_reasons: list[str],
    blast_radius_summary: str,
    field_changes: list[dict],
    business_impact: list[str],
    checkpoint_id: str,
    proposed_changes: dict[str, Any],
) -> dict:
    """Request human approval for a risky action. This creates an action receipt in pending state and returns approval card data for the UI.

    Args:
        action_id: The unique action ID.
        action_type: The type of action (e.g., cancel_subscription).
        collection: The target MongoDB collection.
        document_id: The target document _id.
        risk_level: The classified risk level (low, medium, high, critical).
        risk_score: The numeric risk score.
        risk_reasons: List of reasons for the risk classification.
        blast_radius_summary: A human-readable summary of what will change.
        field_changes: List of before/after field diffs.
        business_impact: List of business impact statements.
        checkpoint_id: The checkpoint ID for this action.
        proposed_changes: The proposed MongoDB update operations.

    Returns:
        A dict with the approval card data. The agent should present this to the user and wait for their decision.
    """
    rewindops_db = get_rewindops_db()
    now = datetime.now(timezone.utc)

    receipt = {
        "_id": action_id,
        "agent_id": "support-agent-demo",
        "action_type": action_type,
        "collection": collection,
        "document_id": document_id,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "risk_reasons": risk_reasons,
        "blast_radius_summary": blast_radius_summary,
        "field_changes": field_changes,
        "business_impact": business_impact,
        "proposed_changes": proposed_changes,
        "checkpoint_id": checkpoint_id,
        "approval_required": True,
        "approval_status": "pending",
        "execution_status": "pending",
        "rollback_status": "not_applicable",
        "created_at": now.isoformat(),
    }

    await rewindops_db["action_receipts"].replace_one(
        {"_id": action_id}, receipt, upsert=True
    )

    return {
        "status": "awaiting_approval",
        "action_id": action_id,
        "action_type": action_type,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "collection": collection,
        "document_id": document_id,
        "field_changes": field_changes,
        "business_impact": business_impact,
        "blast_radius_summary": blast_radius_summary,
        "checkpoint_id": checkpoint_id,
        "rollback_available": True,
        "message": (
            f"ACTION REQUIRES APPROVAL. Risk level: {risk_level.upper()} (score: {risk_score}). "
            f"{blast_radius_summary} "
            "Please respond with 'Approved' to proceed or 'Rejected' to cancel this action."
        ),
    }
