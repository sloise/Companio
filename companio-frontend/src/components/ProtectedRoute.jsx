import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/auth";

// Wrap pages that need a login. role="admin" or role="volunteer" limits who can enter.
export default function ProtectedRoute({ role }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === "admin" && user.role !== "admin") {
    return <Navigate to="/matches" replace />;
  }

  if (role === "volunteer" && user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
