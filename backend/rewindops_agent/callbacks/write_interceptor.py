"""before_tool_callback that blocks direct MongoDB MCP writes on business collections."""

from typing import Any, Optional
from rewindops_agent.config import BLOCKED_MCP_WRITE_TOOLS


def rewindops_before_tool(
    tool,
    args: dict[str, Any],
    tool_context,
) -> Optional[dict]:
    tool_name = getattr(tool, "name", str(tool))

    if tool_name in BLOCKED_MCP_WRITE_TOOLS:
        collection = args.get("collection", "")
        database = args.get("database", "")

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
