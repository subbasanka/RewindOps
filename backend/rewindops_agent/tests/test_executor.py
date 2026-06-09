"""Tests for the executor service."""

import pytest
from unittest.mock import MagicMock, patch


APPROVED_RECEIPT_UPDATE = {
    "_id": "ACT-EXEC-001",
    "approval_status": "approved",
    "execution_status": "executing",
    "collection": "subscriptions",
    "document_id": "SUB-4419",
    "operation_type": "UPDATE",
    "proposed_changes": {"status": "cancelled"},
    "checkpoint_id": "CHK-001",
}

APPROVED_RECEIPT_INSERT = {
    "_id": "ACT-EXEC-002",
    "approval_status": "approved",
    "execution_status": "executing",
    "collection": "subscriptions",
    "document_id": "SUB-NEW-001",
    "operation_type": "INSERT",
    "proposed_changes": {"plan": "starter", "monthly_amount": 999},
    "checkpoint_id": "CHK-002",
}

APPROVED_RECEIPT_DELETE = {
    "_id": "ACT-EXEC-003",
    "approval_status": "approved",
    "execution_status": "executing",
    "collection": "subscriptions",
    "document_id": "SUB-4419",
    "operation_type": "DELETE",
    "proposed_changes": {},
    "checkpoint_id": "CHK-003",
}


@pytest.fixture(autouse=True)
def mock_dbs():
    with patch("rewindops_agent.tools.executor.get_business_db") as mock_biz, \
         patch("rewindops_agent.tools.executor.get_rewindops_db") as mock_rw:

        biz_db = MagicMock()
        rw_db = MagicMock()

        biz_state = {
            "SUB-4419": {
                "_id": "SUB-4419",
                "customer_id": "CUST-9182",
                "status": "active",
                "plan": "enterprise",
                "monthly_amount": 4999,
            },
        }

        receipts = {
            "ACT-EXEC-001": {
                "_id": "ACT-EXEC-001",
                "approval_status": "approved",
                "execution_status": "pending",
                "pipeline_state": "approved",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
                "checkpoint_id": "CHK-001",
            },
            "ACT-EXEC-002": {
                "_id": "ACT-EXEC-002",
                "approval_status": "approved",
                "execution_status": "pending",
                "pipeline_state": "approved",
                "collection": "subscriptions",
                "document_id": "SUB-NEW-001",
                "operation_type": "INSERT",
                "proposed_changes": {"plan": "starter", "monthly_amount": 999},
                "checkpoint_id": "CHK-002",
            },
            "ACT-EXEC-003": {
                "_id": "ACT-EXEC-003",
                "approval_status": "approved",
                "execution_status": "pending",
                "pipeline_state": "approved",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "DELETE",
                "proposed_changes": {},
                "checkpoint_id": "CHK-003",
            },
            "ACT-NOT-APPROVED": {
                "_id": "ACT-NOT-APPROVED",
                "approval_status": "pending",
                "execution_status": "pending",
                "pipeline_state": "previewed",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
            },
            "ACT-ALREADY-EXECUTED": {
                "_id": "ACT-ALREADY-EXECUTED",
                "approval_status": "approved",
                "execution_status": "executed",
                "pipeline_state": "executed",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
            },
            "ACT-NO-MATCH": {
                "_id": "ACT-NO-MATCH",
                "approval_status": "approved",
                "execution_status": "pending",
                "pipeline_state": "approved",
                "collection": "subscriptions",
                "document_id": "SUB-GONE",
                "operation_type": "UPDATE",
                "proposed_changes": {"status": "cancelled"},
                "checkpoint_id": "CHK-GONE",
            },
        }

        update_log = []

        async def rw_find_one_and_update(filter_dict, update_dict, return_document=None):
            doc_id = filter_dict.get("_id")
            receipt = receipts.get(doc_id)
            if not receipt:
                return None
            if (filter_dict.get("approval_status") == receipt.get("approval_status") and
                    filter_dict.get("execution_status") == receipt.get("execution_status")):
                if "$set" in update_dict:
                    receipt.update(update_dict["$set"])
                return receipt
            return None

        async def rw_find_one(filter_dict):
            return receipts.get(filter_dict.get("_id"))

        async def rw_update_one(filter_dict, update_dict):
            doc_id = filter_dict.get("_id")
            update_log.append({"id": doc_id, "update": update_dict})
            if doc_id in receipts and "$set" in update_dict:
                receipts[doc_id].update(update_dict["$set"])

        def rw_getitem(self, name):
            coll = MagicMock()
            coll.find_one_and_update = rw_find_one_and_update
            coll.find_one = rw_find_one
            coll.update_one = rw_update_one
            return coll

        rw_db.__getitem__ = rw_getitem

        update_result_match = MagicMock()
        update_result_match.matched_count = 1

        update_result_nomatch = MagicMock()
        update_result_nomatch.matched_count = 0

        async def biz_update_one(filter_dict, update_dict):
            doc_id = filter_dict.get("_id")
            if doc_id in biz_state:
                if "$set" in update_dict:
                    biz_state[doc_id].update(update_dict["$set"])
                return update_result_match
            return update_result_nomatch

        async def biz_insert_one(document):
            doc_id = document.get("_id")
            biz_state[doc_id] = document

        async def biz_delete_one(filter_dict):
            doc_id = filter_dict.get("_id")
            if doc_id in biz_state:
                del biz_state[doc_id]

        async def biz_find_one(filter_dict):
            return biz_state.get(filter_dict.get("_id"))

        def biz_getitem(self, name):
            coll = MagicMock()
            coll.update_one = biz_update_one
            coll.insert_one = biz_insert_one
            coll.delete_one = biz_delete_one
            coll.find_one = biz_find_one
            return coll

        biz_db.__getitem__ = biz_getitem

        mock_biz.return_value = biz_db
        mock_rw.return_value = rw_db

        yield {
            "biz_state": biz_state,
            "receipts": receipts,
            "update_log": update_log,
        }


