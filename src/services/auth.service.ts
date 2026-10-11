import { api } from "./api";
import { clearSession, getRefreshToken } from "../utils/auth";

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
}

export async function register(data: RegisterDTO) {
  const response = await api.post("/auth/register", data);
  return response.data;
}

export async function logout() {
  const refreshToken = getRefreshToken();
  clearSession();

  if (refreshToken) {
    try {
      await api.post("/auth/logout", { refreshToken });
    } catch {
      return;
    }
  }
}
