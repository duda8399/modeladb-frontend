import { Routes, Route } from "react-router-dom";
import MainPage from "../views/MainPage";
import ConstructorPage from "../views/Constructor";
import LoginPage from "../views/Authenticator/login";
import RegisterPage from "../views/Authenticator/register";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<MainPage />} />
      <Route path="/model" element={<ConstructorPage />} />
    </Routes>
  );
}
