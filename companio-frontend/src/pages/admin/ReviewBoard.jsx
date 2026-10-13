import { useEffect, useState } from "react";
import api, { errorMessage } from "../../api/client";
import MatchBadge from "../../components/MatchBadge";
import StatusPill from "../../components/StatusPill";
import { EXPERIENCE_LABEL } from "../../constants";

export default function ReviewBoard() {
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [selectedId, setSelectedId] = useState(null);
  const [staffNotes, setStaffNotes] = useState("");
  const [loading, setLoading] = useState(true);

  // READ
  const getApplications = async () => {
    try {
      const response = await api.get("/admin/applications", {
        params: { status: statusFilter || undefined },
      });
      setApplications(response.data);
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getApplications();
  }, [statusFilter]);

  // the application shown on the right (first one if nothing is picked)
  const selected = applications.find((a) => a.id === selectedId) || applications[0] || null;

  // load the saved note whenever a different application is shown
  useEffect(() => {
    setStaffNotes(selected?.staff_notes || "");
  }, [selected?.id]);

  // UPDATE - approve or reject
  const decide = async (status) => {
    const confirmed = window.confirm(
      status === "Approved"
        ? `Approve ${selected.full_name} to foster ${selected.animal.name}? Other requests for this pet will be closed.`
        : `Reject the request of ${selected.full_name}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.patch(`/admin/applications/${selected.id}`, {
        status,
        staff_notes: staffNotes || null,
      });

      alert(`Application ${status.toLowerCase()}!`);
      setSelectedId(null);
      getApplications();
    } catch (error) {
      console.error(error);
      alert(errorMessage(error));
    }
  };

  const profile = selected?.user?.volunteer_profile;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Application review</h1>

        <label className="inline-field">
          Show
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelectedId(null); }}>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : applications.length === 0 ? (
        <div className="card empty">
          <h2>No applications here</h2>
          <p className="muted">New foster requests will appear in this list.</p>
        </div>
      ) : (
        <div className="review-layout">
          <section className="card queue" aria-label="Queue">
            {applications.map((application) => (
              <button
                type="button"
                key={application.id}
                className={selected && application.id === selected.id ? "queue-item queue-active" : "queue-item"}
                onClick={() => setSelectedId(application.id)}
              >
                <span>
                  <strong>{application.full_name}</strong>
                  <small>for {application.animal?.name} · {new Date(application.created_at).toLocaleDateString()}</small>
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
                  <p className="muted small">Target foster date: {selected.target_date}</p>
                </div>

                <div className="card stack-sm">
                  <label className="field">
                    <strong>Staff notes</strong>
                    <textarea
                      rows="3"
                      placeholder="Visible to staff and shown to the applicant"
                      value={staffNotes}
                      onChange={(e) => setStaffNotes(e.target.value)}
                      disabled={selected.status !== "Pending"}
                    />
                  </label>

                  {selected.status === "Pending" ? (
                    <div className="actions">
                      <button type="button" className="btn btn-danger-outline" onClick={() => decide("Rejected")}>
                        Reject
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => decide("Approved")}>
                        Approve placement
                      </button>
                    </div>
                  ) : (
                    <p className="muted small">This application was already {selected.status.toLowerCase()}.</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
