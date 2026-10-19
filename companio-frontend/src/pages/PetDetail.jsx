import { urgencyText } from "../utils/format";
import ValidatedForm from "../components/ValidatedForm";
import Icon from "../components/Icon";
import useConfirmedAction from "../utils/useConfirmedAction";
import { phoneProps } from "../utils/phone";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useAuth } from "../context/auth";
import { useFeedback } from "../context/feedback";
import PrivacyNotice from "../components/PrivacyNotice";
import ApplicationScreeningFields from "../components/ApplicationScreeningFields";
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
  const [profile, setProfile] = useState(null);
  const [files, setFiles] = useState({ home_photos: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to try loading again
  const {run, busy:sending} = useConfirmedAction();

  // the volunteer's name is filled in from their account
  const [formData, setFormData] = useState({
    interview_type: "interview", interview_at: "", cosigner_name: "", cosigner_phone: "", cosigner_birth_date: "", cosigner_relationship: "", cosigner_consent: false,
    full_name: user.name,
    phone: "",
    address: "",
    target_date: "",
    message: "",
    agreed: false,
    privacy_consent: false,
    privacy_notice_version: "",
  });

  const handlePrivacyNotice = useCallback(version => {
    setFormData(current => current.privacy_notice_version === version ? current : {...current, privacy_notice_version: version, privacy_consent: false});
  }, []);

  // READ SINGLE RECORD
  useEffect(() => {
    const getPet = async () => {
      try {
        const [response, savedProfile] = await Promise.all([api.get(`/matches/${id}`), api.get("/profile")]);
        setProfile(savedProfile.data);
        setFormData((current) => ({ ...current, phone: savedProfile.data?.phone || "", address: savedProfile.data?.address || "" }));
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

    try {
      if (!formData.privacy_consent || !formData.privacy_notice_version) throw new Error('Read the privacy notice and give consent before submitting.');
      if (!files.government_id || files.home_photos.length < 2 || files.home_photos.length > 5) {
        throw new Error('Upload your government ID and 2-5 home photos.');
      }
      const payload = new FormData();
      Object.entries({ ...formData, animal_id: pet.id }).forEach(([key,value]) => payload.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value));
      payload.set('interview_at', new Date(formData.interview_at).toISOString());
      payload.append('government_id', files.government_id);
      files.home_photos.forEach((file) => payload.append('home_photos[]', file));
      if (files.cosigner_id) payload.append('cosigner_id', files.cosigner_id);
      await run({title:"Submit a foster application for " + pet.name + "?",message:"Your saved home profile, documents and requested appointment will be sent to shelter staff for review.",confirmLabel:"Submit Application"}, async () => {
        await api.post('/applications', payload, {timeout:60000});
        notify("Foster request for " + pet.name + " sent. The shelter will review your application.");
        navigate("/applications");
      });
    } catch (error) {
      notify(error.response ? errorMessage(error) : error.message || errorMessage(error), "error");
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

  const birth = profile?.birth_date ? new Date(profile.birth_date + 'T00:00:00') : null;
  const adultAt = birth ? new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate()) : null;
  const minor = adultAt && adultAt > new Date();
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
                {urgencyText(pet)}
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

          <section className="stack-sm" aria-label="Health records"><p className="muted">{pet.health_status || "Records Unavailable"} &middot; {pet.sterilization_status || "Unknown/No Records"}</p>{pet.vaccinations?.map((v) => <p className="small" key={v.type}>{v.type === "Other" ? v.other_name : v.type}: {v.vaccinated_at ? formatDate(v.vaccinated_at) : "Vaccination date unknown"}{v.next_due_at ? " \u00b7 Next due " + formatDate(v.next_due_at) : ""}</p>)}</section>
          {pet.description && <p className="lead">{pet.description}</p>}
          {pet.is_urgent && <p className="notice notice-info">Urgent: {pet.urgent_reason || 'Staff review needed'}{pet.urgent_notes ? `: ${pet.urgent_notes}` : ''} Urgency affects listing priority; care requirements and screening still apply.</p>}

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
                    <Icon name={check.ok ? "check" : "x"} size={15}/>
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
              <span className="request-sent-icon" aria-hidden="true"><Icon name="mail" size={26}/></span>
              <h2>You already asked to foster {pet.name}</h2>
              <p className="muted">
                Your request was sent on {formatDate(pet.my_request_sent_at)} and the shelter is reviewing it.
                We&apos;ll notify you as soon as they reply.
              </p>
              <Link className="btn btn-primary" to="/applications">Track my request</Link>
            </div>
          ) : open && (profile?.review_status !== 'Approved' || !pet.match.eligible) ? (
            <div className="card request-card"><h2>Before you apply</h2><p>{profile?.review_status !== 'Approved' ? 'Your saved profile must be approved by the shelter before applying.' : 'Applications require a minimum compatibility score of 60%. Unmatched care rules are shown for shelter review.'}</p><Link to="/profile">View profile and screening</Link></div>
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
            <ValidatedForm className="card request-card" onSubmit={handleSubmit}>
              <div className="stack-sm">
                <h2>Request to foster</h2>
                <p className="muted small">
                  Your name, email and home profile are attached automatically.
                </p>
              </div>

              <label className="field">
                <span>Mobile number <span className="required-mark" aria-hidden="true">*</span></span><input name="phone" type="tel" {...phoneProps} value={formData.phone} readOnly autoComplete="tel" required />
              </label>

              <label className="field">
                <span>Home address <span className="required-mark" aria-hidden="true">*</span></span><input name="address" type="text" placeholder="House No., Street, Barangay, City, Province" value={formData.address} readOnly autoComplete="street-address" required />
              </label>

              <p className="muted small">Emergency caretaker: {profile?.emergency_name} ({profile?.emergency_phone}). <Link to="/profile">Manage saved details</Link></p>
              <PrivacyNotice form={formData} onChange={handleChange} onNotice={handlePrivacyNotice} />
              <ApplicationScreeningFields minor={minor} form={formData} onChange={handleChange} files={files} setFiles={setFiles} />
              <label className="field">
                <span>When can you start? <span className="required-mark" aria-hidden="true">*</span></span><input
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
            </ValidatedForm>
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
