import { Routes, Route, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";

import MainPage from "../views/MainPage";
import ConstructorPage from "../views/Constructor";
import LoginPage from "../views/Authenticator/login";
import RegisterPage from "../views/Authenticator/register";
import { PrivateRoute } from "../views/Authenticator/private-route";
import { PublicRoute } from "../views/Authenticator/public-route";
import ForgotPasswordPage from "../views/Authenticator/forgot-password";
import ResetPasswordPage from "../views/Authenticator/reset-password";
import ProfilePage from "../views/MainPage/profile";
import MyDocumentsPage from "../views/MainPage/my-documents";
import SharedDocumentsPage from "../views/MainPage/shared-documents";

export function AppRoutes() {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary key={pathname}>
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
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPasswordPage />
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
          path="/profile"
          element={
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          }
        />

        <Route
          path="/model/:id"
          element={
            <PrivateRoute>
              <ConstructorPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/documents"
          element={
            <PrivateRoute>
              <MyDocumentsPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/shared"
          element={
            <PrivateRoute>
              <SharedDocumentsPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
