import type { Session } from "@/lib/admin-session";

/** JSON fetch to an admin API with the session's ID token; throws the API's error message. */
export async function adminApi<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const token = await session.token();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Request failed");
  return res.json();
}
