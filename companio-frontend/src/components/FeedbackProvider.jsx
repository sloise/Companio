import Icon from "./Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedbackContext } from "../context/feedback";

const ICONS = { success: "check", error: "alert", info: "info" };

// Replaces the browser's alert() and confirm() with messages and boxes that match the app.
export default function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [reason, setReason] = useState("");
  const [dialog, setDialog] = useState(null); // { title, message, confirmLabel, danger, resolve }
  const dialogRef = useRef(null);
  const nextId = useRef(1);
  const activeDialog = useRef(null);

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
      if (activeDialog.current) { resolve(false); return; }
      activeDialog.current = { resolve };
      setReason(options.initialReason || "");
      setDialog({ confirmLabel: "Confirm", danger: false, ...options, resolve });
    });
  }, []);

  useEffect(() => {
    if (dialog && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [dialog]);

  const answer = (value) => {
    const active = activeDialog.current;
    if (!active) return;
    activeDialog.current = null;
    active.resolve(value);
    setDialog(null);
    dialogRef.current?.close();
  };

  useEffect(() => () => { activeDialog.current?.resolve(false); activeDialog.current = null; }, []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon" aria-hidden="true"><Icon name={ICONS[toast.type]} size={19}/></span>
            <p>{toast.message}</p>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <Icon name="x" size={18}/>
            </button>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="modal confirm-box"
        aria-labelledby="confirm-title"
        aria-describedby={dialog?.message ? "confirm-message" : undefined}
        onClose={() => { if (!dialogRef.current?.open) answer(false); }}
        onCancel={(e) => {
          e.preventDefault(); // Esc = cancel
          answer(false);
        }}
      >
        {dialog && (
          <div className="confirm-body">
            <h2 id="confirm-title">{dialog.title}</h2>
            {dialog.message && <p id="confirm-message" className="muted">{dialog.message}</p>}
            {(dialog.reasonRequired || dialog.reasonOptional) && <label className="field">{dialog.reasonLabel || "Rejection reason"}<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={dialog.reasonMaxLength || 2000} required={dialog.reasonRequired} /></label>}
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => answer(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={dialog.danger ? "btn btn-danger-solid" : "btn btn-primary"}
                disabled={(dialog.reasonRequired && !reason.trim()) || reason.length > (dialog.reasonMaxLength || 2000)}
                onClick={() => answer(dialog.reasonRequired || dialog.reasonOptional ? reason.trim() || true : true)}
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
