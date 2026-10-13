import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import Logo from "./Logo";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <Logo light />
          <p className="sidebar-role">Shelter admin</p>
        </div>

        <nav aria-label="Admin">
          <NavLink to="/admin" end>Dashboard</NavLink>
          <NavLink to="/admin/animals">Animals</NavLink>
          <NavLink to="/admin/applications">Applications</NavLink>
          <NavLink to="/admin/placements">Placements</NavLink>
        </nav>

        <div className="sidebar-user">
          <strong>{user.name}</strong>
          <span>Placement coordinator</span>
          <button type="button" className="btn btn-ghost-light" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
