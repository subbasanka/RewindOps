"""Rollback service — restores checkpointed MongoDB state."""

import uuid
from datetime import datetime, timezone
from rewindops_agent.services.mongo_client import get_business_db, get_rewindops_db


async def rollback_action(
    action_id: str,
    reason: str = "",
) -> dict:
    """Rollback a previously executed action by restoring the checkpointed document state.

    Args:
        action_id: The action ID to rollback.
        reason: Optional reason for the rollback (e.g., "User clarified they meant to cancel only the analytics add-on").

    Returns:
        A dict with rollback status, restored document details, and before/after comparison.
    """
    rewindops_db = get_rewindops_db()
    business_db = get_business_db()

    receipt = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not receipt:
        return {
            "status": "error",
            "error": f"Action receipt '{action_id}' not found.",
        }

    if receipt.get("execution_status") != "executed":
        return {
            "status": "error",
            "error": f"Action '{action_id}' has not been executed. Cannot rollback.",
        }

    if receipt.get("rollback_status") == "rolled_back":
        return {
            "status": "error",
            "error": f"Action '{action_id}' has already been rolled back.",
        }

    checkpoint_id = receipt.get("checkpoint_id")
    if not checkpoint_id:
        return {
            "status": "error",
            "error": f"No checkpoint found for action '{action_id}'. Rollback not available.",
        }

    checkpoint = await rewindops_db["action_checkpoints"].find_one({"_id": checkpoint_id})
    if not checkpoint:
        return {
            "status": "error",
            "error": f"Checkpoint '{checkpoint_id}' not found. Rollback not available.",
        }

    collection = checkpoint["collection"]
    document_id = checkpoint["document_id"]
    before_state = checkpoint["before_state"]

    current_doc = await business_db[collection].find_one({"_id": document_id})
    op_type = checkpoint.get("operation_type", "UPDATE").upper()

    try:
        if op_type == "INSERT":
            await business_db[collection].delete_one({"_id": document_id})
            restored_doc = None
            verification = "matched" if restored_doc == before_state else "mismatch"
        elif op_type == "DELETE":
            await business_db[collection].insert_one(before_state)
            restored_doc = await business_db[collection].find_one({"_id": document_id})
            verification = "matched" if restored_doc == before_state else "mismatch"
        else: # UPDATE
            await business_db[collection].replace_one(
                {"_id": document_id},
                before_state,
                upsert=True,
            )
            restored_doc = await business_db[collection].find_one({"_id": document_id})
            verification = "matched" if restored_doc == before_state else "mismatch"

        now = datetime.now(timezone.utc)
        rollback_event_id = f"RB-{uuid.uuid4().hex[:8].upper()}"

        rollback_event = {
            "_id": rollback_event_id,
            "action_id": action_id,
            "checkpoint_id": checkpoint_id,
            "collection": collection,
            "document_id": document_id,
            "operation_type": op_type,
            "reason": reason or "User requested rollback",
            "status": "completed",
            "verification": verification,
            "state_before_rollback": current_doc,
            "state_after_rollback": restored_doc,
            "completed_at": now.isoformat(),
        }

        await rewindops_db["rollback_events"].insert_one(rollback_event)

        await rewindops_db["action_receipts"].update_one(
            {"_id": action_id},
            {"$set": {
                "rollback_status": "rolled_back",
                "rollback_event_id": rollback_event_id,
                "rolled_back_at": now.isoformat(),
            }},
        )

        await rewindops_db["action_checkpoints"].update_one(
            {"_id": checkpoint_id},
            {"$set": {"rollback_available": False}},
        )

        changes_restored = []
        if op_type == "INSERT":
            if current_doc:
                for key, val in current_doc.items():
                    if key == "_id":
                        continue
                    changes_restored.append({
                        "field": key,
                        "was": val,
                        "restored_to": None,
                    })
        elif op_type == "DELETE":
            if before_state:
                for key, val in before_state.items():
                    if key == "_id":
                        continue
                    changes_restored.append({
                        "field": key,
                        "was": None,
                        "restored_to": val,
                    })
        else: # UPDATE
            if current_doc and before_state:
                for key in set(list(current_doc.keys()) + list(before_state.keys())):
                    if key == "_id":
                        continue
                    old_val = before_state.get(key)
                    cur_val = current_doc.get(key)
                    if old_val != cur_val:
                        changes_restored.append({
                            "field": key,
                            "was": cur_val,
                            "restored_to": old_val,
                        })

        op_msg = "restored to its pre-action state" if op_type != "INSERT" else "removed from the database"
        return {
            "status": "rolled_back",
            "rollback_event_id": rollback_event_id,
            "action_id": action_id,
            "checkpoint_id": checkpoint_id,
            "collection": collection,
            "document_id": document_id,
            "verification": verification,
            "changes_restored": changes_restored,
            "reason": reason or "User requested rollback",
            "message": (
                f"Rollback completed. Document '{document_id}' in '{collection}' "
                f"has been {op_msg}. "
                f"Verification: {verification}."
            ),
        }

    except Exception as e:
        return {
            "status": "error",
            "error": f"Rollback failed: {str(e)}",
        }
