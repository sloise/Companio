// "a, b and c"
function joinWithAnd(items) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// "You're using 1 of 2 foster spots" + what's needed for 3 spots
export default function FosterLimitCard({ limit, compact = false }) {
  if (!limit) {
    return null;
  }

  const full = limit.remaining === 0;

  return (
    <div className={`limit-card${full ? " limit-card-full" : ""}${compact ? " limit-card-compact" : ""}`}>
      <div className="limit-head">
        <strong>Foster spots</strong>
        <span className={full ? "limit-count limit-count-full" : "limit-count"}>
          {limit.used} of {limit.limit} used
        </span>
      </div>

      <div className="limit-dots" aria-hidden="true">
        {Array.from({ length: limit.limit }, (_, i) => (
          <span key={i} className={i < limit.active ? "limit-dot dot-active" : i < limit.used ? "limit-dot dot-pending" : "limit-dot"} />
        ))}
      </div>

      <p className="small muted">
        {limit.active} fostering · {limit.pending} waiting for an answer
        {full ? ". You're at your limit for now." : `. You can request ${limit.remaining} more.`}
      </p>

      {!compact && limit.reasons.length > 0 && (
        <p className="small muted">
          To foster {limit.limit + 1} pets at once you&apos;d need to {joinWithAnd(limit.reasons)}.
        </p>
      )}
    </div>
  );
}
