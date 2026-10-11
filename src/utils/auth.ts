const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export type CurrentUser = {
  id: string;
  email?: string;
};

type TokenPayload = { sub?: string; email?: string; exp?: number };

function decode(token: string): TokenPayload | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function getCurrentUser(): CurrentUser | null {
  const token = getToken();

  if (!token) return null;

  const payload = decode(token);

  if (!payload?.sub) return null;

  return {
    id: payload.sub,
    email: payload.email,
  };
}

export function isTokenExpiring(token: string, marginMs = 0): boolean {
  const exp = decode(token)?.exp;
  return typeof exp !== "number" || exp * 1000 - marginMs <= Date.now();
}

export function isAuthenticated(): boolean {
  const access = getToken();
  const refresh = getRefreshToken();

  if (access && !isTokenExpiring(access)) return true;

  return Boolean(access && refresh && !isTokenExpiring(refresh));
}

export type SessionData = {
  accessToken: string;
  refreshToken?: string;
  userId?: string;
  avatarUrl?: string | null;
};

export function setSession(session: SessionData) {
  localStorage.setItem(ACCESS_KEY, session.accessToken);

  if (session.refreshToken) localStorage.setItem(REFRESH_KEY, session.refreshToken);
  if (session.userId) localStorage.setItem("userId", session.userId);
  if (session.avatarUrl !== undefined) localStorage.setItem("avatar", session.avatarUrl ?? "");
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem("userId");
  localStorage.removeItem("avatar");
}
