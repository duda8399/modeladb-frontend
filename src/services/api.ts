import axios, { type InternalAxiosRequestConfig } from "axios";
import {
  clearSession,
  getRefreshToken,
  getToken,
  isTokenExpiring,
  setSession,
} from "../utils/auth";

const baseURL = import.meta.env.VITE_BACKEND_URL;

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

const refreshClient = axios.create({ baseURL, withCredentials: true });

const EXPIRY_MARGIN_MS = 30_000;

let inflight: Promise<string | null> | null = null;
let redirecting = false;

function freshTokenFromAnotherTab(usedRefreshToken: string): string | null {
  if (getRefreshToken() === usedRefreshToken) return null;

  const token = getToken();
  return token && !isTokenExpiring(token, EXPIRY_MARGIN_MS) ? token : null;
}

async function runRefresh(): Promise<string | null> {
  const used = getRefreshToken();

  if (!used) return null;

  const attempt = async () => {
    const already = freshTokenFromAnotherTab(used);
    if (already) return already;

    const refreshToken = getRefreshToken() ?? used;

    try {
      const { data } = await refreshClient.post("/auth/refresh", { refreshToken });
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken as string;
    } catch (error) {
      const recovered = freshTokenFromAnotherTab(refreshToken);
      if (recovered) return recovered;

      if (axios.isAxiosError(error) && error.response?.status === 401) return null;

      throw error;
    }
  };

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;

  return locks ? locks.request("modeladb-refresh", attempt) : attempt();
}

export function refreshSession(): Promise<string | null> {
  if (!inflight) {
    inflight = runRefresh().finally(() => {
      inflight = null;
    });
  }

  return inflight;
}

export function handleSessionExpired() {
  clearSession();

  if (redirecting || window.location.pathname.startsWith("/login")) return;

  redirecting = true;
  window.location.assign("/login");
}

export async function getValidAccessToken(): Promise<string | null> {
  const token = getToken();

  if (token && !isTokenExpiring(token, EXPIRY_MARGIN_MS)) return token;
  if (!getRefreshToken()) return token;

  try {
    const refreshed = await refreshSession();

    if (!refreshed) {
      handleSessionExpired();
      return null;
    }

    return refreshed;
  } catch {
    return token;
  }
}

function isAuthRoute(config: InternalAxiosRequestConfig) {
  return (config.url ?? "").replace(/^\/+/, "").startsWith("auth/");
}

api.interceptors.request.use(async (config) => {
  if (isAuthRoute(config)) return config;

  const token = await getValidAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  const config = error?.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

  if (
    !axios.isAxiosError(error) ||
    error.response?.status !== 401 ||
    !config ||
    config._retried ||
    isAuthRoute(config)
  ) {
    throw error;
  }

  config._retried = true;

  let token: string | null;

  try {
    token = await refreshSession();
  } catch {
    throw error;
  }

  if (!token) {
    handleSessionExpired();
    throw error;
  }

  config.headers.Authorization = `Bearer ${token}`;
  return api(config);
});
