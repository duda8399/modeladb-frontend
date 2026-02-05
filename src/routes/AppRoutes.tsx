import { Routes, Route } from "react-router-dom";

import MainPage from "../views/MainPage";
import ConstructorPage from "../views/Constructor";
import LoginPage from "../views/Authenticator/login";
import RegisterPage from "../views/Authenticator/register";
import { PrivateRoute } from "../views/Authenticator/private-route";
import { PublicRoute } from "../views/Authenticator/public-route";

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
