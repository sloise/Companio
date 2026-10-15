import { useEffect, useState } from "react";
import api, { errorMessage } from "../../api/client";
import { useFeedback } from "../../context/feedback";
import PetPhoto from "../../components/PetPhoto";
import StatusPill from "../../components/StatusPill";
import { LoadError, Skeleton } from "../../components/PageStates";
import { daysUntil, formatDate, timeAgo } from "../../utils/format";

const STATUS_TABS = [
  { value: "Active", label: "Active" },
  { value: "Returned", label: "Returned" },
  { value: "Adopted", label: "Adopted" },
  { value: "", label: "All" },
];

// an active placement past its expected return date
function isOverdue(placement) {
  return placement.status === "Active" && placement.expected_return_date && daysUntil(placement.expected_return_date) < 0;
}

export default function Placements() {
  const { notify, confirm } = useFeedback();

  const [placements, setPlacements] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the list again

  // READ
  useEffect(() => {
    const getPlacements = async () => {
      try {
        const response = await api.get("/admin/placements", {
          params: { status: statusFilter || undefined },
        });
        setPlacements(response.data);
        setLoadError("");
      } catch (error) {
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    getPlacements();
  }, [statusFilter, reload]);

  // UPDATE - change the placement stage (the foster is notified)
  const updateStatus = async (placement, status) => {
    const adopted = status === "Adopted";
    const confirmed = await confirm({
      title: adopted ? `Mark ${placement.animal.name} as adopted?` : `Mark ${placement.animal.name} as returned?`,
      message: adopted
        ? "The animal's status becomes Adopted and the foster gets a thank-you notification."
        : "The animal goes back to Awaiting Foster so new volunteers can apply.",
      confirmLabel: adopted ? "Mark adopted" : "Mark returned",
    });

    if (!confirmed) {
      return;
    }

    try {
      await api.patch(`/admin/placements/${placement.id}`, {
        status,
        expected_return_date: placement.expected_return_date,
        notes: placement.notes,
      });

      notify(adopted ? `${placement.animal.name} was adopted! 🎉` : `${placement.animal.name} is back at the shelter and open for new fosters.`);
      setReload((count) => count + 1);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  // DELETE - "keep fostering": answer the foster's adopt / return request without ending the placement
  const keepFostering = async (placement) => {
    const confirmed = await confirm({
      title: `Keep ${placement.animal.name} in foster care for now?`,
      message: `${placement.application?.full_name} will be told their request was answered and that ${placement.animal.name} stays with them for now.`,
      confirmLabel: "Keep fostering",
    });
    if (!confirmed) return;

    try {
      const response = await api.delete(`/admin/placements/${placement.id}/request`);
      notify(response.data.message);
      setReload((count) => count + 1);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const overdueCount = placements.filter(isOverdue).length;
  const requestCount = placements.filter((p) => p.status === "Active" && p.foster_request).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Placements</h1>
          <p className="muted">
            {[
              requestCount > 0 && `${requestCount} foster${requestCount === 1 ? " is" : "s are"} waiting for your answer.`,
              overdueCount > 0 && `${overdueCount} foster${overdueCount === 1 ? " is" : "s are"} past the expected return date.`,
            ].filter(Boolean).join(" ") || "Animals currently with fosters, and where they ended up."}
          </p>
        </div>

        <div className="segmented status-tabs" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={statusFilter === tab.value ? "seg seg-active" : "seg"}
              aria-pressed={statusFilter === tab.value}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton rows={3} height={90} />
      ) : loadError ? (
        <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />
      ) : placements.length === 0 ? (
        <div className="card empty">
          <h2>No placements here</h2>
          <p className="muted">Approving a foster request starts a placement.</p>
        </div>
      ) : (
        <div className="placement-list">
          {placements.map((placement) => {
            const overdue = isOverdue(placement);
            const request = placement.status === "Active" ? placement.foster_request : null;
            const fosterName = placement.application?.full_name || placement.application?.user?.name;

            return (
              <article
                className={`card placement-card${overdue ? " placement-overdue" : ""}${request ? " placement-has-request" : ""}`}
                key={placement.id}
              >
                {request && (
                  <div className={`placement-request placement-request-${request}`}>
                    <p>
                      <strong>
                        {request === "adopt"
                          ? `🏠 ${fosterName} wants to adopt ${placement.animal?.name}`
                          : `↩ ${fosterName} wants to return ${placement.animal?.name}`}
                      </strong>
                      <span className="muted small"> · {timeAgo(placement.foster_requested_at)}</span>
                    </p>
                    {placement.foster_request_note && <p className="small">“{placement.foster_request_note}”</p>}
                    <p className="muted small">
                      {request === "adopt"
                        ? "Click Adopted to confirm, or Keep fostering if it's not the right time yet."
                        : "Click Returned once the pet is back at the shelter, or Keep fostering to answer without ending it."}
                    </p>
                  </div>
                )}

                {placement.animal && (
                  <div className="placement-thumb">
                    <PetPhoto pet={placement.animal} />
                  </div>
                )}

                <div className="placement-info">
                  <h2>{placement.animal?.name}</h2>
                  <p className="muted small">
                    with <strong>{placement.application?.full_name || placement.application?.user?.name}</strong>
                    {placement.application?.phone ? ` · ${placement.application.phone}` : ""}
                  </p>
                  {placement.notes && <p className="small">{placement.notes}</p>}
                </div>

                <dl className="placement-dates">
                  <div>
                    <dt>Started</dt>
                    <dd>{formatDate(placement.foster_start_date)}</dd>
                  </div>
                  <div>
                    <dt>Expected back</dt>
                    <dd>
                      {placement.expected_return_date ? formatDate(placement.expected_return_date) : "-"}
                      {overdue && <span className="badge badge-overdue">Overdue</span>}
                    </dd>
                  </div>
                </dl>

                <div className="placement-side">
                  <StatusPill status={placement.status} />
                  {placement.status === "Active" && (
                    <div className="row-actions">
                      {request && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => keepFostering(placement)}>
                          Keep fostering
                        </button>
                      )}
                      <button
                        type="button"
                        className={request === "return" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                        onClick={() => updateStatus(placement, "Returned")}
                      >
                        Returned
                      </button>
                      <button
                        type="button"
                        className={request === "return" ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"}
                        onClick={() => updateStatus(placement, "Adopted")}
                      >
                        Adopted
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
