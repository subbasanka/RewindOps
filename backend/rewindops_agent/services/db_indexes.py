"""Ensure MongoDB indexes and TTL policies on startup."""

from rewindops_agent.services.mongo_client import get_rewindops_db


async def ensure_indexes():
    """Create required indexes for performance and TTL enforcement."""
    db = get_rewindops_db()

    await db["action_receipts"].create_index("created_at")
    await db["action_receipts"].create_index("risk_level")
    await db["action_receipts"].create_index("execution_status")
    await db["action_receipts"].create_index("pipeline_state")

    await db["action_checkpoints"].create_index(
        "expires_at",
        expireAfterSeconds=0,
    )
    await db["action_checkpoints"].create_index("action_id")

    await db["rollback_events"].create_index("action_id")
