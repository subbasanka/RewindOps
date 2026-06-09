"""Tests for the checkpoint service."""

import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_dbs():
    with patch("rewindops_agent.tools.checkpoint.get_business_db") as mock_biz, \
         patch("rewindops_agent.tools.checkpoint.get_rewindops_db") as mock_rw:

        biz_db = MagicMock()
        rw_db = MagicMock()

        test_doc = {
            "_id": "SUB-4419",
            "customer_id": "CUST-9182",
            "status": "active",
            "plan": "enterprise",
            "monthly_amount": 4999,
        }

        async def find_one(filter_dict):
            if filter_dict.get("_id") == "SUB-4419":
                return test_doc.copy()
            return None

        sub_coll = MagicMock()
        sub_coll.find_one = find_one
        biz_db.__getitem__ = lambda self, name: sub_coll

        receipts = {
            "ACT-TEST001": {
                "_id": "ACT-TEST001",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"}
            },
            "ACT-TEST002": {
                "_id": "ACT-TEST002",
                "collection": "subscriptions",
                "document_id": "SUB-NONEXISTENT",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"}
            },
            "ACT-TEST003": {
                "_id": "ACT-TEST003",
                "collection": "subscriptions",
                "document_id": "SUB-NEW-DOC",
                "operation_type": "INSERT",
                "proposed_changes": {"status": "active"}
            }
        }

        async def find_one_receipt(filter_dict):
            return receipts.get(filter_dict.get("_id"))

        async def update_one_receipt(filter_dict, update_dict):
            receipt_id = filter_dict.get("_id")
            if receipt_id in receipts:
                if "$set" in update_dict:
                    receipts[receipt_id].update(update_dict["$set"])

        inserted = []

        async def insert_one_checkpoint(doc):
            inserted.append(doc)

        def rw_getitem(self, name):
            coll = MagicMock()
            if name == "action_receipts":
                coll.find_one = find_one_receipt
                coll.update_one = update_one_receipt
            elif name == "action_checkpoints":
                coll.insert_one = insert_one_checkpoint
            return coll

        rw_db.__getitem__ = rw_getitem

        mock_biz.return_value = biz_db
        mock_rw.return_value = rw_db

        yield {"inserted": inserted, "test_doc": test_doc}


class TestCheckpoint:
    @pytest.mark.asyncio
    async def test_creates_checkpoint_successfully(self, mock_dbs):
        from rewindops_agent.tools.checkpoint import create_checkpoint

        result = await create_checkpoint(action_id="ACT-TEST001")

        assert result["status"] == "created"
        assert result["action_id"] == "ACT-TEST001"
        assert result["document_id"] == "SUB-4419"
        assert result["rollback_available"] is True
        assert result["document_count"] == 1
        assert len(mock_dbs["inserted"]) == 1
        assert mock_dbs["inserted"][0]["before_state"]["status"] == "active"

    @pytest.mark.asyncio
    async def test_returns_error_for_missing_document(self, mock_dbs):
        from rewindops_agent.tools.checkpoint import create_checkpoint

        result = await create_checkpoint(action_id="ACT-TEST002")

        assert result["status"] == "error"
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_checkpoint_insert_allows_nonexistent_document(self, mock_dbs):
        from rewindops_agent.tools.checkpoint import create_checkpoint

        result = await create_checkpoint(action_id="ACT-TEST003")

        assert result["status"] == "created"
        assert result["action_id"] == "ACT-TEST003"
        assert result["document_id"] == "SUB-NEW-DOC"
        assert result["operation_type"] == "INSERT"
        assert len(mock_dbs["inserted"]) == 1
        assert mock_dbs["inserted"][0]["before_state"] is None
