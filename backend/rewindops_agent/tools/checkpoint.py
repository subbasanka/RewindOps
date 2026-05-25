"""Checkpoint service — snapshots MongoDB documents before risky writes."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from rewindops_agent.services.mongo_client import get_business_db, get_rewindops_db


async def create_checkpoint(
    action_id: str,
    collection: str,
    document_id: str,
    operation_type: str = "UPDATE",
) -> dict:
    """Create a checkpoint by snapshotting the current state of a document before modification.

    Args:
        action_id: The unique action ID for this operation.
        collection: The MongoDB collection containing the document.
        document_id: The _id of the document to snapshot.
        operation_type: The type of operation (INSERT, UPDATE, DELETE). Defaults to UPDATE.

    Returns:
        A dict with checkpoint_id, status, and document snapshot metadata.
    """
    business_db = get_business_db()
    rewindops_db = get_rewindops_db()

    before_state = None
    op_upper = operation_type.upper()

    if op_upper in ("UPDATE", "DELETE"):
        document = await business_db[collection].find_one({"_id": document_id})
        if not document:
            return {
                "status": "error",
                "error": (
                    f"Document '{document_id}' not found in '{collection}'. "
                    f"Cannot create checkpoint for operation {op_upper}."
                ),
            }
        before_state = document

    checkpoint_id = f"CHK-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc)

    checkpoint = {
        "_id": checkpoint_id,
        "action_id": action_id,
        "collection": collection,
        "document_id": document_id,
        "operation_type": op_upper,
        "before_state": before_state,
        "document_count": 1,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=7)).isoformat(),
        "rollback_available": True,
    }

    await rewindops_db["action_checkpoints"].insert_one(checkpoint)

    op_msg = "snapshotted" if op_upper != "INSERT" else "marked for insertion rollback"
    return {
        "status": "created",
        "checkpoint_id": checkpoint_id,
        "action_id": action_id,
        "collection": collection,
        "document_id": document_id,
        "operation_type": op_upper,
        "document_count": 1,
        "rollback_available": True,
        "message": f"Checkpoint {checkpoint_id} created ({op_upper}). Document '{document_id}' in '{collection}' has been {op_msg}.",
    }
