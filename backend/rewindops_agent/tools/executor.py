"""Execute approved actions — applies the write to MongoDB after approval."""

from datetime import datetime, timezone
from pymongo import ReturnDocument
from rewindops_agent.services.mongo_client import get_business_db, get_rewindops_db


async def execute_action(
    action_id: str,
) -> dict:
    """Execute a previously approved action. Applies the proposed changes (CRUD) to MongoDB and updates the action receipt.
       Uses an atomic transition guard to block concurrent execution.

    Args:
        action_id: The action ID that was previously approved.

    Returns:
        A dict with execution status, updated document state, and rollback availability.
    """
    rewindops_db = get_rewindops_db()
    business_db = get_business_db()

    # Pipeline state guard: only execute from valid pre-execution states
    pre_check = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not pre_check:
        return {
            "status": "error",
            "error": f"Action receipt '{action_id}' not found.",
        }

    valid_execute_states = ("approved", "previewed", "checkpointed")
    current_pipeline = pre_check.get("pipeline_state")
    if current_pipeline not in valid_execute_states:
        return {
            "status": "error",
            "error": (
                f"Action '{action_id}' is in pipeline state '{current_pipeline}'. "
                f"Execution requires one of: {', '.join(valid_execute_states)}. "
                "Complete the safety flow (checkpoint, preview, approval) before executing."
            ),
        }

    # Concurrency Guard: Atomic update of receipt state to 'executing'
    receipt = await rewindops_db["action_receipts"].find_one_and_update(
        {
            "_id": action_id,
            "approval_status": "approved",
            "execution_status": "pending",
        },
        {"$set": {"execution_status": "executing", "pipeline_state": "executing"}},
        return_document=ReturnDocument.AFTER,
    )

    if not receipt:
        existing = await rewindops_db["action_receipts"].find_one({"_id": action_id})
        if not existing:
            return {
                "status": "error",
                "error": f"Action receipt '{action_id}' not found.",
            }
        if existing.get("approval_status") != "approved":
            return {
                "status": "error",
                "error": f"Action '{action_id}' has not been approved. Current approval status: {existing.get('approval_status')}.",
            }
        if existing.get("execution_status") != "pending":
            return {
                "status": "error",
                "error": f"Action '{action_id}' cannot be executed. Current execution status: {existing.get('execution_status')}.",
            }

    collection = receipt["collection"]
    document_id = receipt["document_id"]
    proposed_changes = receipt.get("proposed_changes", {}) or {}
    op_type = receipt.get("operation_type", "UPDATE").upper()

    try:
        changes_applied = proposed_changes

        if op_type == "INSERT":
            # Direct insert bypasses MCP safety interception
            # Ensure the ID is set to document_id
            proposed_changes["_id"] = document_id
            await business_db[collection].insert_one(proposed_changes)
        elif op_type == "DELETE":
            # Direct delete
            await business_db[collection].delete_one({"_id": document_id})
            changes_applied = {}
        else: # UPDATE (default)
            # Direct update
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

        # Retrieve the final mutated document state
        updated_doc = None
        if op_type != "DELETE":
            updated_doc = await business_db[collection].find_one({"_id": document_id})

        now = datetime.now(timezone.utc)
        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": {
                "execution_status": "executed",
                "rollback_status": "available",
                "pipeline_state": "executed",
                "executed_at": now.isoformat(),
                "after_state": updated_doc,
            }},
        )

        return {
            "status": "executed",
            "action_id": action_id,
            "collection": collection,
            "document_id": document_id,
            "changes_applied": changes_applied,
            "rollback_available": True,
            "checkpoint_id": receipt.get("checkpoint_id"),
            "message": (
                f"Action {action_id} executed successfully. "
                f"Document '{document_id}' in '{collection}' has been mutated ({op_type}). "
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
