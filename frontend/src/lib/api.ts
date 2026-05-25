const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function sendAgentMessage(
  message: string,
  sessionId: string,
  userId: string = "demo-user"
): Promise<Response> {
  const response = await fetch(
    `${BACKEND_URL}/run_sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    }
  );
  return response;
}

export async function createSession(
  userId: string = "demo-user"
): Promise<string> {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return sessionId;
}

export async function fetchActionHistory(
  limit: number = 20,
  riskLevel?: string,
  status?: string
): Promise<unknown> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (riskLevel) params.set("risk_level", riskLevel);
  if (status) params.set("status", status);

  const response = await fetch(`${BACKEND_URL}/api/actions?${params}`);
  return response.json();
}

export async function fetchActionDetail(actionId: string): Promise<unknown> {
  const response = await fetch(`${BACKEND_URL}/api/actions/${actionId}`);
  return response.json();
}

export async function triggerRollback(
  actionId: string,
  reason: string = ""
): Promise<unknown> {
  const response = await fetch(`${BACKEND_URL}/api/actions/${actionId}/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return response.json();
}
