import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/auth";

// Wrap pages that need a login. role="admin" or role="volunteer" limits who can enter.
export default function ProtectedRoute({ role }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (["staff_pending", "staff_rejected"].includes(user.role)) return <Navigate to="/login" replace />;

  if (role === "super_admin" && user.role !== "super_admin") return <Navigate to="/admin" replace />;

  if (role === "admin" && !["admin", "super_admin"].includes(user.role)) {
    return <Navigate to="/matches" replace />;
  }

  if (role === "volunteer" && ["admin", "super_admin"].includes(user.role)) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
