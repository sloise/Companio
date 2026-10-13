import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import MatchBadge from "../components/MatchBadge";
import StatusPill from "../components/StatusPill";

export default function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // READ
  useEffect(() => {
    const getApplications = async () => {
      try {
        const response = await api.get("/my-applications");
        setApplications(response.data);
      } catch (error) {
        alert(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    getApplications();
  }, []);

  if (loading) {
    return <p className="muted">Loading...</p>;
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
          <article className="card app-row" key={application.id}>
            <div>
              <h2>{application.animal?.name}</h2>
              <p className="muted">
                Sent {new Date(application.created_at).toLocaleDateString()} · Target date {application.target_date}
              </p>
              {application.staff_notes && (
                <p className="small">Shelter note: {application.staff_notes}</p>
              )}
            </div>
            <div className="app-row-side">
              <MatchBadge score={application.match_score} />
              <StatusPill status={application.status} />
            </div>
          </article>
        ))
      )}
    </div>
  );
}
