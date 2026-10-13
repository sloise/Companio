import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/auth";
import Logo from "./Logo";

// small number next to a sidebar link, e.g. Applications (3)
function CountBadge({ count, label, warn = false }) {
  if (!count) {
    return null;
  }

  return (
    <span className={warn ? "nav-count nav-count-warn" : "nav-count"} aria-label={`${count} ${label}`}>
      {count}
    </span>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [counts, setCounts] = useState({});

  // READ - badge numbers, refreshed when the page changes and every minute
  useEffect(() => {
    const getCounts = async () => {
      try {
        const response = await api.get("/admin/counts");
        setCounts(response.data);
      } catch {
        // badges are optional - keep the old numbers
      }
    };

    getCounts();
    const timer = setInterval(getCounts, 60000);
    return () => clearInterval(timer);
  }, [location.pathname]);

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
          <NavLink to="/admin" end>
            Dashboard
            <CountBadge count={counts.staff_requests} label="staff requests waiting" />
          </NavLink>
          <NavLink to="/admin/animals">Animals</NavLink>
          <NavLink to="/admin/applications">
            Applications
            <CountBadge count={counts.pending_applications} label="pending applications" />
          </NavLink>
          <NavLink to="/admin/placements">
            Placements
            <CountBadge count={counts.overdue_placements} label="overdue returns" warn />
          </NavLink>
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
