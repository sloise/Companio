import { useEffect, useState } from "react";
import api, { errorMessage } from "../../api/client";
import { useFeedback } from "../../context/feedback";
import MatchBadge from "../../components/MatchBadge";
import PetPhoto from "../../components/PetPhoto";
import StatusPill from "../../components/StatusPill";
import { LoadError, Skeleton } from "../../components/PageStates";
import { EXPERIENCE_LABEL } from "../../constants";
import { formatDate, timeAgo } from "../../utils/format";

const STATUS_TABS = [
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Rejected" },
  { value: "Withdrawn", label: "Withdrawn" },
  { value: "", label: "All" },
];

// Staff notes + the Approve / Reject / Reopen buttons for one application.
// It gets a new "key" for every application, so the notes box starts fresh each time.
function DecisionPanel({ application, onChanged }) {
  const { notify, confirm } = useFeedback();
  const [staffNotes, setStaffNotes] = useState(application.staff_notes || "");
  const [busy, setBusy] = useState(false);

  // UPDATE - approve or reject
  const decide = async (status) => {
    const approving = status === "Approved";
    const confirmed = await confirm({
      title: approving
        ? `Approve ${application.full_name} to foster ${application.animal.name}?`
        : `Reject ${application.full_name}'s request?`,
      message: approving
        ? "A placement starts on their target date. Other pending requests for this pet will be closed and those applicants notified."
        : "The applicant will be notified. You can reopen it later if this was a mistake.",
      confirmLabel: approving ? "Approve placement" : "Reject request",
      danger: !approving,
    });

    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await api.patch(`/admin/applications/${application.id}`, {
        status,
        staff_notes: staffNotes || null,
      });
      notify(approving ? `Approved! ${application.animal.name} is now in foster care.` : "Request rejected. The applicant was notified.");
      onChanged();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  // UPDATE - undo a rejection
  const reopen = async () => {
    const confirmed = await confirm({
      title: `Reopen ${application.full_name}'s request?`,
      message: "It goes back to Pending so you can decide again. The applicant will be notified.",
      confirmLabel: "Reopen request",
    });

    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      const response = await api.patch(`/admin/applications/${application.id}/reopen`);
      notify(response.data.message);
      onChanged("Pending");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const pending = application.status === "Pending";

  return (
    <div className="card stack-sm">
      <label className="field">
        Staff notes
        <textarea
          rows="3"
          placeholder="Shown to the applicant with your decision"
          value={staffNotes}
          onChange={(e) => setStaffNotes(e.target.value)}
          disabled={!pending}
        />
      </label>

      {pending ? (
        <div className="actions">
          <button type="button" className="btn btn-danger-outline" onClick={() => decide("Rejected")} disabled={busy}>
            Reject
          </button>
          <button type="button" className="btn btn-primary" onClick={() => decide("Approved")} disabled={busy}>
            Approve placement
          </button>
        </div>
      ) : (
        <>
          <p className="muted small">
            {application.status === "Withdrawn"
              ? `The applicant withdrew this request ${timeAgo(application.updated_at)}.`
              : `${application.status} ${application.decider ? `by ${application.decider.name} ` : ""}${timeAgo(application.decided_at || application.updated_at)}.`}
          </p>
          {application.status === "Rejected" && (
            <button type="button" className="btn btn-outline" onClick={reopen} disabled={busy}>
              ↺ Reopen this request
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function ReviewBoard() {
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the list again

  // READ
  useEffect(() => {
    const getApplications = async () => {
      try {
        const response = await api.get("/admin/applications", {
          params: { status: statusFilter || undefined, search: search || undefined },
        });
        setApplications(response.data);
        setLoadError("");
      } catch (error) {
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    // wait a moment while the admin is still typing
    const timer = setTimeout(getApplications, 250);
    return () => clearTimeout(timer);
  }, [statusFilter, search, reload]);

  // after a decision: refresh the list (optionally jumping to another tab)
  const handleChanged = (goToStatus) => {
    setSelectedId(null);
    if (goToStatus) {
      setStatusFilter(goToStatus);
    }
    setReload((count) => count + 1);
  };

  // the application shown on the right (first one if nothing is picked)
  const selected = applications.find((a) => a.id === selectedId) || applications[0] || null;
  const profile = selected?.user?.volunteer_profile;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Application review</h1>
          <p className="muted">Check how each home fits the pet&apos;s care rules, then approve or reject.</p>
        </div>
      </div>

      <div className="card filters">
        <label className="filter-search">
          <span className="sr-only">Search applications</span>
          <input
            type="search"
            placeholder="Search applicant, email or pet"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
          />
        </label>

        <div className="segmented status-tabs" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={statusFilter === tab.value ? "seg seg-active" : "seg"}
              aria-pressed={statusFilter === tab.value}
              onClick={() => { setStatusFilter(tab.value); setSelectedId(null); }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton rows={2} height={220} />
      ) : loadError ? (
        <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />
      ) : applications.length === 0 ? (
        <div className="card empty">
          <h2>No applications here</h2>
          <p className="muted">{search ? "Nothing matches your search." : "New foster requests will appear in this list."}</p>
        </div>
      ) : (
        <div className="review-layout">
          <section className="card queue" aria-label="Queue">
            {applications.map((application) => (
              <button
                type="button"
                key={application.id}
                className={selected && application.id === selected.id ? "queue-item queue-active" : "queue-item"}
                aria-current={selected && application.id === selected.id ? "true" : undefined}
                onClick={() => setSelectedId(application.id)}
              >
                {application.animal && (
                  <span className="queue-thumb" aria-hidden="true">
                    <PetPhoto pet={application.animal} />
                  </span>
                )}
                <span className="queue-text">
                  <strong>{application.full_name}</strong>
                  <small>for {application.animal?.name} · {timeAgo(application.created_at)}</small>
                </span>
                <span className="queue-score">{application.match_score}%</span>
              </button>
            ))}
          </section>

          {selected && (
            <section className="stack">
              <div className="card detail-head">
                <div>
                  <h2>{selected.full_name} → {selected.animal?.name}</h2>
                  <p className="muted">
                    {selected.user?.email} · {selected.phone}
                  </p>
                  <p className="muted">{selected.address}</p>
                </div>
                <div className="detail-tags">
                  <MatchBadge score={selected.match_score} />
                  <StatusPill status={selected.status} />
                </div>
              </div>

              <div className="card table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Check</th>
                        <th>{selected.animal?.name} needs</th>
                        <th>Applicant&apos;s home</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.match?.checks.map((check) => (
                        <tr key={check.key}>
                          <td><strong>{check.label}</strong></td>
                          <td>{check.need}</td>
                          <td>{check.home}</td>
                          <td className={check.ok ? "fit-ok" : "fit-no"}>
                            {check.ok ? "✓ Met" : "✕ Not met"}
                          </td>
                        </tr>
                      ))}
                      {profile && (
                        <tr>
                          <td><strong>Experience</strong></td>
                          <td>Any level</td>
                          <td>{EXPERIENCE_LABEL[profile.experience] || profile.experience}</td>
                          <td className="muted">Info only</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="two-col two-col-even">
                <div className="card stack-sm">
                  <h3>Applicant&apos;s message</h3>
                  <p>{selected.message || "No message."}</p>
                  <p className="muted small">Wants to start {formatDate(selected.target_date)}</p>
                </div>

                <DecisionPanel key={selected.id} application={selected} onChanged={handleChanged} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
