import { Routes, Route } from "react-router-dom";

import MainPage from "../views/MainPage";
import ConstructorPage from "../views/Constructor";
import LoginPage from "../views/Authenticator/login";
import RegisterPage from "../views/Authenticator/register";
import { PrivateRoute } from "../views/Authenticator/private-route";
import { PublicRoute } from "../views/Authenticator/public-route";
import ResetPasswordPage from "../views/Authenticator/reset-password";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPasswordPage />
          </PublicRoute>
        }
      />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <MainPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/model"
        element={
          <PrivateRoute>
            <ConstructorPage />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
