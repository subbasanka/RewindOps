"""Tests for the write interceptor callback."""

from unittest.mock import MagicMock
from rewindops_agent.callbacks.write_interceptor import rewindops_before_tool


def _make_tool(name: str) -> MagicMock:
    tool = MagicMock()
    tool.name = name
    return tool


class TestWriteInterceptor:
    def test_blocks_insert_one_on_business_collection(self):
        tool = _make_tool("insert-one")
        args = {"collection": "customers", "database": "acmesub"}

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is not None
        assert result["status"] == "blocked"
        assert "blocked by RewindOps" in result["error"]

    def test_blocks_update_one_on_business_collection(self):
        tool = _make_tool("update-one")
        args = {"collection": "subscriptions", "database": "acmesub"}

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is not None
        assert result["status"] == "blocked"
        assert "blocked by RewindOps" in result["error"]

    def test_blocks_delete_one_on_business_collection(self):
        tool = _make_tool("delete-one")
        args = {"collection": "invoices", "database": "acmesub"}

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is not None
        assert result["status"] == "blocked"
        assert "blocked by RewindOps" in result["error"]

    def test_allows_rewindops_internal_writes(self):
        tool = _make_tool("insert-one")
        args = {"collection": "action_receipts", "database": "rewindops"}

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is None

    def test_blocks_aggregate_with_out_stage(self):
        tool = _make_tool("aggregate")
        args = {
            "collection": "subscriptions",
            "database": "acmesub",
            "pipeline": [
                {"$match": {"status": "active"}},
                {"$out": "active_subscriptions_backup"},
            ],
        }

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is not None
        assert result["status"] == "blocked"
        assert "$out" in result["error"]

    def test_blocks_aggregate_with_merge_stage(self):
        tool = _make_tool("aggregate")
        args = {
            "collection": "subscriptions",
            "database": "acmesub",
            "pipeline": [
                {"$match": {"status": "active"}},
                {"$merge": {"into": "summary_collection"}},
            ],
        }

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is not None
        assert result["status"] == "blocked"
        assert "$merge" in result["error"]

    def test_allows_normal_aggregate(self):
        tool = _make_tool("aggregate")
        args = {
            "collection": "subscriptions",
            "database": "acmesub",
            "pipeline": [
                {"$match": {"status": "active"}},
                {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
            ],
        }

        result = rewindops_before_tool(tool=tool, args=args)

        assert result is None

    def test_allows_read_only_tools(self):
        for tool_name in ["find", "count", "list-collections"]:
            tool = _make_tool(tool_name)
            args = {"collection": "customers", "database": "acmesub"}

            result = rewindops_before_tool(tool=tool, args=args)

            assert result is None, f"Expected None for read-only tool '{tool_name}'"
