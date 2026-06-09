"""Tests for the blast radius preview service."""

import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_dbs():
    with patch("rewindops_agent.tools.blast_radius.get_business_db") as mock_biz, \
         patch("rewindops_agent.tools.blast_radius.get_rewindops_db") as mock_rw:

        biz_db = MagicMock()
        rw_db = MagicMock()

        biz_state = {
            "subscriptions": {
                "SUB-4419": {
                    "_id": "SUB-4419",
                    "customer_id": "CUST-9182",
                    "status": "active",
                    "plan": "enterprise",
                    "monthly_amount": 4999,
                    "addons": ["analytics", "priority_support"],
                },
            },
            "customers": {
                "CUST-9182": {
                    "_id": "CUST-9182",
                    "name": "Acme Corp",
                    "email": "billing@acme.com",
                    "phone": "+1-555-867-5309",
                    "status": "active",
                },
            },
        }

        receipts = {
            "ACT-UPDATE-001": {
                "_id": "ACT-UPDATE-001",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
                "pipeline_state": "checkpointed",
            },
            "ACT-INSERT-001": {
                "_id": "ACT-INSERT-001",
                "collection": "subscriptions",
                "document_id": "SUB-NEW-001",
                "operation_type": "INSERT",
                "proposed_changes": {"plan": "starter", "monthly_amount": 999, "status": "active"},
                "pipeline_state": "classified",
            },
            "ACT-DELETE-001": {
                "_id": "ACT-DELETE-001",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "DELETE",
                "proposed_changes": None,
                "pipeline_state": "checkpointed",
            },
            "ACT-PII-001": {
                "_id": "ACT-PII-001",
                "collection": "customers",
                "document_id": "CUST-9182",
                "operation_type": "UPDATE",
                "proposed_changes": {"email": "newemail@acme.com", "phone": "+1-555-000-1234"},
                "pipeline_state": "checkpointed",
            },
            "ACT-CANCEL-SUB": {
                "_id": "ACT-CANCEL-SUB",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
                "pipeline_state": "checkpointed",
            },
        }

        update_log = []

        async def rw_find_one(filter_dict):
            return receipts.get(filter_dict.get("_id"))

        async def rw_update_one(filter_dict, update_dict):
            doc_id = filter_dict.get("_id")
            update_log.append({"id": doc_id, "update": update_dict})

        def rw_getitem(name):
            coll = MagicMock()
            coll.find_one = rw_find_one
            coll.update_one = rw_update_one
            return coll

        rw_db.__getitem__ = MagicMock(side_effect=rw_getitem)

        def make_biz_collection(name):
            coll = MagicMock()

            async def find_one(filter_dict):
                col_data = biz_state.get(name, {})
                return col_data.get(filter_dict.get("_id"))

            async def count_documents(filter_dict):
                return 2

            coll.find_one = find_one
            coll.count_documents = count_documents
            return coll

        biz_db.__getitem__ = MagicMock(side_effect=make_biz_collection)

        mock_biz.return_value = biz_db
        mock_rw.return_value = rw_db

        yield {
            "biz_state": biz_state,
            "receipts": receipts,
            "update_log": update_log,
        }


class TestBlastRadius:
    @pytest.mark.asyncio
    async def test_update_preview_with_field_changes(self, mock_dbs):
        from rewindops_agent.tools.blast_radius import preview_blast_radius

        result = await preview_blast_radius(action_id="ACT-UPDATE-001")

        assert result["status"] == "preview_ready"
        assert result["action_id"] == "ACT-UPDATE-001"
        assert result["collection"] == "subscriptions"
        assert result["document_id"] == "SUB-4419"
        assert len(result["field_changes"]) == 1
        status_change = result["field_changes"][0]
        assert status_change["field"] == "status"
        assert status_change["before"] == "active"
        assert status_change["after"] == "cancelled"
        assert result["rollback_available"] is True

    @pytest.mark.asyncio
    async def test_insert_preview_no_before_state(self, mock_dbs):
        from rewindops_agent.tools.blast_radius import preview_blast_radius

        result = await preview_blast_radius(action_id="ACT-INSERT-001")

        assert result["status"] == "preview_ready"
        assert result["action_id"] == "ACT-INSERT-001"
        for change in result["field_changes"]:
            assert change["before"] is None
        field_names = [c["field"] for c in result["field_changes"]]
        assert "plan" in field_names
        assert "monthly_amount" in field_names

    @pytest.mark.asyncio
    async def test_delete_preview_all_fields_removed(self, mock_dbs):
        from rewindops_agent.tools.blast_radius import preview_blast_radius

        result = await preview_blast_radius(action_id="ACT-DELETE-001")

        assert result["status"] == "preview_ready"
        for change in result["field_changes"]:
            assert change["after"] is None
        field_names = [c["field"] for c in result["field_changes"]]
        assert "_id" in field_names
        assert "status" in field_names

    @pytest.mark.asyncio
    async def test_pii_masking_on_sensitive_fields(self, mock_dbs):
        from rewindops_agent.tools.blast_radius import preview_blast_radius

        result = await preview_blast_radius(action_id="ACT-PII-001")

        assert result["status"] == "preview_ready"
        for change in result["field_changes"]:
            if change["field"] == "email":
                assert "***" in str(change["before"])
                assert "***" in str(change["after"])
                assert change["before"] != "billing@acme.com"
                assert change["after"] != "newemail@acme.com"
            if change["field"] == "phone":
                assert "***" in str(change["before"])
                assert "***" in str(change["after"])

    @pytest.mark.asyncio
    async def test_receipt_not_found_error(self, mock_dbs):
        from rewindops_agent.tools.blast_radius import preview_blast_radius

        result = await preview_blast_radius(action_id="ACT-NONEXISTENT")

        assert result["status"] == "error"
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_business_impact_subscription_cancellation(self, mock_dbs):
        from rewindops_agent.tools.blast_radius import preview_blast_radius

        result = await preview_blast_radius(action_id="ACT-CANCEL-SUB")

        assert result["status"] == "preview_ready"
        impact_text = " ".join(result["business_impact"])
        assert "revenue" in impact_text.lower() or "decrease" in impact_text.lower()
        assert len(result["business_impact"]) > 0
