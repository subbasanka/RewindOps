"""Execute approved actions — applies the write to MongoDB after approval."""

from datetime import datetime, timezone
from typing import Any
from rewindops_agent.services.mongo_client import get_business_db, get_rewindops_db


async def execute_action(
    action_id: str,
) -> dict:
    """Execute a previously approved action. Applies the proposed changes to MongoDB and updates the action receipt.

    Args:
        action_id: The action ID that was previously approved.

    Returns:
        A dict with execution status, updated document state, and rollback availability.
    """
    rewindops_db = get_rewindops_db()
    business_db = get_business_db()

    receipt = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not receipt:
        return {
            "status": "error",
            "error": f"Action receipt '{action_id}' not found.",
        }

    if receipt.get("approval_status") != "approved":
        return {
            "status": "error",
            "error": f"Action '{action_id}' has not been approved. Current approval status: {receipt.get('approval_status')}.",
        }

    if receipt.get("execution_status") == "executed":
        return {
            "status": "error",
            "error": f"Action '{action_id}' has already been executed.",
        }

    collection = receipt["collection"]
    document_id = receipt["document_id"]
    proposed_changes = receipt["proposed_changes"]

    try:
        result = await business_db[collection].update_one(
            {"_id": document_id},
            {"$set": proposed_changes},
        )

        if result.matched_count == 0:
            await rewindops_db["action_receipts"].update_one(
                {"_id": action_id},
                {"$set": {
                    "execution_status": "failed",
                    "error": f"Document '{document_id}' not found in '{collection}'.",
                }},
            )
            return {
                "status": "error",
                "error": f"Document '{document_id}' not found in '{collection}'. Execution failed.",
            }

        now = datetime.now(timezone.utc)
        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": {
                "execution_status": "executed",
                "rollback_status": "available",
                "executed_at": now.isoformat(),
            }},
        )

        updated_doc = await business_db[collection].find_one({"_id": document_id})

        return {
            "status": "executed",
            "action_id": action_id,
            "collection": collection,
            "document_id": document_id,
            "changes_applied": proposed_changes,
            "rollback_available": True,
            "checkpoint_id": receipt.get("checkpoint_id"),
            "message": (
                f"Action {action_id} executed successfully. "
                f"Document '{document_id}' in '{collection}' has been updated. "
                f"Rollback is available via checkpoint {receipt.get('checkpoint_id')}."
            ),
        }

    except Exception as e:
        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": {
                "execution_status": "failed",
                "error": str(e),
            }},
        )
        return {
            "status": "error",
            "error": f"Execution failed: {str(e)}",
        }
