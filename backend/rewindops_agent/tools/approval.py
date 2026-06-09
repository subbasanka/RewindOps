"""Approval gate — returns structured approval request for the frontend."""

from rewindops_agent.services.mongo_client import get_rewindops_db


async def request_approval(
    action_id: str,
) -> dict:
    """Request human approval for a risky action. This updates the action receipt to pending and returns approval card data for the UI.
       Loads all details dynamically from the receipt.

    Args:
        action_id: The unique action ID.

    Returns:
        A dict with the approval card data. The agent should present this to the user and wait for their decision.
    """
    rewindops_db = get_rewindops_db()

    receipt = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not receipt:
        return {
            "status": "error",
            "error": f"Action receipt '{action_id}' not found. Cannot request approval.",
        }

    valid_states = ("previewed", "checkpointed", "classified")
    if receipt.get("pipeline_state") not in valid_states:
        return {
            "status": "error",
            "error": (
                f"Action '{action_id}' is in state '{receipt.get('pipeline_state')}'. "
                "Approval request requires the action to be in a pre-execution state."
            ),
        }

    action_type = receipt["action_type"]
    collection = receipt["collection"]
    document_id = receipt["document_id"]
    risk_level = receipt["risk_level"]
    risk_score = receipt["risk_score"]
    field_changes = receipt.get("field_changes", [])
    business_impact = receipt.get("business_impact", [])
    blast_radius_summary = receipt.get("blast_radius_summary", "")
    checkpoint_id = receipt.get("checkpoint_id", "")

    # Ensure receipt status is updated to pending approval state
    await rewindops_db["action_receipts"].update_one(
        {"_id": action_id},
        {"$set": {
            "approval_required": True,
            "approval_status": "pending",
            "pipeline_state": "awaiting_approval",
        }}
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
