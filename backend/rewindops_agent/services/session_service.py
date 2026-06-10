"""MongoDB-backed session service for ADK agent persistence."""

import json
from datetime import datetime, timezone
from typing import Optional

from google.adk.sessions import BaseSessionService, Session
from rewindops_agent.services.mongo_client import get_rewindops_db


class MongoSessionService(BaseSessionService):
    """Persists ADK sessions to MongoDB instead of in-memory storage."""

    async def create_session(
        self,
        app_name: str,
        user_id: str,
        session_id: Optional[str] = None,
        **kwargs,
    ) -> Session:
        session = Session(
            app_name=app_name,
            user_id=user_id,
            id=session_id or f"session-{datetime.now(timezone.utc).timestamp()}",
        )
        db = get_rewindops_db()
        await db["sessions"].replace_one(
            {"_id": session.id},
            {
                "_id": session.id,
                "app_name": app_name,
                "user_id": user_id,
                "created_at": datetime.now(timezone.utc),
                "events": [],
            },
            upsert=True,
        )
        return session

    async def get_session(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
        **kwargs,
    ) -> Optional[Session]:
        db = get_rewindops_db()
        doc = await db["sessions"].find_one({"_id": session_id})
        if not doc:
            return None
        return Session(
            app_name=doc.get("app_name", app_name),
            user_id=doc.get("user_id", user_id),
            id=session_id,
        )

    async def delete_session(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
        **kwargs,
    ) -> None:
        db = get_rewindops_db()
        await db["sessions"].delete_one({"_id": session_id})

    async def list_sessions(
        self,
        app_name: str,
        user_id: str,
        **kwargs,
    ) -> list[Session]:
        db = get_rewindops_db()
        cursor = db["sessions"].find({"app_name": app_name, "user_id": user_id})
        sessions = []
        async for doc in cursor:
            sessions.append(Session(
                app_name=doc.get("app_name", app_name),
                user_id=doc.get("user_id", user_id),
                id=doc["_id"],
            ))
        return sessions
