import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../../api/client";
import StatusPill from "../../components/StatusPill";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [staffRequests, setStaffRequests] = useState([]);
  const [staffReload, setStaffReload] = useState(0); // bump to load the staff requests again

  // READ
  useEffect(() => {
    const getDashboard = async () => {
      try {
        const response = await api.get("/admin/dashboard");
        setData(response.data);
      } catch (error) {
        alert(errorMessage(error));
      }
    };

    getDashboard();
  }, []);

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
    if (!approve && !window.confirm(`Decline ${person.name}'s request? Their account will be deleted.`)) {
      return;
    }

    try {
      const response = approve
        ? await api.patch(`/admin/staff-requests/${person.id}`)
        : await api.delete(`/admin/staff-requests/${person.id}`);
      alert(response.data.message);
      setStaffReload((count) => count + 1);
    } catch (error) {
      alert(errorMessage(error));
    }
  };

  if (!data) {
    return <p className="muted">Loading dashboard...</p>;
  }

  const { stats, stages, recent_applications: recent } = data;

  const cards = [
    { label: "Awaiting foster", value: stats.awaiting_foster, note: `${stats.urgent_awaiting} marked urgent` },
    { label: "Pending applications", value: stats.pending_applications, note: `${stats.pending_older_than_2_days} older than 2 days` },
    { label: "In foster care", value: stats.in_foster_care, note: `${stats.due_back_this_week} due back this week` },
    { label: "Adopted this month", value: stats.adopted_this_month, note: "Since the 1st" },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
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
                    <td>{new Date(person.created_at).toLocaleDateString()}</td>
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
          <div className="card stat-card" key={card.label}>
            <span className="muted">{card.label}</span>
            <strong>{card.value}</strong>
            <span className="small">{card.note}</span>
          </div>
        ))}
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
                  <strong>{stage.name}</strong>
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
                  <td>{new Date(application.created_at).toLocaleDateString()}</td>
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
