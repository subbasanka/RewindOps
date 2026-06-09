"""Tests for the approve_action service."""

import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_dbs():
    with patch("rewindops_agent.tools.approve_action.get_rewindops_db") as mock_rw:

        rw_db = MagicMock()

        receipts = {
            "ACT-PENDING-001": {
                "_id": "ACT-PENDING-001",
                "approval_status": "pending",
                "execution_status": "pending",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
            },
            "ACT-PENDING-002": {
                "_id": "ACT-PENDING-002",
                "approval_status": "pending",
                "execution_status": "pending",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"plan": "basic"},
            },
            "ACT-ALREADY-APPROVED": {
                "_id": "ACT-ALREADY-APPROVED",
                "approval_status": "approved",
                "execution_status": "pending",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
            },
        }

        update_log = []

        async def rw_find_one(filter_dict):
            return receipts.get(filter_dict.get("_id"))

        async def rw_update_one(filter_dict, update_dict):
            doc_id = filter_dict.get("_id")
            update_log.append({"id": doc_id, "update": update_dict})
            if doc_id in receipts and "$set" in update_dict:
                receipts[doc_id].update(update_dict["$set"])

        def rw_getitem(self, name):
            coll = MagicMock()
            coll.find_one = rw_find_one
            coll.update_one = rw_update_one
            return coll

        rw_db.__getitem__ = rw_getitem

        mock_rw.return_value = rw_db

        yield {
            "receipts": receipts,
            "update_log": update_log,
        }


class TestApproveAction:
    @pytest.mark.asyncio
    async def test_successful_approval(self, mock_dbs):
        from rewindops_agent.tools.approve_action import approve_action

        result = await approve_action(action_id="ACT-PENDING-001", approved=True)

        assert result["status"] == "approved"
        assert result["action_id"] == "ACT-PENDING-001"
        assert "APPROVED" in result["message"]
        assert mock_dbs["receipts"]["ACT-PENDING-001"]["approval_status"] == "approved"
        assert mock_dbs["receipts"]["ACT-PENDING-001"]["approved_by"] == "demo-user"

    @pytest.mark.asyncio
    async def test_successful_rejection(self, mock_dbs):
        from rewindops_agent.tools.approve_action import approve_action

        result = await approve_action(action_id="ACT-PENDING-002", approved=False)

        assert result["status"] == "rejected"
        assert result["action_id"] == "ACT-PENDING-002"
        assert "REJECTED" in result["message"]
        assert mock_dbs["receipts"]["ACT-PENDING-002"]["approval_status"] == "rejected"
        assert mock_dbs["receipts"]["ACT-PENDING-002"]["execution_status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_approval_fails_when_receipt_not_found(self, mock_dbs):
        from rewindops_agent.tools.approve_action import approve_action

        result = await approve_action(action_id="ACT-NONEXISTENT", approved=True)

        assert result["status"] == "error"
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_approval_fails_when_not_in_pending_state(self, mock_dbs):
        from rewindops_agent.tools.approve_action import approve_action

        result = await approve_action(action_id="ACT-ALREADY-APPROVED", approved=True)

        assert result["status"] == "error"
        assert "not pending approval" in result["error"]
        assert "approved" in result["error"]
