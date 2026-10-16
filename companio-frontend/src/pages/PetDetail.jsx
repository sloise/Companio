import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useAuth } from "../context/auth";
import { useFeedback } from "../context/feedback";
import PetPhoto from "../components/PetPhoto";
import StatusPill from "../components/StatusPill";
import SaveButton from "../components/SaveButton";
import { LoadError, Skeleton } from "../components/PageStates";
import useSavedPets from "../utils/useSavedPets";
import useFosterLimit from "../utils/useFosterLimit";
import FosterLimitCard from "../components/FosterLimitCard";
import { formatDate } from "../utils/format";

// today's date in the browser's own time zone (yyyy-mm-dd), used as the earliest foster date
function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function PetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const { isSaved, toggleSaved } = useSavedPets();
  const fosterLimit = useFosterLimit();

  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to try loading again
  const [sending, setSending] = useState(false);

  // the volunteer's name is filled in from their account
  const [formData, setFormData] = useState({
    full_name: user.name,
    phone: "",
    address: "",
    target_date: "",
    message: "",
    agreed: false,
  });

  // READ SINGLE RECORD
  useEffect(() => {
    const getPet = async () => {
      try {
        const response = await api.get(`/matches/${id}`);
        setPet(response.data);
        setLoadError("");
      } catch (error) {
        if (error.response?.data?.needs_profile) {
          navigate("/questionnaire", { replace: true });
          return;
        }
        // 404 = no such pet (shown below as "Pet not found"); anything else is a loading problem
        if (error.response?.status !== 404) {
          setLoadError(errorMessage(error));
        }
      } finally {
        setLoading(false);
      }
    };

    getPet();
  }, [id, navigate, reload]);

  // INPUT
  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;

    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  // CREATE - send the foster request
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      await api.post("/applications", { ...formData, animal_id: pet.id });
      notify(`Foster request for ${pet.name} sent! We'll let you know when the shelter replies.`);
      navigate("/applications");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <Skeleton rows={2} height={260} />;
  }

  if (loadError) {
    return <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />;
  }

  if (!pet) {
    return (
      <div className="card empty">
        <h2>Pet not found</h2>
        <Link to="/matches">Back to matches</Link>
      </div>
    );
  }

  const open = pet.status === "Awaiting Foster" || pet.status === "Under Review";
  const total = pet.match.checks.length;
  const met = pet.match.checks.filter((check) => check.ok).length;

  return (
    <div className="stack">
      <Link to="/matches" className="back-link">← Back to matches</Link>

      <section className="card pet-hero">
        <div className="pet-hero-photo">
          <PetPhoto pet={pet} />
        </div>

        <div className="pet-hero-info">
          <div className="detail-tags">
            {pet.is_urgent && (
              <span className="badge badge-urgent">
                Urgent · needs a home {pet.needed_by ? `by ${formatDate(pet.needed_by)}` : "soon"}
              </span>
            )}
            <StatusPill status={pet.status} />
          </div>

          <div className="pet-hero-title">
            <h1>{pet.name}</h1>
            <SaveButton pet={pet} saved={isSaved(pet.id)} onToggle={toggleSaved} large />
          </div>
          <div>
            <p className="muted">
              {pet.breed ? `${pet.breed} · ` : ""}
              {pet.species === "cat" ? "Cat" : "Dog"} · {pet.age}
              {pet.sex ? ` · ${pet.sex}` : ""}
            </p>
          </div>

          {pet.description && <p className="lead">{pet.description}</p>}

          <div className="match-banner">
            <strong>{pet.match.score}%</strong>
            <p>
              match with your home.{" "}
              {met === total
                ? "Every care rule set by the shelter is met."
                : `${met} of ${total} care rules set by the shelter are met.`}
            </p>
          </div>
        </div>
      </section>

      <div className="detail-layout">
        <section aria-labelledby="fit-title">
          <h2 id="fit-title">{met === total ? `Why ${pet.name} fits` : `How ${pet.name} fits your home`}</h2>

          <div className="fit-grid">
            {pet.match.checks.map((check) => (
              <div key={check.key} className={check.ok ? "fit-card" : "fit-card fit-card-no"}>
                <div className="fit-card-head">
                  <strong>{check.label}</strong>
                  <span className={check.ok ? "fit-icon" : "fit-icon fit-icon-no"}>
                    <span aria-hidden="true">{check.ok ? "✓" : "✕"}</span>
                    <span className="sr-only">{check.ok ? "Fits" : "Doesn't fit"}</span>
                  </span>
                </div>
                <span className="muted">{pet.name}: {check.need}</span>
                <span>You: {check.home}</span>
              </div>
            ))}
          </div>
        </section>

        <aside>
          {pet.my_request_sent_at ? (
            <div className="card request-card request-sent-card">
              <span className="request-sent-icon" aria-hidden="true">✉</span>
              <h2>You already asked to foster {pet.name}</h2>
              <p className="muted">
                Your request was sent on {formatDate(pet.my_request_sent_at)} and the shelter is reviewing it.
                We&apos;ll notify you as soon as they reply.
              </p>
              <Link className="btn btn-primary" to="/applications">Track my request</Link>
            </div>
          ) : open && fosterLimit?.remaining === 0 ? (
            <div className="card request-card">
              <h2>You&apos;ve reached your foster limit</h2>
              <p className="muted">
                You can have up to {fosterLimit.limit} pets at a time, counting pets you foster and requests that are
                still waiting. To ask for {pet.name}, withdraw a waiting request or finish a current foster.
              </p>
              <FosterLimitCard limit={fosterLimit} />
              <Link className="btn btn-outline" to="/applications">Go to my applications</Link>
            </div>
          ) : open ? (
            <form className="card request-card" onSubmit={handleSubmit}>
              <div className="stack-sm">
                <h2>Request to foster</h2>
                <p className="muted small">
                  Your name, email and home profile are attached automatically.
                </p>
              </div>

              <label className="field">
                Mobile number
                <input name="phone" type="tel" value={formData.phone} onChange={handleChange} autoComplete="tel" required />
              </label>

              <label className="field">
                Home address
                <input name="address" type="text" value={formData.address} onChange={handleChange} autoComplete="street-address" required />
              </label>

              <label className="field">
                When can you start?
                <input
                  name="target_date"
                  type="date"
                  min={today()}
                  value={formData.target_date}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="field">
                Anything the shelter should know?
                <textarea
                  name="message"
                  rows="3"
                  placeholder="Your routine, other pets, experience..."
                  value={formData.message}
                  onChange={handleChange}
                />
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  name="agreed"
                  checked={formData.agreed}
                  onChange={handleChange}
                  required
                />
                I agree to a home check and to return {pet.name} to the shelter if the
                placement doesn&apos;t work out.
              </label>

              <button type="submit" className="btn btn-primary btn-xl" disabled={sending}>
                {sending ? "Sending..." : "Send foster request"}
              </button>
            </form>
          ) : (
            <div className="card request-card">
              <h2>{pet.name} has found a foster home</h2>
              <p className="muted">This pet is no longer open for requests.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
