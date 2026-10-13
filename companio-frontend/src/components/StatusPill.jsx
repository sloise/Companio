// Small coloured label for an animal / application / placement status
const CLASSES = {
  "Awaiting Foster": "pill-blue",
  "Under Review": "pill-amber",
  "In Foster Care": "pill-teal",
  Adopted: "pill-dark",
  Pending: "pill-amber",
  Approved: "pill-teal",
  Rejected: "pill-red",
  Active: "pill-teal",
  Returned: "pill-blue",
};

export default function StatusPill({ status }) {
  return <span className={`pill ${CLASSES[status] || "pill-blue"}`}>{status}</span>;
}
