"""Approve or reject a pending action — called when user responds to approval request."""

from datetime import datetime, timezone
from rewindops_agent.services.mongo_client import get_rewindops_db


async def approve_action(
    action_id: str,
    approved: bool,
    approved_by: str = "demo-user",
) -> dict:
    """Record the user's approval or rejection decision for a pending action.

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

    if receipt.get("approval_status") != "pending":
        return {
            "status": "error",
            "error": f"Action '{action_id}' is not pending approval. Current status: {receipt.get('approval_status')}.",
        }

    now = datetime.now(timezone.utc)
    new_status = "approved" if approved else "rejected"

    update = {
        "approval_status": new_status,
        "approved_by": approved_by,
        "approval_decided_at": now.isoformat(),
    }

    if not approved:
        update["execution_status"] = "cancelled"

    await rewindops_db["action_receipts"].update_one(
        {"_id": action_id},
        {"$set": update},
    )

    if approved:
        return {
            "status": "approved",
            "action_id": action_id,
            "message": (
                f"Action {action_id} has been APPROVED by {approved_by}. "
                "You should now call execute_action to apply the changes."
            ),
        }
    else:
        return {
            "status": "rejected",
            "action_id": action_id,
            "message": (
                f"Action {action_id} has been REJECTED by {approved_by}. "
                "The action will not be executed. No changes have been made."
            ),
        }
