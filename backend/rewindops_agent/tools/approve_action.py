"""Approve or reject a pending action — supports multi-approver workflows."""

from datetime import datetime, timezone
from rewindops_agent.config import APPROVAL_REQUIREMENTS
from rewindops_agent.services.mongo_client import get_rewindops_db


async def approve_action(
    action_id: str,
    approved: bool,
    approved_by: str = "demo-user",
) -> dict:
    """Record the user's approval or rejection decision for a pending action.

    Supports multi-approver workflows: high-risk actions require multiple
    approvals before they are fully approved. A single rejection immediately
    rejects the action regardless of approval count.

    Args:
        action_id: The action ID to approve or reject.
        approved: True if the user approved the action, False if rejected.
        approved_by: The identifier of the user who made the decision.

    Returns:
        A dict with the updated approval status.
    """
    rewindops_db = get_rewindops_db()

    receipt = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not receipt:
        return {
            "status": "error",
            "error": f"Action receipt '{action_id}' not found.",
        }

    current_status = receipt.get("approval_status", "pending")
    if current_status not in ("pending", "partially_approved"):
        return {
            "status": "error",
            "error": f"Action '{action_id}' is not pending approval. Current status: {current_status}.",
        }

    now = datetime.now(timezone.utc)

    if not approved:
        update = {
            "approval_status": "rejected",
            "approved_by": approved_by,
            "approval_decided_at": now.isoformat(),
            "pipeline_state": "rejected",
            "execution_status": "cancelled",
        }
        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": update},
        )
        return {
            "status": "rejected",
            "action_id": action_id,
            "message": (
                f"Action {action_id} has been REJECTED by {approved_by}. "
                "The action will not be executed. No changes have been made."
            ),
        }

    approvals = receipt.get("approvals", [])
    approvals.append({"user": approved_by, "at": now.isoformat()})

    risk_level = receipt.get("risk_level", "medium")
    required = receipt.get("required_approvals", APPROVAL_REQUIREMENTS.get(risk_level, 1))

    if len(approvals) >= required:
        update = {
            "approvals": approvals,
            "approval_status": "approved",
            "approved_by": approved_by,
            "approval_decided_at": now.isoformat(),
            "pipeline_state": "approved",
        }
        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": update},
        )
        return {
            "status": "approved",
            "action_id": action_id,
            "approvals_received": len(approvals),
            "approvals_required": required,
            "message": (
                f"Action {action_id} has been APPROVED by {approved_by} "
                f"({len(approvals)}/{required} approvals received). "
                "You should now call execute_action to apply the changes."
            ),
        }
    else:
        update = {
            "approvals": approvals,
            "approval_status": "partially_approved",
        }
        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": update},
        )
        return {
            "status": "partially_approved",
            "action_id": action_id,
            "approvals_received": len(approvals),
            "approvals_required": required,
            "message": (
                f"Action {action_id} has been approved by {approved_by}, but requires "
                f"more approvals ({len(approvals)}/{required}). "
                "Waiting for additional approvers."
            ),
        }
