"""FastAPI server that bridges the Next.js frontend to the ADK agent.

Exposes:
  POST /run_sse         — SSE stream for agent chat (matches ADK's run_sse contract)
  GET  /api/actions     — list action receipts from MongoDB
  GET  /api/actions/:id — get single action detail with checkpoint/rollback
  POST /api/actions/:id/rollback — trigger rollback directly (bypasses agent)
"""

import asyncio
import json
import uuid
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from rewindops_agent.config import BACKEND_PORT, BACKEND_HOST
from rewindops_agent.services.mongo_client import get_rewindops_db
from rewindops_agent.tools.rollback import rollback_action
from rewindops_agent.tools.history import list_action_history, get_action_detail

app = FastAPI(title="RewindOps AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_adk_runner = None
_session_service = None


async def _get_adk():
    """Lazy-init ADK runner and session service."""
    global _adk_runner, _session_service
    if _adk_runner is None:
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from rewindops_agent.agent import root_agent

        _session_service = InMemorySessionService()
        _adk_runner = Runner(
            agent=root_agent,
            app_name="rewindops_agent",
            session_service=_session_service,
        )
    return _adk_runner, _session_service


# ---------------------------------------------------------------------------
# POST /run_sse  —  Agent chat via SSE
# ---------------------------------------------------------------------------
@app.post("/run_sse")
async def run_sse(request: Request):
    body = await request.json()
    user_id = body.get("user_id", "demo-user")
    session_id = body.get("session_id", str(uuid.uuid4()))
    new_message = body.get("new_message", {})
    user_text = ""
    for part in new_message.get("parts", []):
        if "text" in part:
            user_text += part["text"]

    if not user_text:
        return JSONResponse({"error": "No message text"}, status_code=400)

    runner, session_service = await _get_adk()

    session = await session_service.get_session(
        app_name="rewindops_agent",
        user_id=user_id,
        session_id=session_id,
    )
    if session is None:
        session = await session_service.create_session(
            app_name="rewindops_agent",
            user_id=user_id,
            session_id=session_id,
        )

    from google.genai import types as genai_types

    user_content = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=user_text)],
    )

    async def event_stream():
        try:
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=user_content,
            ):
                if event.content and event.content.parts:
                    parts_data = []
                    for part in event.content.parts:
                        part_dict = {}
                        if part.text:
                            part_dict["text"] = part.text
                        if hasattr(part, "function_call") and part.function_call:
                            part_dict["functionCall"] = {
                                "name": part.function_call.name,
                                "args": dict(part.function_call.args) if part.function_call.args else {},
                            }
                        if hasattr(part, "function_response") and part.function_response:
                            resp_data = part.function_response.response
                            if isinstance(resp_data, dict):
                                serializable = resp_data
                            else:
                                serializable = str(resp_data)
                            part_dict["functionResponse"] = {
                                "name": part.function_response.name,
                                "response": serializable,
                            }
                        if part_dict:
                            parts_data.append(part_dict)

                    if parts_data:
                        payload = {
                            "content": {
                                "role": event.content.role or "model",
                                "parts": parts_data,
                            },
                            "author": getattr(event, "author", "agent"),
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/actions  —  List action history
# ---------------------------------------------------------------------------
@app.get("/api/actions")
async def api_list_actions(
    limit: int = 20,
    risk_level: Optional[str] = None,
    status: Optional[str] = None,
):
    result = await list_action_history(
        limit=limit,
        risk_level_filter=risk_level,
        status_filter=status,
    )
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# GET /api/actions/{action_id}  —  Get action detail
# ---------------------------------------------------------------------------
@app.get("/api/actions/{action_id}")
async def api_get_action(action_id: str):
    result = await get_action_detail(action_id=action_id)
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# POST /api/actions/{action_id}/rollback  —  Direct rollback
# ---------------------------------------------------------------------------
@app.post("/api/actions/{action_id}/rollback")
async def api_rollback_action(action_id: str, request: Request):
    body = await request.json()
    reason = body.get("reason", "")
    result = await rollback_action(action_id=action_id, reason=reason)
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "agent": "rewindops_agent"}


def main():
    import uvicorn
    uvicorn.run(app, host=BACKEND_HOST, port=BACKEND_PORT)


if __name__ == "__main__":
    main()
