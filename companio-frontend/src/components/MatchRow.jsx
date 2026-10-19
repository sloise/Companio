import { urgencyText } from "../utils/format";
import Icon from "./Icon";
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
  const tags = pet.match.checks;

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
          {pet.my_request_sent_at && (
            <span className="badge badge-sent" title={`You sent a foster request on ${formatDate(pet.my_request_sent_at)}`}>
              <Icon name="mail" size={14}/> Request sent
            </span>
          )}
          {pet.is_urgent && (
            <span className="badge badge-urgent">
              {urgencyText(pet)}
            </span>
          )}
        </div>

        <ul className="fit-tags" aria-label="Care rules">
          {tags.map((check) => (
            <li key={check.key} className={check.ok ? "fit-tag" : "fit-tag fit-tag-no"}>
              <Icon name={check.ok ? "check" : "x"} size={14}/>
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
          {pet.my_request_sent_at ? "View pet →" : "See profile →"}
        </Link>
      </div>
    </article>
  );
}
