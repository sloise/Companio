import { useEffect, useState } from "react";
import api, { errorMessage } from "../../api/client";
import StatusPill from "../../components/StatusPill";

export default function Placements() {
  const [placements, setPlacements] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Active");

  // READ
  const getPlacements = async () => {
    try {
      const response = await api.get("/admin/placements", {
        params: { status: statusFilter || undefined },
      });
      setPlacements(response.data);
    } catch (error) {
      alert(errorMessage(error));
    }
  };

  useEffect(() => {
    getPlacements();
  }, [statusFilter]);

  // UPDATE - change the placement stage
  const updateStatus = async (placement, status) => {
    const confirmed = window.confirm(
      status === "Adopted"
        ? `Mark ${placement.animal.name} as adopted?`
        : `Mark ${placement.animal.name} as returned to the shelter?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.patch(`/admin/placements/${placement.id}`, {
        status,
        expected_return_date: placement.expected_return_date,
        notes: placement.notes,
      });

      alert("Placement updated successfully!");
      getPlacements();
    } catch (error) {
      console.error(error);
      alert(errorMessage(error));
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Placements</h1>

        <label className="inline-field">
          Show
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Returned">Returned</option>
            <option value="Adopted">Adopted</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      <div className="card table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Animal</th>
                <th>Foster</th>
                <th>Start</th>
                <th>Expected return</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {placements.length === 0 && (
                <tr><td colSpan="6" className="muted">No placements found.</td></tr>
              )}

              {placements.map((placement) => (
                <tr key={placement.id}>
                  <td><strong>{placement.animal?.name}</strong></td>
                  <td>
                    {placement.application?.user?.name}
                    {placement.notes && <div className="muted small">{placement.notes}</div>}
                  </td>
                  <td>{placement.foster_start_date}</td>
                  <td>{placement.expected_return_date || "-"}</td>
                  <td><StatusPill status={placement.status} /></td>
                  <td>
                    {placement.status === "Active" && (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => updateStatus(placement, "Returned")}
                        >
                          Returned
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => updateStatus(placement, "Adopted")}
                        >
                          Adopted
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
