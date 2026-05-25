"""Action history — query past actions, receipts, and rollback events."""

from typing import Optional
from rewindops_agent.services.mongo_client import get_rewindops_db


async def list_action_history(
    limit: int = 20,
    risk_level_filter: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> dict:
    """List recent action receipts from RewindOps history.

    Args:
        limit: Maximum number of actions to return (default 20).
        risk_level_filter: Optional filter by risk level (low, medium, high, critical).
        status_filter: Optional filter by execution status (pending, executed, failed, rolled_back).

    Returns:
        A dict with a list of action receipts.
    """
    rewindops_db = get_rewindops_db()

    query = {}
    if risk_level_filter:
        query["risk_level"] = risk_level_filter
    if status_filter:
        if status_filter == "rolled_back":
            query["rollback_status"] = "rolled_back"
        else:
            query["execution_status"] = status_filter

    cursor = rewindops_db["action_receipts"].find(query).sort("created_at", -1).limit(limit)
    actions = await cursor.to_list(length=limit)

    results = []
    for action in actions:
        results.append({
            "action_id": action["_id"],
            "action_type": action.get("action_type", "unknown"),
            "collection": action.get("collection", ""),
            "document_id": action.get("document_id", ""),
            "risk_level": action.get("risk_level", "unknown"),
            "risk_score": action.get("risk_score", 0),
            "approval_status": action.get("approval_status", "unknown"),
            "execution_status": action.get("execution_status", "unknown"),
            "rollback_status": action.get("rollback_status", "not_applicable"),
            "checkpoint_id": action.get("checkpoint_id"),
            "created_at": action.get("created_at", ""),
            "executed_at": action.get("executed_at"),
        })

    return {
        "status": "success",
        "count": len(results),
        "actions": results,
    }


async def get_action_detail(
    action_id: str,
) -> dict:
    """Get full details of a specific action including checkpoint and rollback data.

    Args:
        action_id: The action ID to look up.

    Returns:
        A dict with full action receipt, checkpoint, and rollback event details.
    """
    rewindops_db = get_rewindops_db()

    receipt = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not receipt:
        return {
            "status": "error",
            "error": f"Action '{action_id}' not found.",
        }

    checkpoint = None
    if receipt.get("checkpoint_id"):
        checkpoint = await rewindops_db["action_checkpoints"].find_one(
            {"_id": receipt["checkpoint_id"]}
        )

    rollback_event = None
    if receipt.get("rollback_event_id"):
        rollback_event = await rewindops_db["rollback_events"].find_one(
            {"_id": receipt["rollback_event_id"]}
        )

    return {
        "status": "success",
        "receipt": {
            "action_id": receipt["_id"],
            "action_type": receipt.get("action_type"),
            "collection": receipt.get("collection"),
            "document_id": receipt.get("document_id"),
            "risk_level": receipt.get("risk_level"),
            "risk_score": receipt.get("risk_score"),
            "risk_reasons": receipt.get("risk_reasons", []),
            "blast_radius_summary": receipt.get("blast_radius_summary"),
            "field_changes": receipt.get("field_changes", []),
            "business_impact": receipt.get("business_impact", []),
            "approval_status": receipt.get("approval_status"),
            "execution_status": receipt.get("execution_status"),
            "rollback_status": receipt.get("rollback_status"),
            "created_at": receipt.get("created_at"),
            "executed_at": receipt.get("executed_at"),
        },
        "checkpoint": {
            "checkpoint_id": checkpoint["_id"],
            "before_state": checkpoint.get("before_state"),
            "rollback_available": checkpoint.get("rollback_available"),
            "created_at": checkpoint.get("created_at"),
        } if checkpoint else None,
        "rollback_event": {
            "rollback_event_id": rollback_event["_id"],
            "reason": rollback_event.get("reason"),
            "verification": rollback_event.get("verification"),
            "completed_at": rollback_event.get("completed_at"),
        } if rollback_event else None,
    }
