import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { timeAgo } from "../utils/format";

// The bell in the volunteer top bar: shows a dot when the shelter has news (approved, rejected...)
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const boxRef = useRef(null);

  // READ - check for news now and then every minute
  useEffect(() => {
    const getNotifications = async () => {
      try {
        const response = await api.get("/notifications");
        setUnread(response.data.unread);
        setItems(response.data.notifications);
      } catch {
        // not important enough to show an error - we'll try again in a minute
      }
    };

    getNotifications();
    const timer = setInterval(getNotifications, 60000);
    return () => clearInterval(timer);
  }, []);

  // close when clicking anywhere else or pressing Esc
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnOutside = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const closeOnEscape = (e) => e.key === "Escape" && setOpen(false);

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // opening the list marks everything as read
  const toggle = async () => {
    const opening = !open;
    setOpen(opening);

    if (opening && unread > 0) {
      setUnread(0);
      try {
        await api.post("/notifications/read");
      } catch {
        // they'll just show as unread again next time
      }
    }
  };

  const openItem = (item) => {
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="user-menu" ref={boxRef}>
      <button
        type="button"
        className="bell-btn"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="user-menu-panel bell-panel">
          <div className="user-menu-who">
            <strong>Notifications</strong>
          </div>

          {items.length === 0 ? (
            <p className="muted small bell-empty">Nothing yet. We&apos;ll let you know when the shelter replies to a request.</p>
          ) : (
            <ul className="bell-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={item.read_at ? "bell-item" : "bell-item bell-item-new"} onClick={() => openItem(item)}>
                    <span>{item.message}</span>
                    <small>{timeAgo(item.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
