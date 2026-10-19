import MessageLink from "./MessageLink";
import CompanionArt from "./CompanionArt";
import Icon from "./Icon";
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
    window.addEventListener("staff-requests-changed", getCounts);
    return () => { clearInterval(timer); window.removeEventListener("staff-requests-changed", getCounts); };
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="admin-shell"><a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div>
          <Logo light />
          <p className="sidebar-role">{user.role === "super_admin" ? "Super Admin" : "Shelter admin"}</p>
        </div>

        <nav aria-label="Admin">
          <NavLink to="/admin" end>
            <Icon name="grid"/> Dashboard

          </NavLink>
          {user.role === "super_admin" && <NavLink to="/admin/staff-requests"><Icon name="shield"/> Staff Requests<CountBadge count={counts.staff_requests} label="staff requests waiting" /></NavLink>}
          <NavLink to="/admin/animals"><Icon name="paw"/> Animals</NavLink>
          <NavLink to="/admin/applications">
            <Icon name="clipboard"/> Applications
            <span className="nav-counts"><CountBadge count={counts.pending_applications} label="pending applications" /><CountBadge count={counts.pending_profiles} label="profiles needing screening" warn /></span>
          </NavLink>
          <NavLink to="/admin/placements">
            <Icon name="heart"/> Placements
            <span className="nav-counts">
              <CountBadge count={counts.foster_requests} label="adopt or return requests" />
              <CountBadge count={counts.overdue_placements} label="overdue returns" warn />
            </span>
          </NavLink>
        </nav>

        <div className="sidebar-companion"><div aria-hidden="true"><CompanionArt pose="sit"/></div><span>A little care.<br/><strong>A better tomorrow.</strong></span></div>
        <div className="sidebar-user">
          <strong>{user.name}</strong>
          <span>{user.role === "super_admin" ? "Account administration" : "Shelter operations"}</span>
          <button type="button" className="btn btn-ghost-light" onClick={handleLogout}>
            <Icon name="logout" size={17}/> Log out
          </button>
        </div>
      </aside>

      <main className="admin-main" id="main-content" tabIndex={-1}>
        <div className="workspace-bar"><span><Icon name="grid" size={15}/> Shelter workspace <span className="workspace-divider">/</span> {location.pathname === "/admin" ? "Overview" : ({animals:"Animals",applications:"Review board",placements:"Placements","staff-requests":"Staff requests"}[location.pathname.split("/").pop()] || "Overview")}</span><span className="workspace-communication"><MessageLink/><Icon name="shield" size={14}/> {user.role === "super_admin" ? "Super admin" : "Shelter team"}</span></div>
        <Outlet />
      </main>
    </div>
  );
}
