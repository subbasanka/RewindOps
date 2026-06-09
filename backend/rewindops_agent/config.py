import os
from contextvars import ContextVar
from dotenv import load_dotenv, find_dotenv

current_user_id: ContextVar[str] = ContextVar("current_user_id", default="demo-user")

load_dotenv(find_dotenv())

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DATABASE_BUSINESS = os.getenv("MONGODB_DATABASE_BUSINESS", "acmesub")
MONGODB_DATABASE_REWINDOPS = os.getenv("MONGODB_DATABASE_REWINDOPS", "rewindops")

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

MONGODB_MCP_URL = os.getenv("MONGODB_MCP_URL", "http://localhost:3000/mcp")
PHOENIX_MCP_URL = os.getenv("PHOENIX_MCP_URL", "http://localhost:6007/mcp")

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")

API_KEY = os.getenv("REWINDOPS_API_KEY", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_PUBLISHABLE_KEY = os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")

AGENT_ENGINE_ENABLED = os.getenv("AGENT_ENGINE_ENABLED", "false").lower() == "true"

SENSITIVE_FIELDS = {"email", "phone", "billing_address", "address"}

BUSINESS_COLLECTIONS = {"customers", "subscriptions", "invoices"}

BLOCKED_MCP_WRITE_TOOLS = {
    "insert-one",
    "update-one",
    "delete-one",
    "update-many",
    "delete-many",
    "insert-many",
    "drop-collection",
    "drop-database",
    "rename-collection",
}

DANGEROUS_ACTIONS = {
    "delete_customer",
    "drop_collection",
    "drop_database",
}

RISK_WEIGHTS = {
    "write_action": 10,
    "billing_related": 20,
    "subscription_status_change": 20,
    "enterprise_customer": 20,
    "refund_modification": 15,
    "destructive_action": 20,
    "rollback_available": -10,
    "approval_present": -10,
}

RISK_THRESHOLDS = {
    "low": (0, 20),
    "medium": (21, 45),
    "high": (46, 75),
    "critical": (76, 200),
}

APPROVAL_REQUIREMENTS = {
    "low": 0,
    "medium": 0,
    "high": 1,
    "critical": 2,
}

APPROVAL_TIMEOUT_HOURS = int(os.getenv("APPROVAL_TIMEOUT_HOURS", "24"))
