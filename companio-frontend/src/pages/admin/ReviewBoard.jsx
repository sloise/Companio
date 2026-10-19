import Icon from "../../components/Icon";
import useConfirmedAction from "../../utils/useConfirmedAction";
import { useEffect, useState } from "react";
import api, { errorMessage } from "../../api/client";
import { useFeedback } from "../../context/feedback";
import ProfileReviews from "../../components/ProfileReviews";
import VerificationPanel from "../../components/VerificationPanel";
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
  const { notify } = useFeedback();
  const [staffNotes, setStaffNotes] = useState(application.staff_notes || "");
  const {run,busy} = useConfirmedAction();

  // UPDATE - approve or reject
  const decide = (status) => {
    const approving = status === "Approved";
    return run({
      title:(approving ? "Approve " : "Reject ") + application.full_name + "'s request for " + application.animal.name + "?",
      message:approving ? "A placement starts on their target date. Other pending requests for this pet will be closed and the applicants notified." : "The applicant will receive your rejection reason. You can reopen the request later.",
      confirmLabel:approving ? "Confirm Approval" : "Confirm Rejection",danger:!approving,
      reasonRequired:!approving,initialReason:staffNotes,reasonMaxLength:500,
    }, async (answer) => {
      await api.patch('/admin/applications/'+application.id, {status,staff_notes:approving ? staffNotes || null : answer});
      notify(approving ? application.animal.name + " is now in foster care." : "Request rejected. The applicant was notified."); onChanged();
    });
  };
  const reopen = () => run({
    title:"Reopen " + application.full_name + "'s request for " + application.animal?.name + "?",
    message:"The application goes back to Pending for review. The applicant will be notified.",confirmLabel:"Reopen Request",
  }, async () => {
    const response = await api.patch('/admin/applications/'+application.id+'/reopen'); notify(response.data.message); onChanged("Pending");
  });

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
          disabled={!pending || busy}
          maxLength={500}
        />
      </label>

      {pending ? (
        <div className="actions">
          <button type="button" className="btn btn-danger-outline" onClick={() => decide("Rejected")} disabled={busy}>
            Reject
          </button>
          <button type="button" className="btn btn-primary" onClick={() => decide("Approved")} disabled={busy || !application.verification_completed_at || !application.match?.eligible || application.user?.volunteer_profile?.review_status !== "Approved"}>
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
              <Icon name="refresh" size={16}/> Reopen this request
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function ReviewBoard() {
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("oldest");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the list again

  // READ
  useEffect(() => {
    const getApplications = async () => {
      try {
        const response = await api.get("/admin/applications");
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

  // Refresh records without changing the current filters or selection.
  const handleChanged = () => {
    setReload((count) => count + 1);
  };

  // the application shown on the right (first one if nothing is picked)
  const query = search.trim().toLocaleLowerCase();
  const shown = applications.filter(application =>
    (!statusFilter || application.status === statusFilter) &&
    [application.full_name, application.user?.name, application.user?.email, application.animal?.name]
      .some(value => (value || "").toLocaleLowerCase().includes(query))
  ).sort((a, b) => {
    const order = (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || a.id - b.id;
    return sort === "oldest" ? order : -order;
  });
  const filtersActive = Boolean(search || statusFilter || sort !== "oldest");
  const selected = shown.find((a) => a.id === selectedId) || shown[0] || null;
  const profile = selected?.user?.volunteer_profile;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Application review</h1>
          <p className="muted">Check how each home fits the pet&apos;s care rules, then approve or reject.</p>
        </div>
      </div>

      <ProfileReviews />
      <div className="card filters">
        <label className="field filter-search">
          <span>Search applicants</span>
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
        <label className="field">Sort applicants<select aria-label="Sort applicants" value={sort} onChange={event => setSort(event.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
        {filtersActive && <button type="button" className="btn btn-outline" onClick={() => {setSearch("");setStatusFilter("");setSort("oldest");}}>Reset</button>}
      </div>
      {!loading && !loadError && <p className="muted small" role="status">Showing {shown.length} of {applications.length} applicants</p>}

      {loading ? (
        <Skeleton rows={2} height={220} />
      ) : loadError ? (
        <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />
      ) : shown.length === 0 ? (
        <div className="card empty">
          <h2>{applications.length ? "No applicants match your search." : "No applicants yet"}</h2>
          <p className="muted">{search ? "Nothing matches your search." : "New foster requests will appear in this list."}</p>
        </div>
      ) : (
        <div className="review-layout">
          <section className="card queue" aria-label="Queue">
            {shown.map((application) => (
              <button
                type="button"
                key={application.id}
                className={`queue-item queue-${application.status.toLowerCase()}${selected && application.id === selected.id ? " queue-active" : ""}`}
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
                <span className="queue-side">
                  <span className="queue-score">{application.match_score}%</span>
                  <span className="queue-status">{application.status}</span>
                </span>
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
                <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records">
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
                            <span className="icon-heading"><Icon name={check.ok ? "check" : "x"} size={16}/>{check.ok ? "Met" : "Not met"}</span>
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

              {selected.foster_limit && (
                <div
                  className={
                    selected.status === "Pending" && selected.foster_limit.active >= selected.foster_limit.limit
                      ? "notice notice-error applicant-limit"
                      : "notice notice-info applicant-limit"
                  }
                >
                  <strong>Foster limit: {selected.foster_limit.limit} pets at a time.</strong>{" "}
                  {selected.full_name} is fostering {selected.foster_limit.active} now
                  {" "}and has {selected.foster_limit.pending} request{selected.foster_limit.pending === 1 ? "" : "s"} waiting
                  {selected.foster_limit.completed > 0 ? ` · ${selected.foster_limit.completed} foster${selected.foster_limit.completed === 1 ? "" : "s"} completed before` : ""}.
                  {selected.status === "Pending" && selected.foster_limit.active >= selected.foster_limit.limit
                    ? " They can't take another pet until one of their fosters ends."
                    : ""}
                </div>
              )}

              <VerificationPanel key={selected.id} application={selected} onChanged={handleChanged} />
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
