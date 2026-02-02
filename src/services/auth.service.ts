import { api } from "./api";

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
}

export async function register(data: RegisterDTO) {
  const response = await api.post("/auth/register", data);
  return response.data;
}
