"""Blast radius preview — shows what will change before execution."""

from typing import Any
from rewindops_agent.config import SENSITIVE_FIELDS
from rewindops_agent.services.mongo_client import get_business_db, get_rewindops_db


def mask_value(val: Any) -> Any:
    if not isinstance(val, str):
        return val
    if "@" in val:  # Email masking
        parts = val.split("@")
        if len(parts) == 2:
            username, domain = parts
            if len(username) > 1:
                return f"{username[0]}***{username[-1]}@{domain}"
            return f"***@{domain}"
    if len(val) > 4:
        return f"{val[:2]}***{val[-2:]}"
    return "***"


async def preview_blast_radius(
    action_id: str,
) -> dict:
    """Generate a blast-radius preview showing before/after state and business impact.
       Loads context from the action receipt and applies PII masking to sensitive fields.

    Args:
        action_id: The unique action ID for this operation.

    Returns:
        A dict with before/after field diffs, affected records, and business impact summary.
    """
    db = get_business_db()
    rewindops_db = get_rewindops_db()

    receipt = await rewindops_db["action_receipts"].find_one({"_id": action_id})
    if not receipt:
        return {
            "status": "error",
            "error": f"Action receipt '{action_id}' not found. Cannot preview blast radius.",
        }

    if receipt.get("pipeline_state") not in ("checkpointed", "classified"):
        return {
            "status": "error",
            "error": (
                f"Action '{action_id}' is in state '{receipt.get('pipeline_state')}'. "
                "Blast radius preview requires the action to be in 'classified' or 'checkpointed' state."
            ),
        }

    collection = receipt["collection"]
    document_id = receipt["document_id"]
    proposed_changes = receipt["proposed_changes"] or {}
    op_type = receipt.get("operation_type", "UPDATE").upper()

    field_changes = []

    if op_type == "INSERT":
        # INSERT has no previous doc, all changes are new
        for field, new_value in proposed_changes.items():
            field_changes.append({
                "field": field,
                "before": None,
                "after": new_value,
            })
    elif op_type == "DELETE":
        # DELETE will remove the document entirely
        document = await db[collection].find_one({"_id": document_id})
        if document:
            for field, old_value in document.items():
                field_changes.append({
                    "field": field,
                    "before": old_value,
                    "after": None,
                })
    else:  # UPDATE
        document = await db[collection].find_one({"_id": document_id})
        if not document:
            return {
                "status": "error",
                "error": f"Document '{document_id}' not found in '{collection}'. Cannot preview blast radius.",
            }

        for field, new_value in proposed_changes.items():
            old_value = document.get(field)
            if old_value != new_value:
                field_changes.append({
                    "field": field,
                    "before": old_value,
                    "after": new_value,
                })

    # Apply PII Masking to field changes diff
    masked_field_changes = []
    for change in field_changes:
        field_name = change["field"]
        before_val = change["before"]
        after_val = change["after"]

        if field_name in SENSITIVE_FIELDS:
            before_val = mask_value(before_val)
            after_val = mask_value(after_val)

        masked_field_changes.append({
            "field": field_name,
            "before": before_val,
            "after": after_val,
        })

    affected_records = [f"{collection}/{document_id}"]
    business_impact = []

    if collection == "subscriptions":
        if op_type == "DELETE":
            business_impact.append("Subscription will be permanently deleted from the database")
        elif "status" in proposed_changes:
            # We check the status field on update
            # Retrieve document status safely
            document = await db[collection].find_one({"_id": document_id})
            old_status = document.get("status") if document else None
            new_status = proposed_changes["status"]
            if old_status == "active" and new_status == "cancelled":
                amount = document.get("monthly_amount", 0) if document else 0
                business_impact.append(f"Monthly recurring revenue will decrease by ${amount/100:.2f}")
                business_impact.append("Customer will lose access to subscription features")

                if document and document.get("addons"):
                    business_impact.append(f"Add-ons will be removed: {', '.join(document['addons'])}")

        if "renewal_date" in proposed_changes and proposed_changes["renewal_date"] is None:
            business_impact.append("Automatic renewal will be disabled")

        if op_type != "INSERT":
            # For UPDATE and DELETE, check associated invoices
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
            # Check the amount of the invoice
            document = await db[collection].find_one({"_id": document_id})
            amount = document.get("amount", 0) if document else 0
            business_impact.append(f"Refund of ${amount/100:.2f} will be processed")
            business_impact.append("Revenue adjustment will be recorded")

    elif collection == "customers":
        if op_type == "DELETE":
            business_impact.append("Customer profile and all associated data will be deleted")
        elif "status" in proposed_changes:
            sub_count = await db["subscriptions"].count_documents({
                "customer_id": document_id,
                "status": "active",
            })
            if sub_count > 0:
                affected_records.append(f"subscriptions (x{sub_count} active)")
                business_impact.append(f"{sub_count} active subscription(s) may be affected")

    if not business_impact:
        business_impact.append("Standard data modification with no critical business impact detected")

    summary = (
        f"This action will modify {len(masked_field_changes)} field(s) in {collection}/{document_id}. "
        f"{len(affected_records)} record(s) affected. "
        "Rollback is available because a checkpoint has been created."
    )

    # Persist the generated details back to the database receipt
    await rewindops_db["action_receipts"].update_one(
        {"_id": action_id},
        {"$set": {
            "field_changes": masked_field_changes,
            "business_impact": business_impact,
            "blast_radius_summary": summary,
            "pipeline_state": "previewed",
        }}
    )

    return {
        "status": "preview_ready",
        "action_id": action_id,
        "collection": collection,
        "document_id": document_id,
        "field_changes": masked_field_changes,
        "affected_records": affected_records,
        "business_impact": business_impact,
        "rollback_available": True,
        "summary": summary,
    }
