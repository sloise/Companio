// Turns "2026-10-20" or a full timestamp into a Date.
// Plain dates are read as local dates so they never shift by a day because of time zones.
function toDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

// "20 Oct" (adds the year only when it isn't this year)
export function formatDate(value) {
  if (!value) return "";
  const date = toDate(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// "just now", "5 min ago", "3 hours ago", "2 days ago", or a date for anything older
export function timeAgo(value) {
  const seconds = Math.round((Date.now() - toDate(value).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (seconds < 7 * 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return formatDate(value);
}

// whole days from today until the date (negative = in the past)
export function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((toDate(value).getTime() - today.getTime()) / 86400000);
}

export function urgencyText(pet) {
  const days = daysUntil(pet.needed_by);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Needs a home today';
  return `Needs a home in ${days} day${days === 1 ? '' : 's'}`;
}

export function defaultUrgencyDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
