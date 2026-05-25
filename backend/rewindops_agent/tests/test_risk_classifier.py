"""Tests for the deterministic risk classifier."""

import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_mongo():
    with patch("rewindops_agent.tools.risk_classifier.get_business_db") as mock_db:
        db = MagicMock()

        async def find_one_sub(filter_dict):
            if filter_dict.get("_id") == "SUB-4419":
                return {
                    "_id": "SUB-4419",
                    "customer_id": "CUST-9182",
                    "status": "active",
                    "plan": "enterprise",
                    "monthly_amount": 4999,
                }
            return None

        async def find_one_cust(filter_dict):
            if filter_dict.get("_id") == "CUST-9182":
                return {
                    "_id": "CUST-9182",
                    "name": "Acme Robotics",
                    "tier": "enterprise",
                }
            return None

        sub_coll = MagicMock()
        sub_coll.find_one = find_one_sub
        cust_coll = MagicMock()
        cust_coll.find_one = find_one_cust

        def getitem(self, name):
            if name == "subscriptions":
                return sub_coll
            if name == "customers":
                return cust_coll
            return MagicMock()

        db.__getitem__ = getitem
        mock_db.return_value = db
        yield mock_db


class TestRiskClassifier:
    @pytest.mark.asyncio
    async def test_dangerous_action_blocked(self):
        from rewindops_agent.tools.risk_classifier import classify_risk

        result = await classify_risk(
            action_type="delete_customer",
            collection="customers",
            document_id="CUST-9182",
            proposed_changes={},
        )

        assert result["status"] == "blocked"
        assert result["risk_level"] == "critical"
        assert result["decision"] == "BLOCK"

    @pytest.mark.asyncio
    async def test_enterprise_subscription_cancel_is_high_risk(self):
        from rewindops_agent.tools.risk_classifier import classify_risk

        result = await classify_risk(
            action_type="cancel_subscription",
            collection="subscriptions",
            document_id="SUB-4419",
            proposed_changes={"status": "cancelled", "renewal_date": None},
        )

        assert result["risk_level"] == "high"
        assert result["approval_required"] is True
        assert result["checkpoint_required"] is True
        assert result["decision"] == "HOLD_FOR_APPROVAL"

    @pytest.mark.asyncio
    async def test_low_risk_action(self):
        from rewindops_agent.tools.risk_classifier import classify_risk

        result = await classify_risk(
            action_type="create_support_ticket",
            collection="support_tickets",
            document_id="TICKET-001",
            proposed_changes={"subject": "Help needed"},
        )

        assert result["risk_level"] == "low"
        assert result["approval_required"] is False
        assert result["decision"] == "ALLOW"

    @pytest.mark.asyncio
    async def test_refund_action_adds_risk(self):
        from rewindops_agent.tools.risk_classifier import classify_risk

        result = await classify_risk(
            action_type="refund_invoice",
            collection="invoices",
            document_id="INV-5521",
            proposed_changes={"refund_status": "refunded"},
        )

        assert result["risk_level"] in ("medium", "high")
        assert result["checkpoint_required"] is True

    @pytest.mark.asyncio
    async def test_rollback_available_reduces_score(self):
        from rewindops_agent.tools.risk_classifier import classify_risk

        result = await classify_risk(
            action_type="update_preference",
            collection="customers",
            document_id="CUST-3041",
            proposed_changes={"timezone": "UTC"},
        )

        assert result["rollback_supported"] is True
        reasons_text = " ".join(result["reasons"])
        assert "Rollback" in reasons_text
        assert "-10" in reasons_text
