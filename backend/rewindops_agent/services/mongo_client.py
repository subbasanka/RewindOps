import motor.motor_asyncio
from rewindops_agent.config import (
    MONGODB_URI,
    MONGODB_DATABASE_BUSINESS,
    MONGODB_DATABASE_REWINDOPS,
)

_client = None


def get_client() -> motor.motor_asyncio.AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)
    return _client


def get_business_db() -> motor.motor_asyncio.AsyncIOMotorDatabase:
    return get_client()[MONGODB_DATABASE_BUSINESS]


def get_rewindops_db() -> motor.motor_asyncio.AsyncIOMotorDatabase:
    return get_client()[MONGODB_DATABASE_REWINDOPS]