class TestExecutor:
    @pytest.mark.asyncio
    async def test_successful_update_execution(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        result = await execute_action(action_id="ACT-EXEC-001")

        assert result["status"] == "executed"
        assert result["action_id"] == "ACT-EXEC-001"
        assert result["collection"] == "subscriptions"
        assert result["document_id"] == "SUB-4419"
        assert result["rollback_available"] is True
        assert result["checkpoint_id"] == "CHK-001"
        assert mock_dbs["biz_state"]["SUB-4419"]["status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_successful_insert_execution(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        result = await execute_action(action_id="ACT-EXEC-002")

        assert result["status"] == "executed"
        assert result["action_id"] == "ACT-EXEC-002"
        assert result["document_id"] == "SUB-NEW-001"
        assert "SUB-NEW-001" in mock_dbs["biz_state"]
        assert mock_dbs["biz_state"]["SUB-NEW-001"]["plan"] == "starter"

    @pytest.mark.asyncio
    async def test_successful_delete_execution(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        assert "SUB-4419" in mock_dbs["biz_state"]

        result = await execute_action(action_id="ACT-EXEC-003")

        assert result["status"] == "executed"
        assert result["action_id"] == "ACT-EXEC-003"
        assert result["changes_applied"] == {}
        assert "SUB-4419" not in mock_dbs["biz_state"]

    @pytest.mark.asyncio
    async def test_execution_fails_when_not_approved(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        result = await execute_action(action_id="ACT-NOT-APPROVED")

        assert result["status"] == "error"
        assert "has not been approved" in result["error"]
        assert "pending" in result["error"]

    @pytest.mark.asyncio
    async def test_execution_fails_when_already_executed(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        result = await execute_action(action_id="ACT-ALREADY-EXECUTED")

        assert result["status"] == "error"
        assert "pipeline state" in result["error"].lower() or "executed" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_execution_fails_when_receipt_not_found(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        result = await execute_action(action_id="ACT-NONEXISTENT")

        assert result["status"] == "error"
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_execution_fails_when_document_not_found_for_update(self, mock_dbs):
        from rewindops_agent.tools.executor import execute_action

        result = await execute_action(action_id="ACT-NO-MATCH")

        assert result["status"] == "error"
        assert "not found" in result["error"]
        assert "SUB-GONE" in result["error"]
        assert mock_dbs["receipts"]["ACT-NO-MATCH"]["execution_status"] == "failed"
