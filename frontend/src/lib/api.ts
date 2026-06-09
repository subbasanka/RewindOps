import { ActionReceipt } from "./types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

let _getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  _getToken = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_getToken) {
    const token = await _getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new ApiError(text || response.statusText, response.status);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Agent SSE
// ---------------------------------------------------------------------------

export async function sendAgentMessage(
  message: string,
  sessionId: string,
  userId: string = "demo-user"
): Promise<Response> {
  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/run_sse`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      app_name: "rewindops_agent",
      user_id: userId,
      session_id: sessionId,
      new_message: {
        role: "user",
        parts: [{ text: message }],
      },
      streaming: true,
    }),
  });
  if (!response.ok) {
    throw new ApiError(response.statusText, response.status);
  }
  return response;
}

export async function createSession(
  userId: string = "demo-user"
): Promise<string> {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return sessionId;
}

// ---------------------------------------------------------------------------
// Action history
// ---------------------------------------------------------------------------

export interface ActionHistoryResponse {
  status: string;
  count: number;
  actions: ActionReceipt[];
}

export async function fetchActionHistory(
  limit: number = 20,
  riskLevel?: string,
  status?: string
): Promise<ActionHistoryResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (riskLevel) params.set("risk_level", riskLevel);
  if (status) params.set("status", status);

  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/api/actions?${params}`, { headers });
  return handleResponse<ActionHistoryResponse>(response);
}

export interface ActionDetailResponse {
  status: string;
  receipt: ActionReceipt & {
    risk_reasons: string[];
    blast_radius_summary?: string;
    field_changes?: Array<{ field: string; before: unknown; after: unknown }>;
    business_impact?: string[];
  };
  checkpoint?: {
    checkpoint_id: string;
    before_state: Record<string, unknown> | null;
    rollback_available: boolean;
    created_at: string;
  } | null;
  rollback_event?: {
    rollback_event_id: string;
    reason: string;
    verification: string;
    completed_at: string;
  } | null;
}

export async function fetchActionDetail(actionId: string): Promise<ActionDetailResponse> {
  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/api/actions/${actionId}`, { headers });
  return handleResponse<ActionDetailResponse>(response);
}

export interface RollbackResponse {
  status: string;
  rollback_event_id?: string;
  action_id?: string;
  error?: string;
}

export async function triggerRollback(
  actionId: string,
  reason: string = ""
): Promise<RollbackResponse> {
  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/api/actions/${actionId}/rollback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason }),
  });
  return handleResponse<RollbackResponse>(response);
}

export async function fetchAgentConfig(): Promise<{ model: string; clerkPublishableKey?: string }> {
  const response = await fetch(`${BACKEND_URL}/api/config`);
  return handleResponse<{ model: string; clerkPublishableKey?: string }>(response);
}

// ---------------------------------------------------------------------------
// Chat persistence
// ---------------------------------------------------------------------------

export interface ChatSessionSummary {
  session_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface PersistedMessage {
  session_id: string;
  message_id: string;
  role: "user" | "agent";
  content: string;
  toolCards: Array<{ type: string; data: Record<string, unknown> }>;
  timestamp: string;
}

export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/api/chat/sessions`, { headers });
  const data = await handleResponse<{ sessions: ChatSessionSummary[] }>(response);
  return data.sessions;
}

export async function fetchChatMessages(sessionId: string): Promise<PersistedMessage[]> {
  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}/messages`, { headers });
  const data = await handleResponse<{ messages: PersistedMessage[] }>(response);
  return data.messages;
}

export async function saveChatMessage(
  sessionId: string,
  message: { id: string; role: string; content: string; toolCards: unknown[] }
): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers,
  });
}

export async function seedUserData(): Promise<{ status: string; count?: number }> {
  const headers = await authHeaders();
  const response = await fetch(`${BACKEND_URL}/api/seed`, {
    method: "POST",
    headers,
  });
  return handleResponse<{ status: string; count?: number }>(response);
}
