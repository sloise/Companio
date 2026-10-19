import Icon from "./Icon";
import { useEffect, useRef, useState } from "react";
import api, { errorMessage } from "../api/client";
import { Skeleton } from "./PageStates";
import { formatDate, timeAgo } from "../utils/format";

// Pop-up window listing everything that happened to one animal (admin only)
export default function AnimalHistory({ animal, onClose }) {
  const dialogRef = useRef(null);
  const [events, setEvents] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // READ
  useEffect(() => {
    const getHistory = async () => {
      try {
        const response = await api.get(`/admin/animals/${animal.id}/history`);
        setEvents(response.data);
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    };

    getHistory();
  }, [animal.id]);

  return (
    <dialog
      ref={dialogRef}
      className="modal history-modal"
      aria-labelledby="history-title"
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
    >
      <div className="modal-head">
        <h2 id="history-title">{animal.name}&apos;s history</h2>
        <button type="button" className="modal-close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
          <Icon name="x"/>
        </button>
      </div>

      <div className="modal-body history-body">
        {loadError ? (
          <p className="notice notice-error" role="alert">{loadError}</p>
        ) : !events ? (
          <Skeleton rows={4} height={44} />
        ) : (
          <ol className="history-list">
            {events.map((event, index) => (
              <li key={event.id || `added-${index}`}>
                <span className="history-dot" aria-hidden="true" />
                <div>
                  <p>{event.message}</p>
                  <small className="muted" title={new Date(event.created_at).toLocaleString()}>
                    {formatDate(event.created_at)} · {timeAgo(event.created_at)}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
