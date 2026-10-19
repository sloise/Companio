import { Link } from "react-router-dom";
import { useAuth } from "../context/auth";
export default function Logo({ light = false }) {
  const { user } = useAuth();
  const home = user ? (["admin", "super_admin"].includes(user.role) ? "/admin" : "/matches") : "/";
  return (
    <Link to={home} aria-label="Companio home" className={light ? "logo logo-light" : "logo"}>
      <span className="logo-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="4" r="2" />
          <circle cx="18" cy="8" r="2" />
          <circle cx="20" cy="16" r="2" />
          <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
        </svg>
      </span>
      <span className="logo-text">Companio</span>
    </Link>
  );
}
