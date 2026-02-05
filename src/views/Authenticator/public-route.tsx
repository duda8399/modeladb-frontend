import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { isAuthenticated } from "../../utils/auth";

type Props = {
  children: ReactNode;
};

export function PublicRoute({ children }: Props) {

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return children;
}
