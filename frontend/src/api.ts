// Small fetch wrapper: JSON in, JSON out, throws an ApiError with the server's message.
// Paths are relative ("/api/..."), so in dev they go through the Vite proxy to Flask
// and in production Flask serves the built app itself. No VITE_API_URL needed.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export async function api<T>(path: string, { method = "GET", body, token }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Admin-Token"] = token;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON response */
  }

  if (!res.ok) {
    let message = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    // Flask always answers with JSON {"error": ...}. A 5xx with no JSON body
    // means something in between (usually the Vite dev proxy) couldn't reach Flask.
    if (!data.error && res.status >= 500) {
      message =
        "Can't reach the game server. Make sure the Flask backend is running " +
        "(python app.py in the backend folder) on port 5001.";
    }
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const errorStatus = (e: unknown) => (e instanceof ApiError ? e.status : 0);
