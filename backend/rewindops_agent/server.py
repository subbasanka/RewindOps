"""FastAPI server that bridges the Next.js frontend to the ADK agent.

Exposes:
  POST /run_sse                        — SSE stream for agent chat
  GET  /api/actions                    — list action receipts
  GET  /api/actions/:id                — single action detail
  POST /api/actions/:id/rollback       — trigger rollback
  GET  /api/chat/sessions              — list chat sessions for a user
  GET  /api/chat/sessions/:id/messages — load messages for a session
  POST /api/chat/sessions/:id/messages — save a message
  DELETE /api/chat/sessions/:id        — delete a chat session
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import FastAPI, Request, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from rewindops_agent.config import (
    BACKEND_PORT, BACKEND_HOST, GEMINI_MODEL,
    API_KEY, CORS_ORIGINS, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY,
    current_user_id,
)
from rewindops_agent.services.mongo_client import get_rewindops_db
from rewindops_agent.tools.rollback import rollback_action
from rewindops_agent.tools.history import list_action_history, get_action_detail

app = FastAPI(title="RewindOps AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_auth(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
) -> str:
    """Authenticate via Clerk JWT, API key, or pass-through for local dev."""
    if authorization and authorization.startswith("Bearer ") and CLERK_SECRET_KEY:
        token = authorization[7:]
        try:
            from rewindops_agent.services.clerk_auth import verify_clerk_token
            user_id = await verify_clerk_token(token)
            return user_id
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid Clerk token")

    if API_KEY:
        if not x_api_key or x_api_key != API_KEY:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

    return x_user_id or "demo-user"


@app.on_event("startup")
async def on_startup():
    from rewindops_agent.services.db_indexes import ensure_indexes
    try:
        await ensure_indexes()
    except Exception:
        pass

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
async def run_sse(request: Request, user_identity: str = Depends(verify_auth)):
    body = await request.json()
    user_id = user_identity
    session_id = body.get("session_id", str(uuid.uuid4()))
    new_message = body.get("new_message", {})
    user_text = ""
    for part in new_message.get("parts", []):
        if "text" in part:
            user_text += part["text"]

    if not user_text:
        return JSONResponse({"error": "No message text"}, status_code=400)

    current_user_id.set(user_id)
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
    user_identity: str = Depends(verify_auth),
):
    result = await list_action_history(
        limit=limit,
        risk_level_filter=risk_level,
        status_filter=status,
        user_id=user_identity,
    )
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# GET /api/actions/{action_id}  —  Get action detail
# ---------------------------------------------------------------------------
@app.get("/api/actions/{action_id}")
async def api_get_action(action_id: str, user_identity: str = Depends(verify_auth)):
    result = await get_action_detail(action_id=action_id)
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# POST /api/actions/{action_id}/rollback  —  Direct rollback
# ---------------------------------------------------------------------------
@app.post("/api/actions/{action_id}/rollback")
async def api_rollback_action(action_id: str, request: Request, user_identity: str = Depends(verify_auth)):
    body = await request.json()
    reason = body.get("reason", "")
    prefixed_reason = f"[{user_identity}] {reason}" if reason else f"Rollback by {user_identity}"
    result = await rollback_action(action_id=action_id, reason=prefixed_reason)
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "agent": "rewindops_agent"}


@app.get("/api/config")
async def api_config():
    return {
        "model": GEMINI_MODEL,
        "clerkPublishableKey": CLERK_PUBLISHABLE_KEY,
    }


# ---------------------------------------------------------------------------
# POST /api/seed  —  Generate sample action history for the authenticated user
# ---------------------------------------------------------------------------
@app.post("/api/seed")
async def api_seed_data(user_identity: str = Depends(verify_auth)):
    db = get_rewindops_db()
    existing = await db["action_receipts"].count_documents({"user_id": user_identity})
    if existing > 0:
        return JSONResponse({"status": "skipped", "message": "User already has action data.", "count": existing})

    now = datetime.now(timezone.utc)
    samples = [
        {
            "_id": f"ACT-SEED-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user_identity,
            "agent_id": "support-agent-demo",
            "action_type": "cancel_subscription",
            "collection": "subscriptions",
            "document_id": "sub_acme_ent_001",
            "proposed_changes": {"status": "cancelled"},
            "operation_type": "UPDATE",
            "risk_level": "high",
            "risk_score": 60,
            "risk_reasons": ["Write action detected (+10)", "Billing-related collection 'subscriptions' (+20)", "Subscription status fields modified (+20)", "Enterprise customer 'Acme Robotics' affected (+20)", "Rollback available (-10)"],
            "approval_required": True,
            "approval_status": "approved",
            "execution_status": "executed",
            "rollback_status": "available",
            "pipeline_state": "executed",
            "blast_radius_summary": "Cancelling enterprise subscription for Acme Robotics. Monthly revenue impact: $2,499/mo.",
            "field_changes": [{"field": "status", "before": "active", "after": "cancelled"}],
            "business_impact": ["Loss of $2,499/month recurring revenue", "Enterprise SLA obligations end immediately"],
            "created_at": (now.replace(hour=10, minute=15)).isoformat(),
            "executed_at": (now.replace(hour=10, minute=18)).isoformat(),
        },
        {
            "_id": f"ACT-SEED-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user_identity,
            "agent_id": "support-agent-demo",
            "action_type": "refund_invoice",
            "collection": "invoices",
            "document_id": "inv_nova_pro_042",
            "proposed_changes": {"refund_status": "refunded", "amount": 0},
            "operation_type": "UPDATE",
            "risk_level": "medium",
            "risk_score": 35,
            "risk_reasons": ["Write action detected (+10)", "Billing-related collection 'invoices' (+20)", "Refund state modification (+15)", "Rollback available (-10)"],
            "approval_required": False,
            "approval_status": "approved",
            "execution_status": "executed",
            "rollback_status": "available",
            "pipeline_state": "executed",
            "blast_radius_summary": "Refunding invoice #042 for NovaTech Solutions. Amount: $499.",
            "field_changes": [{"field": "refund_status", "before": "none", "after": "refunded"}, {"field": "amount", "before": 499, "after": 0}],
            "business_impact": ["One-time revenue loss of $499"],
            "created_at": (now.replace(hour=11, minute=30)).isoformat(),
            "executed_at": (now.replace(hour=11, minute=32)).isoformat(),
        },
        {
            "_id": f"ACT-SEED-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user_identity,
            "agent_id": "support-agent-demo",
            "action_type": "update_customer_plan",
            "collection": "subscriptions",
            "document_id": "sub_nova_pro_001",
            "proposed_changes": {"plan": "enterprise", "monthly_amount": 2499},
            "operation_type": "UPDATE",
            "risk_level": "medium",
            "risk_score": 40,
            "risk_reasons": ["Write action detected (+10)", "Billing-related collection 'subscriptions' (+20)", "Subscription status fields modified (+20)", "Rollback available (-10)"],
            "approval_required": False,
            "approval_status": "approved",
            "execution_status": "executed",
            "rollback_status": "not_applicable",
            "pipeline_state": "executed",
            "blast_radius_summary": "Upgrading NovaTech Solutions from Professional to Enterprise tier.",
            "field_changes": [{"field": "plan", "before": "professional", "after": "enterprise"}, {"field": "monthly_amount", "before": 499, "after": 2499}],
            "business_impact": ["Revenue increase of $2,000/month"],
            "created_at": (now.replace(hour=14, minute=0)).isoformat(),
            "executed_at": (now.replace(hour=14, minute=3)).isoformat(),
        },
        {
            "_id": f"ACT-SEED-{uuid.uuid4().hex[:6].upper()}",
            "user_id": user_identity,
            "agent_id": "support-agent-demo",
            "action_type": "delete_customer",
            "collection": "customers",
            "document_id": "cust_test_999",
            "proposed_changes": {},
            "operation_type": "DELETE",
            "risk_level": "critical",
            "risk_score": 100,
            "risk_reasons": ["Action 'delete_customer' is permanently blocked. This action is destructive and irreversible."],
            "approval_required": False,
            "approval_status": "pending",
            "execution_status": "pending",
            "rollback_status": "not_applicable",
            "pipeline_state": "classified",
            "created_at": (now.replace(hour=15, minute=45)).isoformat(),
        },
    ]

    await db["action_receipts"].insert_many(samples)
    return JSONResponse({"status": "seeded", "count": len(samples)})


# ---------------------------------------------------------------------------
# Chat persistence  —  sessions & messages stored in MongoDB
# ---------------------------------------------------------------------------

@app.get("/api/chat/sessions")
async def api_list_chat_sessions(user_identity: str = Depends(verify_auth)):
    db = get_rewindops_db()
    cursor = db["chat_sessions"].find(
        {"user_id": user_identity},
        {"_id": 0},
    ).sort("updated_at", -1).limit(50)
    sessions = []
    async for doc in cursor:
        doc["created_at"] = doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at", "")
        doc["updated_at"] = doc["updated_at"].isoformat() if isinstance(doc.get("updated_at"), datetime) else doc.get("updated_at", "")
        sessions.append(doc)
    return JSONResponse({"sessions": sessions})


@app.get("/api/chat/sessions/{session_id}/messages")
async def api_get_chat_messages(session_id: str, user_identity: str = Depends(verify_auth)):
    db = get_rewindops_db()
    cursor = db["chat_messages"].find(
        {"session_id": session_id, "user_id": user_identity},
        {"_id": 0},
    ).sort("timestamp", 1)
    messages = []
    async for doc in cursor:
        doc["timestamp"] = doc["timestamp"].isoformat() if isinstance(doc.get("timestamp"), datetime) else doc.get("timestamp", "")
        messages.append(doc)
    return JSONResponse({"messages": messages})


@app.post("/api/chat/sessions/{session_id}/messages")
async def api_save_chat_message(session_id: str, request: Request, user_identity: str = Depends(verify_auth)):
    body = await request.json()
    now = datetime.now(timezone.utc)

    msg_doc = {
        "session_id": session_id,
        "user_id": user_identity,
        "message_id": body.get("id", str(uuid.uuid4())),
        "role": body.get("role", "user"),
        "content": body.get("content", ""),
        "toolCards": body.get("toolCards", []),
        "timestamp": now,
    }
    db = get_rewindops_db()
    await db["chat_messages"].insert_one(msg_doc)

    title = body.get("content", "New conversation")[:60]
    await db["chat_sessions"].update_one(
        {"session_id": session_id, "user_id": user_identity},
        {
            "$set": {"updated_at": now, "title": title},
            "$setOnInsert": {"session_id": session_id, "user_id": user_identity, "created_at": now},
        },
        upsert=True,
    )

    return JSONResponse({"status": "saved"})


@app.delete("/api/chat/sessions/{session_id}")
async def api_delete_chat_session(session_id: str, user_identity: str = Depends(verify_auth)):
    db = get_rewindops_db()
    await db["chat_sessions"].delete_one({"session_id": session_id, "user_id": user_identity})
    await db["chat_messages"].delete_many({"session_id": session_id, "user_id": user_identity})
    return JSONResponse({"status": "deleted"})


def main():
    import uvicorn
    uvicorn.run(app, host=BACKEND_HOST, port=BACKEND_PORT)


if __name__ == "__main__":
    main()
