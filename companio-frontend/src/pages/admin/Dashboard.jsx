import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../../api/client";
import { useAuth } from "../../context/auth";
import { useFeedback } from "../../context/feedback";
import StatusPill from "../../components/StatusPill";
import { LoadError, Skeleton } from "../../components/PageStates";
import { daysUntil, formatDate, timeAgo } from "../../utils/format";

// "in 3 days", "today", "2 days late"
function dueText(date) {
  const days = daysUntil(date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return `${-days} day${days === -1 ? "" : "s"} late`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { notify, confirm } = useFeedback();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the dashboard again
  const [staffRequests, setStaffRequests] = useState([]);
  const [staffReload, setStaffReload] = useState(0); // bump to load the staff requests again

  // READ
  useEffect(() => {
    const getDashboard = async () => {
      try {
        const response = await api.get("/admin/dashboard");
        setData(response.data);
        setLoadError("");
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    };

    getDashboard();
  }, [reload]);

  // READ - shelter staff sign-ups waiting for approval
  useEffect(() => {
    const getStaffRequests = async () => {
      try {
        const response = await api.get("/admin/staff-requests");
        setStaffRequests(response.data);
      } catch (error) {
        console.error("Error loading staff requests:", error);
      }
    };

    getStaffRequests();
  }, [staffReload]);

  // UPDATE (approve) or DELETE (decline) a staff request
  const decideStaff = async (person, approve) => {
    if (!approve) {
      const confirmed = await confirm({
        title: `Decline ${person.name}'s request?`,
        message: "Their account will be deleted. They can sign up again if this was a mistake.",
        confirmLabel: "Decline request",
        danger: true,
      });

      if (!confirmed) {
        return;
      }
    }

    try {
      const response = approve
        ? await api.patch(`/admin/staff-requests/${person.id}`)
        : await api.delete(`/admin/staff-requests/${person.id}`);
      notify(response.data.message);
      setStaffReload((count) => count + 1);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  if (loadError) {
    return <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />;
  }

  if (!data) {
    return <Skeleton rows={3} height={140} />;
  }

  const { stats, stages, recent_applications: recent, deadlines, overdue_placements: overdue } = data;

  const cards = [
    { label: "Awaiting foster", value: stats.awaiting_foster, note: `${stats.urgent_awaiting} marked urgent`, tone: "blue", icon: "🏠", to: "/admin/animals" },
    { label: "Pending applications", value: stats.pending_applications, note: `${stats.pending_older_than_2_days} older than 2 days`, tone: "amber", icon: "📝", to: "/admin/applications" },
    { label: "In foster care", value: stats.in_foster_care, note: `${stats.due_back_this_week} due back this week`, tone: "teal", icon: "🤝", to: "/admin/placements" },
    { label: "Adopted this month", value: stats.adopted_this_month, note: "Since the 1st", tone: "dark", icon: "🎉", to: "/admin/placements" },
  ];

  const firstName = user.name.split(" ")[0];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Hi {firstName} 👋</h1>
          <p className="muted">
            {stats.pending_applications} application{stats.pending_applications === 1 ? "" : "s"} waiting for review
          </p>
        </div>
        <Link className="btn btn-primary" to="/admin/animals?new=1">+ Add animal</Link>
      </div>

      {staffRequests.length > 0 && (
        <section className="card table-card" aria-labelledby="staff-requests-title">
          <div className="page-head pad">
            <h2 id="staff-requests-title">Shelter staff requests</h2>
            <span className="muted small">Approved people can sign in and use these admin pages.</span>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Requested</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {staffRequests.map((person) => (
                  <tr key={person.id}>
                    <td><strong>{person.name}</strong></td>
                    <td>{person.email}</td>
                    <td>{timeAgo(person.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => decideStaff(person, false)}>
                          Decline
                        </button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => decideStaff(person, true)}>
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="stat-grid" aria-label="Key numbers">
        {cards.map((card) => (
          <Link className={`card stat-card stat-${card.tone}`} key={card.label} to={card.to}>
            <span className="stat-icon" aria-hidden="true">{card.icon}</span>
            <span className="muted">{card.label}</span>
            <strong>{card.value}</strong>
            <span className="small">{card.note}</span>
          </Link>
        ))}
      </section>

      <section className="attention-grid" aria-label="Needs attention">
        <div className="card attention-card">
          <div className="page-head">
            <h2>⏰ Homes needed soon</h2>
            <Link to="/admin/animals">Animals</Link>
          </div>
          {deadlines.length === 0 ? (
            <p className="muted small">No urgent deadlines. Set a &quot;needs a home by&quot; date on urgent animals to see them here.</p>
          ) : (
            <ul className="attention-list">
              {deadlines.map((animal) => (
                <li key={animal.id}>
                  <span>
                    <strong>{animal.name}</strong>
                    <small className="muted"> · {animal.species === "cat" ? "Cat" : "Dog"} · {animal.status}</small>
                  </span>
                  <span className={daysUntil(animal.needed_by) <= 3 ? "due due-soon" : "due"}>
                    {formatDate(animal.needed_by)} · {dueText(animal.needed_by)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card attention-card">
          <div className="page-head">
            <h2>↩ Overdue returns</h2>
            <Link to="/admin/placements">Placements</Link>
          </div>
          {overdue.length === 0 ? (
            <p className="muted small">All fosters are on schedule. 🎉</p>
          ) : (
            <ul className="attention-list">
              {overdue.map((placement) => (
                <li key={placement.id}>
                  <span>
                    <strong>{placement.animal?.name}</strong>
                    <small className="muted"> · with {placement.application?.full_name}</small>
                  </span>
                  <span className="due due-late">
                    was due {formatDate(placement.expected_return_date)} · {dueText(placement.expected_return_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="stack-sm">
        <div className="page-head">
          <h2>Placement pipeline</h2>
          <Link to="/admin/placements">View all placements</Link>
        </div>

        <div className="table-scroll">
          <div className="pipeline">
            {stages.map((stage) => (
              <div className="stage" key={stage.name}>
                <div className="stage-head">
                  <StatusPill status={stage.name} />
                  <span className="count">{stage.count}</span>
                </div>

                {stage.animals.length === 0 && <p className="muted small">Nothing here yet</p>}

                {stage.animals.map((animal) => (
                  <div className="stage-card" key={animal.id}>
                    <div>
                      <strong>{animal.name}</strong>
                      <span className="muted small">
                        {animal.species === "cat" ? "Cat" : "Dog"} · {animal.age}
                      </span>
                    </div>
                    {animal.is_urgent && <span className="badge badge-urgent">Urgent</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card table-card">
        <div className="page-head pad">
          <h2>Newest applications</h2>
          <Link to="/admin/applications">Open review board</Link>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Pet</th>
                <th>Match</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan="5" className="muted">No pending applications.</td></tr>
              )}
              {recent.map((application) => (
                <tr key={application.id}>
                  <td><strong>{application.user?.name}</strong></td>
                  <td>{application.animal?.name}</td>
                  <td className="fit-ok">{application.match_score}%</td>
                  <td>{timeAgo(application.created_at)}</td>
                  <td><StatusPill status={application.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
