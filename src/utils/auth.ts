export function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

export type CurrentUser = {
  id: string;
  email?: string;
};

export function getCurrentUser(): CurrentUser | null {
  const token = getToken();

  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      id: payload.sub,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function isAuthenticated(): boolean {
  const token = getToken();

  if (!token) return false;

  return isTokenValid(token);
}
