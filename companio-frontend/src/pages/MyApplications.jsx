import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";
import MatchBadge from "../components/MatchBadge";
import PetPhoto from "../components/PetPhoto";
import StatusPill from "../components/StatusPill";
import { LoadError, Skeleton } from "../components/PageStates";
import { daysUntil, formatDate } from "../utils/format";

// "in 12 days", "today", "3 days ago"
function whenText(date) {
  const days = daysUntil(date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

// Shown while the pet lives with the foster: what "Fostering" means + adopt / return requests
function FosterPanel({ application, onChanged }) {
  const { notify, confirm } = useFeedback();
  const placement = application.placement;
  const petName = application.animal?.name || "your foster pet";

  const [choosing, setChoosing] = useState(null); // "adopt" | "return" | null
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // UPDATE - tell the shelter how you'd like the foster period to end
  const sendRequest = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const response = await api.patch(`/my-placements/${placement.id}/request`, { type: choosing, note: note || null });
      notify(response.data.message);
      setChoosing(null);
      setNote("");
      onChanged();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  // DELETE - changed your mind
  const cancelRequest = async () => {
    const confirmed = await confirm({
      title: "Cancel your request?",
      message: `${petName} stays with you as a foster, and you can send a new request any time.`,
      confirmLabel: "Cancel request",
    });
    if (!confirmed) return;

    try {
      const response = await api.delete(`/my-placements/${placement.id}/request`);
      notify(response.data.message, "info");
      onChanged();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const due = placement.expected_return_date;
  const late = due && daysUntil(due) < 0;

  return (
    <div className="foster-panel">
      <p>
        <strong>🏡 {petName} is living with you.</strong> Fostering means you care for {petName} at home
        until they&apos;re adopted or come back to the shelter.
        {due && (
          <>
            {" "}Expected back <strong className={late ? "due-late" : ""}>{formatDate(due)}</strong> ({whenText(due)}).
          </>
        )}
      </p>

      {placement.foster_request ? (
        <div className={`foster-request foster-request-${placement.foster_request}`}>
          <p>
            <strong>
              {placement.foster_request === "adopt" ? `🏠 You asked to adopt ${petName}` : `↩ You asked to return ${petName}`}
            </strong>{" "}
            · {formatDate(placement.foster_requested_at)}. Waiting for the shelter to confirm.
          </p>
          {placement.foster_request_note && <p className="muted small">Your note: “{placement.foster_request_note}”</p>}
          <button type="button" className="link-btn" onClick={cancelRequest}>Cancel request</button>
        </div>
      ) : choosing ? (
        <form className="foster-request-form" onSubmit={sendRequest}>
          <label className="field">
            {choosing === "adopt"
              ? `Anything the shelter should know about adopting ${petName}? (optional)`
              : `Why do you need to return ${petName}, and when works for you? (optional)`}
            <textarea rows="2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
          <div className="foster-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setChoosing(null); setNote(""); }}>
              Back
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Sending..." : choosing === "adopt" ? "Send adoption request" : "Send return request"}
            </button>
          </div>
        </form>
      ) : (
        <div className="foster-actions">
          <span className="muted small">When the foster period ends, let the shelter know:</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setChoosing("adopt")}>
            🏠 I&apos;d like to adopt {petName}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setChoosing("return")}>
            ↩ I need to return {petName}
          </button>
        </div>
      )}
    </div>
  );
}

// The steps of one request, e.g. Sent ✓ → Reviewed ✓ → Approved ✓ → Fostering (now)
// state: "done" | "current" | "upcoming" | "stopped"
function timelineSteps(application) {
  const sent = { label: "Request sent", date: application.created_at, state: "done" };
  const decidedOn = application.decided_at || application.updated_at;
  const placement = application.placement;

  switch (application.status) {
    case "Withdrawn":
      return [sent, { label: "Withdrawn by you", date: application.updated_at, state: "stopped" }];

    case "Rejected":
      return [sent, { label: "Not approved", date: decidedOn, state: "stopped" }];

    case "Approved": {
      const steps = [
        sent,
        { label: "Approved", date: decidedOn, state: "done" },
        {
          label: "Fostering",
          date: placement?.foster_start_date,
          state: placement && placement.status !== "Active" ? "done" : "current",
        },
      ];

      if (placement?.status === "Returned") {
        steps.push({ label: "Returned to shelter", date: placement.updated_at, state: "done" });
      } else if (placement?.status === "Adopted") {
        steps.push({ label: "Adopted 🎉", date: placement.updated_at, state: "done" });
      } else if (placement?.foster_request === "adopt") {
        steps.push({ label: "Adoption requested", date: placement.foster_requested_at, state: "current" });
      } else if (placement?.foster_request === "return") {
        steps.push({ label: "Return requested", date: placement.foster_requested_at, state: "current" });
      } else {
        steps.push({ label: "Adopt or return", state: "upcoming" });
      }
      return steps;
    }

    default: // Pending
      return [
        sent,
        { label: "Shelter reviewing", state: "current" },
        { label: "Decision", state: "upcoming" },
        { label: "Fostering", state: "upcoming" },
      ];
  }
}

export default function MyApplications() {
  const { notify, confirm } = useFeedback();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the list again

  // READ
  useEffect(() => {
    const getApplications = async () => {
      try {
        const response = await api.get("/my-applications");
        setApplications(response.data);
        setLoadError("");
      } catch (error) {
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    getApplications();
  }, [reload]);

  // UPDATE - cancel a pending request
  const withdraw = async (application) => {
    const confirmed = await confirm({
      title: `Withdraw your request for ${application.animal?.name}?`,
      message: "The shelter will stop reviewing it. You can send a new request later if the pet is still available.",
      confirmLabel: "Withdraw request",
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      const response = await api.patch(`/my-applications/${application.id}/withdraw`);
      notify(response.data.message);
      setReload((count) => count + 1);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  if (loading) {
    return <Skeleton rows={3} height={150} />;
  }

  if (loadError) {
    return <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />;
  }

  return (
    <div className="stack">
      <div>
        <h1>My applications</h1>
        <p className="muted">Track your foster requests. Shelter staff review them in the order they arrive.</p>
      </div>

      {applications.length === 0 ? (
        <div className="card empty">
          <h2>No requests yet</h2>
          <p className="muted">Find a pet that fits your home and send your first foster request.</p>
          <Link className="btn btn-primary" to="/matches">Find a match</Link>
        </div>
      ) : (
        applications.map((application) => (
          <article className="card application-card" key={application.id}>
            <div className="application-card-top">
              {application.animal && (
                <div className="application-thumb">
                  <PetPhoto pet={application.animal} />
                </div>
              )}

              <div className="application-card-info">
                <h2>
                  {application.animal ? (
                    <Link to={`/matches/${application.animal.id}`}>{application.animal.name}</Link>
                  ) : (
                    "Pet removed"
                  )}
                </h2>
                <p className="muted small">
                  Sent {formatDate(application.created_at)} · Wants to start {formatDate(application.target_date)}
                </p>
                {application.staff_notes && (
                  <p className="staff-note">
                    <strong>Shelter note:</strong> {application.staff_notes}
                  </p>
                )}
              </div>

              <div className="app-row-side">
                <MatchBadge score={application.match_score} />
                <StatusPill status={application.status} />
              </div>
            </div>

            <ol className="timeline" aria-label="Request progress">
              {timelineSteps(application).map((step) => (
                <li key={step.label} className={`timeline-step timeline-${step.state}`}>
                  <span className="timeline-dot" aria-hidden="true">
                    {step.state === "done" ? "✓" : step.state === "stopped" ? "✕" : ""}
                  </span>
                  <span className="timeline-label">
                    {step.label}
                    <span className="sr-only">
                      {step.state === "current" ? " (in progress)" : step.state === "upcoming" ? " (not yet)" : ""}
                    </span>
                  </span>
                  {step.date && <small>{formatDate(step.date)}</small>}
                </li>
              ))}
            </ol>

            {application.status === "Approved" && application.placement?.status === "Active" && (
              <FosterPanel application={application} onChanged={() => setReload((count) => count + 1)} />
            )}

            {application.status === "Pending" && (
              <div className="application-actions">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => withdraw(application)}>
                  Withdraw request
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
