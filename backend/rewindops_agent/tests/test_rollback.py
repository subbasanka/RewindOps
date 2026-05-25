"""Tests for the rollback service."""

import pytest
from unittest.mock import MagicMock, patch


ORIGINAL_DOC = {
    "_id": "SUB-4419",
    "customer_id": "CUST-9182",
    "status": "active",
    "plan": "enterprise",
    "monthly_amount": 4999,
    "addons": ["analytics", "priority_support"],
}

MODIFIED_DOC = {
    "_id": "SUB-4419",
    "customer_id": "CUST-9182",
    "status": "cancelled",
    "plan": "enterprise",
    "monthly_amount": 4999,
    "addons": ["analytics", "priority_support"],
}


@pytest.fixture(autouse=True)
def mock_dbs():
    with patch("rewindops_agent.tools.rollback.get_business_db") as mock_biz, \
         patch("rewindops_agent.tools.rollback.get_rewindops_db") as mock_rw:

        biz_db = MagicMock()
        rw_db = MagicMock()

        current_biz_state = {
            "SUB-4419": MODIFIED_DOC.copy(),
            "SUB-NEW-DOC": {"_id": "SUB-NEW-DOC", "status": "active"},
        }

        async def biz_find_one(filter_dict):
            return current_biz_state.get(filter_dict.get("_id"))

        async def biz_replace_one(filter_dict, replacement, upsert=False):
            doc_id = filter_dict.get("_id")
            current_biz_state[doc_id] = replacement

        async def biz_delete_one(filter_dict):
            doc_id = filter_dict.get("_id")
            if doc_id in current_biz_state:
                del current_biz_state[doc_id]

        async def biz_insert_one(document):
            doc_id = document.get("_id")
            current_biz_state[doc_id] = document

        sub_coll = MagicMock()
        sub_coll.find_one = biz_find_one
        sub_coll.replace_one = biz_replace_one
        sub_coll.delete_one = biz_delete_one
        sub_coll.insert_one = biz_insert_one
        biz_db.__getitem__ = lambda self, name: sub_coll

        receipts = {
            "ACT-TEST001": {
                "_id": "ACT-TEST001",
                "execution_status": "executed",
                "rollback_status": "available",
                "checkpoint_id": "CHK-TEST001",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
            },
            "ACT-ALREADY-ROLLED": {
                "_id": "ACT-ALREADY-ROLLED",
                "execution_status": "executed",
                "rollback_status": "rolled_back",
                "checkpoint_id": "CHK-TEST002",
            },
            "ACT-INSERT": {
                "_id": "ACT-INSERT",
                "execution_status": "executed",
                "rollback_status": "available",
                "checkpoint_id": "CHK-INSERT",
                "collection": "subscriptions",
                "document_id": "SUB-NEW-DOC",
            },
            "ACT-DELETE": {
                "_id": "ACT-DELETE",
                "execution_status": "executed",
                "rollback_status": "available",
                "checkpoint_id": "CHK-DELETE",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
            },
        }

        checkpoints = {
            "CHK-TEST001": {
                "_id": "CHK-TEST001",
                "action_id": "ACT-TEST001",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "before_state": ORIGINAL_DOC.copy(),
            },
            "CHK-TEST002": {
                "_id": "CHK-TEST002",
                "action_id": "ACT-ALREADY-ROLLED",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "UPDATE",
                "before_state": ORIGINAL_DOC.copy(),
            },
            "CHK-INSERT": {
                "_id": "CHK-INSERT",
                "action_id": "ACT-INSERT",
                "collection": "subscriptions",
                "document_id": "SUB-NEW-DOC",
                "operation_type": "INSERT",
                "before_state": None,
            },
            "CHK-DELETE": {
                "_id": "CHK-DELETE",
                "action_id": "ACT-DELETE",
                "collection": "subscriptions",
                "document_id": "SUB-4419",
                "operation_type": "DELETE",
                "before_state": ORIGINAL_DOC.copy(),
            },
        }

        inserted_rollbacks = []

        def rw_getitem(self, name):
            coll = MagicMock()

            async def find_one(filter_dict):
                doc_id = filter_dict.get("_id")
                if name == "action_receipts":
                    return receipts.get(doc_id)
                if name == "action_checkpoints":
                    return checkpoints.get(doc_id)
                return None

            async def insert_one(doc):
                inserted_rollbacks.append(doc)

            async def update_one(filter_dict, update):
                pass

            coll.find_one = find_one
            coll.insert_one = insert_one
            coll.update_one = update_one
            return coll

        rw_db.__getitem__ = rw_getitem

        mock_biz.return_value = biz_db
        mock_rw.return_value = rw_db

        yield {
            "current_biz_state": current_biz_state,
            "inserted_rollbacks": inserted_rollbacks,
        }


class TestRollback:
    @pytest.mark.asyncio
    async def test_successful_rollback(self, mock_dbs):
        from rewindops_agent.tools.rollback import rollback_action

        result = await rollback_action(
            action_id="ACT-TEST001",
            reason="User made a mistake",
        )

        assert result["status"] == "rolled_back"
        assert result["action_id"] == "ACT-TEST001"
        assert result["verification"] == "matched"
        assert result["collection"] == "subscriptions"
        assert result["document_id"] == "SUB-4419"
        assert mock_dbs["current_biz_state"]["SUB-4419"]["status"] == "active"
        assert len(mock_dbs["inserted_rollbacks"]) == 1

    @pytest.mark.asyncio
    async def test_cannot_rollback_already_rolled_back(self, mock_dbs):
        from rewindops_agent.tools.rollback import rollback_action

        result = await rollback_action(action_id="ACT-ALREADY-ROLLED")

        assert result["status"] == "error"
        assert "already been rolled back" in result["error"]

    @pytest.mark.asyncio
    async def test_cannot_rollback_nonexistent_action(self, mock_dbs):
        from rewindops_agent.tools.rollback import rollback_action

        result = await rollback_action(action_id="ACT-NONEXISTENT")

        assert result["status"] == "error"
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_rollback_insert_deletes_document(self, mock_dbs):
        from rewindops_agent.tools.rollback import rollback_action

        # SUB-NEW-DOC exists in mock current_biz_state before rollback
        assert "SUB-NEW-DOC" in mock_dbs["current_biz_state"]

        result = await rollback_action(action_id="ACT-INSERT")

        assert result["status"] == "rolled_back"
        assert result["action_id"] == "ACT-INSERT"
        # The new document should have been DELETED from business state
        assert "SUB-NEW-DOC" not in mock_dbs["current_biz_state"]
        assert len(result["changes_restored"]) > 0
        assert result["changes_restored"][0]["restored_to"] is None

    @pytest.mark.asyncio
    async def test_rollback_delete_reinserts_document(self, mock_dbs):
        from rewindops_agent.tools.rollback import rollback_action

        # Let's delete SUB-4419 first to simulate it being deleted
        del mock_dbs["current_biz_state"]["SUB-4419"]
        assert "SUB-4419" not in mock_dbs["current_biz_state"]

        result = await rollback_action(action_id="ACT-DELETE")

        assert result["status"] == "rolled_back"
        assert result["action_id"] == "ACT-DELETE"
        # The document should have been RE-INSERTED
        assert "SUB-4419" in mock_dbs["current_biz_state"]
        assert mock_dbs["current_biz_state"]["SUB-4419"]["status"] == "active"
        assert len(result["changes_restored"]) > 0
        assert result["changes_restored"][0]["was"] is None
