// 100% = strong, 80% = good, anything lower = fair
export default function MatchBadge({ score }) {
  let level = "match-fair";

  if (score >= 100) {
    level = "match-strong";
  } else if (score >= 80) {
    level = "match-good";
  }

  return <span className={`badge ${level}`}>{score}% match</span>;
}
