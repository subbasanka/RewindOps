"""before_tool_callback that blocks direct MongoDB MCP writes on business collections."""

from typing import Any, Optional
from rewindops_agent.config import BLOCKED_MCP_WRITE_TOOLS


def check_blocked_aggregate_keys(item) -> bool:
    blocked_keys = {"$lookup", "$graphLookup", "$out", "$merge"}
    if isinstance(item, dict):
        for k, v in item.items():
            if k in blocked_keys:
                return True
            if check_blocked_aggregate_keys(v):
                return True
    elif isinstance(item, list):
        for val in item:
            if check_blocked_aggregate_keys(val):
                return True
    return False


def rewindops_before_tool(
    callback_context=None,
    tool=None,
    args=None,
    tool_context=None,
    **kwargs,
) -> Optional[dict]:
    tool_name = getattr(tool, "name", str(tool))
    args_dict = args or kwargs.get("args", {}) or {}

    if tool_name == "aggregate":
        pipeline = args_dict.get("pipeline", [])
        if check_blocked_aggregate_keys(pipeline):
            return {
                "status": "blocked",
                "error": (
                    "Direct use of aggregation stages '$lookup', '$graphLookup', "
                    "'$out', or '$merge' is blocked under the RewindOps safety policy."
                ),
            }

    if tool_name in BLOCKED_MCP_WRITE_TOOLS:
        collection = args_dict.get("collection", "")
        database = args_dict.get("database", "")

        if database.startswith("rewindops") or collection.startswith("rewindops"):
            return None

        return {
            "status": "blocked",
            "error": (
                f"Direct write to '{collection}' is blocked by RewindOps. "
                "You must use the RewindOps safety tools instead. "
                "Start by calling classify_risk() with the action details, "
                "then follow the checkpoint → preview → approval → execute flow."
            ),
        }

    return None
