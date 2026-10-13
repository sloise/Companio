import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

export default function VolunteerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // close the account menu when clicking anywhere else or pressing Esc
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnOutside = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (e) => e.key === "Escape" && setMenuOpen(false);

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Logo light />

          <nav className="topnav" aria-label="Main">
            <NavLink to="/matches">Matches</NavLink>
            <NavLink to="/applications" data-tour="nav-applications">Applications</NavLink>
            <NavLink to="/questionnaire" data-tour="nav-profile">Home profile</NavLink>
          </nav>

          <div className="user-menu" ref={menuRef}>
            <button
              type="button"
              className="avatar avatar-btn"
              data-tour="account"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {initials}
            </button>

            {menuOpen && (
              <div className="user-menu-panel">
                <div className="user-menu-who">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/matches?tour=1");
                  }}
                >
                  Take the tour
                </button>
                <button type="button" className="btn" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
