import CompanionArt from "../../components/CompanionArt";
import Icon from "../../components/Icon";
import StaffRequests from "./StaffRequests";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../../api/client";
import { useAuth } from "../../context/auth";
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

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the dashboard again
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

  if (loadError) {
    return <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />;
  }

  if (!data) {
    return <Skeleton rows={3} height={140} />;
  }

  const { stats, stages, recent_applications: recent, deadlines, overdue_placements: overdue } = data;

  const cards = [
    { label: "Awaiting foster", value: stats.awaiting_foster, note: `${stats.urgent_awaiting} marked urgent`, tone: "blue", icon: "home", to: "/admin/animals" },
    { label: "Pending applications", value: stats.pending_applications, note: `${stats.pending_older_than_2_days} older than 2 days`, tone: "amber", icon: "clipboard", to: "/admin/applications" },
    { label: "In foster care", value: stats.in_foster_care, note: `${stats.due_back_this_week} due back this week`, tone: "teal", icon: "heart", to: "/admin/placements" },
    { label: "Adopted this month", value: stats.adopted_this_month, note: "Since the 1st", tone: "dark", icon: "check", to: "/admin/placements" },
  ];

  const firstName = user.name.split(" ")[0];

  return (
    <div className="stack">
      <div className="page-head dashboard-welcome">
        <div>
          <p className="eyebrow"><Icon name="paw" size={14}/> THE CARE COLLECTIVE / SHELTER OVERVIEW</p><h1>Welcome back, {firstName}</h1>
          <p className="muted">
            {stats.pending_applications} application{stats.pending_applications === 1 ? "" : "s"} waiting for review
          </p>
        </div>
        <div className="dashboard-welcome-right"><div className="dashboard-pet-duo" aria-hidden="true"><CompanionArt species="dog" pose="happy"/><CompanionArt species="cat" pose="sit"/></div><Link className="btn btn-primary" to="/admin/animals?new=1"><Icon name="plus" size={16}/> Add animal</Link></div>
      </div>


      <section className="care-desk" aria-label="Shelter shortcuts"><div><span className="care-desk-icon"><Icon name="heart" size={22}/></span><span><strong>Every little action moves a life forward.</strong><small>Your care desk, all in one place.</small></span></div><div className="care-desk-links"><Link to="/admin/applications"><Icon name="clipboard" size={16}/> Review applications <Icon name="arrow" size={15}/></Link><Link to="/admin/placements"><Icon name="home" size={16}/> Follow placements <Icon name="arrow" size={15}/></Link></div></section>

      <section className="stat-grid" aria-label="Key numbers">
        {cards.map((card) => (
          <Link className={`card stat-card stat-${card.tone}`} key={card.label} to={card.to}>
            <span className="stat-icon" aria-hidden="true"><Icon name={card.icon} size={25}/></span>
            <span className="muted">{card.label}</span>
            <strong>{card.value}</strong>
            <span className="small">{card.note}</span>
          </Link>
        ))}
      </section>

      {deadlines.some(pet => daysUntil(pet.needed_by) < 0) && <div className="notice notice-info" role="alert"><strong>Overdue urgency deadlines</strong><p>Renew the deadline or clear urgency for: {deadlines.filter(pet => daysUntil(pet.needed_by) < 0).map(pet => pet.name).join(', ')}.</p><Link to="/admin/animals">Review urgent pets</Link></div>}
      {user.role === "super_admin" && <StaffRequests summary />}

      <section className="attention-grid" aria-label="Needs attention">
        <div className="card attention-card">
          <div className="page-head">
            <h2 className="icon-heading"><Icon name="clock"/> Homes needed soon</h2>
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
            <h2 className="icon-heading"><Icon name="refresh"/> Overdue returns</h2>
            <Link to="/admin/placements">Placements</Link>
          </div>
          {overdue.length === 0 ? (
            <p className="muted small">All fosters are on schedule. </p>
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

        <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records">
          <div className="pipeline">
            {stages.map((stage) => (
              <div className="stage" data-stage={stage.name} key={stage.name}>
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

        <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records">
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
