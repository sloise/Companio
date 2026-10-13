import { Link } from "react-router-dom";
import PetPhoto from "./PetPhoto";
import SaveButton from "./SaveButton";
import { formatDate } from "../utils/format";

// Short label for each care rule, e.g. "Apartment OK" or "Needs fenced yard"
function tagText(key, pet) {
  switch (key) {
    case "housing":
      return pet.apartment_ok ? "Apartment OK" : "Needs a house";
    case "yard":
      return pet.needs_yard ? "Needs fenced yard" : "No yard needed";
    case "pets":
      if (pet.good_with_cats && pet.good_with_dogs) return "Pet-friendly";
      if (pet.good_with_cats) return "Cat-friendly";
      if (pet.good_with_dogs) return "Dog-friendly";
      return "Only-pet home";
    case "kids":
      if (pet.kids_ok === "any") return "Kid-friendly";
      if (pet.kids_ok === "older") return "Kids 10+ only";
      return "Adults-only home";
    case "hours":
      return pet.max_hours_alone >= 12 ? "Alone 8+ hrs" : `Alone up to ${pet.max_hours_alone} hrs`;
    default:
      return key;
  }
}

export default function MatchRow({ pet, saved, onToggleSave }) {
  // up to 3 tags: every rule that doesn't fit, topped up with ones that do (fits shown first)
  const failed = pet.match.checks.filter((check) => !check.ok);
  const passed = pet.match.checks.filter((check) => check.ok);
  const tags = [...passed.slice(0, Math.max(0, 3 - failed.length)), ...failed].slice(0, 3);

  return (
    <article className="match-row">
      <div className="match-row-photo">
        <PetPhoto pet={pet} />
        <SaveButton pet={pet} saved={saved} onToggle={onToggleSave} />
      </div>

      <div className="match-row-info">
        <div className="match-row-title">
          <h2>{pet.name}</h2>
          <span className="muted">
            {pet.species === "cat" ? "Cat" : "Dog"} · {pet.age}
            {pet.sex ? ` · ${pet.sex[0]}` : ""}
          </span>
          {pet.is_urgent && (
            <span className="badge badge-urgent">
              Urgent{pet.needed_by ? ` · by ${formatDate(pet.needed_by)}` : ""}
            </span>
          )}
        </div>

        <ul className="fit-tags" aria-label="Care rules">
          {tags.map((check) => (
            <li key={check.key} className={check.ok ? "fit-tag" : "fit-tag fit-tag-no"}>
              <span aria-hidden="true">{check.ok ? "✓ " : "✕ "}</span>
              <span className="sr-only">{check.ok ? "Fits: " : "Doesn't fit: "}</span>
              {tagText(check.key, pet)}
            </li>
          ))}
        </ul>
      </div>

      <div className="match-row-score">
        <div className="score-line">
          <span>Match</span>
          <strong>{pet.match.score}%</strong>
        </div>
        <div className="score-bar" aria-hidden="true">
          <div style={{ width: `${pet.match.score}%` }} />
        </div>
        <Link className="btn btn-dark" to={`/matches/${pet.id}`} aria-label={`See ${pet.name}'s profile`}>
          See profile →
        </Link>
      </div>
    </article>
  );
}
