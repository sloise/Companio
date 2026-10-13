import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedbackContext } from "../context/feedback";

const ICONS = { success: "✓", error: "!", info: "i" };

// Replaces the browser's alert() and confirm() with messages and boxes that match the app.
export default function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // { title, message, confirmLabel, danger, resolve }
  const dialogRef = useRef(null);
  const nextId = useRef(1);

  // SMALL MESSAGE in the corner, gone after a few seconds
  const notify = useCallback((message, type = "success") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, type }]);

    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, type === "error" ? 6000 : 3500);
  }, []);

  const dismiss = (id) => setToasts((current) => current.filter((toast) => toast.id !== id));

  // CONFIRM BOX - resolves to true (confirmed) or false (cancelled)
  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({ confirmLabel: "Confirm", danger: false, ...options, resolve });
    });
  }, []);

  useEffect(() => {
    if (dialog && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [dialog]);

  const answer = (value) => {
    dialog?.resolve(value);
    setDialog(null);
    dialogRef.current?.close();
  };

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
            <p>{toast.message}</p>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="modal confirm-box"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onCancel={(e) => {
          e.preventDefault(); // Esc = cancel
          answer(false);
        }}
      >
        {dialog && (
          <div className="confirm-body">
            <h2 id="confirm-title">{dialog.title}</h2>
            {dialog.message && <p id="confirm-message" className="muted">{dialog.message}</p>}
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => answer(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={dialog.danger ? "btn btn-danger-solid" : "btn btn-primary"}
                onClick={() => answer(true)}
                autoFocus
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </FeedbackContext.Provider>
  );
}
