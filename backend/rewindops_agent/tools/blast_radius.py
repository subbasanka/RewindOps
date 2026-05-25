"""Blast radius preview — shows what will change before execution."""

from typing import Any
from rewindops_agent.services.mongo_client import get_business_db


async def preview_blast_radius(
    action_id: str,
    collection: str,
    document_id: str,
    proposed_changes: dict[str, Any],
) -> dict:
    """Generate a blast-radius preview showing before/after state and business impact.

    Args:
        action_id: The unique action ID for this operation.
        collection: The MongoDB collection being modified.
        document_id: The _id of the document being modified.
        proposed_changes: A dict of field names to their new proposed values.

    Returns:
        A dict with before/after field diffs, affected records, and business impact summary.
    """
    db = get_business_db()

    document = await db[collection].find_one({"_id": document_id})
    if not document:
        return {
            "status": "error",
            "error": f"Document '{document_id}' not found in '{collection}'.",
        }

    field_changes = []
    for field, new_value in proposed_changes.items():
        old_value = document.get(field)
        if old_value != new_value:
            field_changes.append({
                "field": field,
                "before": old_value,
                "after": new_value,
            })

    affected_records = [f"{collection}/{document_id}"]
    business_impact = []

    if collection == "subscriptions":
        if "status" in proposed_changes:
            old_status = document.get("status")
            new_status = proposed_changes["status"]
            if old_status == "active" and new_status == "cancelled":
                amount = document.get("monthly_amount", 0)
                business_impact.append(f"Monthly recurring revenue will decrease by ${amount/100:.2f}")
                business_impact.append("Customer will lose access to subscription features")

                if document.get("addons"):
                    business_impact.append(f"Add-ons will be removed: {', '.join(document['addons'])}")

        if "renewal_date" in proposed_changes and proposed_changes["renewal_date"] is None:
            business_impact.append("Automatic renewal will be disabled")

        customer_id = document.get("customer_id")
        if customer_id:
            invoice_count = await db["invoices"].count_documents({
                "subscription_id": document_id,
                "status": "paid",
                "refund_status": "not_refunded",
            })
            if invoice_count > 0:
                affected_records.append(f"invoices (x{invoice_count} related)")
                business_impact.append(f"{invoice_count} paid invoice(s) may need refund review")

    elif collection == "invoices":
        if "refund_status" in proposed_changes:
            amount = document.get("amount", 0)
            business_impact.append(f"Refund of ${amount/100:.2f} will be processed")
            business_impact.append("Revenue adjustment will be recorded")

    elif collection == "customers":
        if "status" in proposed_changes:
            sub_count = await db["subscriptions"].count_documents({
                "customer_id": document_id,
                "status": "active",
            })
            if sub_count > 0:
                affected_records.append(f"subscriptions (x{sub_count} active)")
                business_impact.append(f"{sub_count} active subscription(s) may be affected")

    if not business_impact:
        business_impact.append("Standard data modification with no critical business impact detected")

    return {
        "status": "preview_ready",
        "action_id": action_id,
        "collection": collection,
        "document_id": document_id,
        "field_changes": field_changes,
        "affected_records": affected_records,
        "business_impact": business_impact,
        "rollback_available": True,
        "summary": (
            f"This action will modify {len(field_changes)} field(s) in {collection}/{document_id}. "
            f"{len(affected_records)} record(s) affected. "
            "Rollback is available because a checkpoint has been created."
        ),
    }
