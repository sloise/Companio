import { LoadError } from "../components/PageStates";
import CorgiLoader from "../components/CorgiLoader";
import ValidatedForm from "../components/ValidatedForm";
import useConfirmedAction from "../utils/useConfirmedAction";
import { phoneProps } from "../utils/phone";
import { useEffect, useState } from "react";
import { useAuth } from "../context/auth";
import { useNavigate } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";
import OptionGroup from "../components/OptionGroup";
import { EXPERIENCE, HOURS_ALONE, HOUSING, KIDS, YARD } from "../constants";

const EMPTY = {
  name: "", phone: "", address: "", birth_date: "", emergency_name: "", emergency_phone: "",
  housing_type: "",
  yard: "",
  has_cats: false,
  has_dogs: false,
  kids: "",
  hours_alone: "",
  experience: "",
};

const REQUIRED = ["housing_type", "yard", "kids", "hours_alone", "experience"];

export default function Questionnaire() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { notify } = useFeedback();

  const [form, setForm] = useState({ ...EMPTY, name: user.name });
  const { run, busy: saving } = useConfirmedAction();

  // READ - fill the form with the saved answers (if any)
  useEffect(() => {
    const getProfile = async () => {
      try {
        const response = await api.get("/profile");
        const p = response.data;

        // only a saved profile has an id - anything else means "not answered yet"
        if (p?.id) {
          setProfile(p);
          setForm({
            name: user.name, phone: p.phone || "", address: p.address || "", birth_date: p.birth_date || "",
            emergency_name: p.emergency_name || "", emergency_phone: p.emergency_phone || "",
            housing_type: p.housing_type ?? "",
            yard: p.yard ?? "",
            has_cats: Boolean(p.has_cats),
            has_dogs: Boolean(p.has_dogs),
            kids: p.kids ?? "",
            hours_alone: p.hours_alone ?? "",
            experience: p.experience ?? "",
          });
        }
      } catch (error) {
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    getProfile();
  }, [user.name]);

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const answered = REQUIRED.filter((name) => form[name] !== "" && form[name] != null).length;

  // CREATE / UPDATE
  const handleSubmit = async (e) => {
    e.preventDefault();
    await run({
      title: profile?.id ? "Save changes to " + user.name + "'s profile?" : "Complete " + user.name + "'s home profile?",
      message: "Your personal and household details will be submitted for shelter screening. Further edits have a seven-day cooldown, and pending application verification will need to be reviewed again.",
      confirmLabel: profile?.id ? "Save Changes" : "Submit Profile",
    }, async () => {
      const response = await api.put("/profile", { ...form, has_cats:Boolean(form.has_cats), has_dogs:Boolean(form.has_dogs), hours_alone:Number(form.hours_alone) });
      updateUser(response.data.user);
      notify(response.data.message);
      navigate("/profile");
    });
  };

  const locked = profile?.next_edit_at && new Date(profile.next_edit_at) > new Date();
  if (loading) return <CorgiLoader label="Loading your home profile..."/>;
  if (loadError) return <LoadError message={loadError} onRetry={()=>window.location.reload()}/>;

  return (
    <div className="two-col">
      <ValidatedForm className="stack" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Your home profile</p>
          <h1>Tell us about your home</h1>
          <p className="muted">
            A few quick questions. Your answers are compared with every pet&apos;s care
            needs to calculate your match score.
          </p>
        </div>

        <p className="notice notice-info">Profile edits are limited to once every seven days. Every saved change requires shelter re-screening before you can apply. Contact the shelter for urgent corrections.</p>
        {locked && <p role="status">You can edit again on {new Date(profile.next_edit_at).toLocaleString()}. Your saved information is shown below.</p>}
        <fieldset className="plain stack" disabled={Boolean(locked) || saving}>
        <section className="card stack-sm">
          <h2>Personal details and emergency caretaker</h2>
          <p className="muted">These details are saved and attached to future applications. Your account email is {user.email}.</p>
          {[
            ['name', 'Full name', 'text'], ['phone', 'Mobile number', 'tel'], ['address', 'Home address', 'text'],
            ['birth_date', 'Date of birth', 'date'], ['emergency_name', 'Emergency caretaker full name', 'text'],
            ['emergency_phone', 'Emergency caretaker phone', 'tel'],
          ].map(([name, label, type]) => <label className="field" key={name}><span>{label} <span className="required-mark" aria-hidden="true">*</span></span><input name={name} type={type} placeholder={name === "address" ? "House No., Street, Barangay, City, Province" : name === "emergency_name" ? "Enter the full name of the person responsible for the animal." : undefined} readOnly={name === "name" && !profile?.id} {...(type === "tel" ? phoneProps : {})} value={form[name]} maxLength={name === 'address' ? 255 : name.includes('phone') ? 13 : 100} onChange={(e) => setField(name, e.target.value)} required /></label>)}
          <p className="muted small">Choose another person who has agreed to care for the pet in an emergency. Shelter staff will validate this contact.</p>
        </section>
        <div className="progress">
          <div className="progress-bar">
            <div style={{ width: `${(answered / REQUIRED.length) * 100}%` }} />
          </div>
          <span>{answered} of {REQUIRED.length} answered</span>
        </div>

        <fieldset className="card question">
          <legend>1. What type of home do you live in?</legend>
          <OptionGroup
            name="housing_type"
            value={form.housing_type}
            options={HOUSING}
            onChange={(v) => setField("housing_type", v)}
          />
        </fieldset>

        <fieldset className="card question">
          <legend>2. Do you have a yard?</legend>
          <p className="muted">Some dogs need a secure space to run.</p>
          <OptionGroup
            name="yard"
            value={form.yard}
            options={YARD}
            onChange={(v) => setField("yard", v)}
          />
        </fieldset>

        <fieldset className="card question">
          <legend>3. Which pets already live with you?</legend>
          <p className="muted">Select all that apply. Leave both empty if you have none.</p>
          <div className="option-grid">
            <label className={form.has_cats ? "option option-selected" : "option"}>
              <input
                type="checkbox"
                checked={form.has_cats}
                onChange={(e) => setField("has_cats", e.target.checked)}
              />
              <span><strong>Cat(s)</strong></span>
            </label>
            <label className={form.has_dogs ? "option option-selected" : "option"}>
              <input
                type="checkbox"
                checked={form.has_dogs}
                onChange={(e) => setField("has_dogs", e.target.checked)}
              />
              <span><strong>Dog(s)</strong></span>
            </label>
          </div>
        </fieldset>

        <fieldset className="card question">
          <legend>4. Are there children in the household?</legend>
          <p className="muted">Some rescues are shy around young kids.</p>
          <OptionGroup
            name="kids"
            value={form.kids}
            options={KIDS}
            onChange={(v) => setField("kids", v)}
          />
        </fieldset>

        <fieldset className="card question">
          <legend>{form.has_cats || form.has_dogs ? '5. How long are your pets usually alone each day?' : '5. How long would a foster pet be alone each day?'}</legend>
          <p className="muted">{form.has_cats || form.has_dogs ? 'On a typical weekday.' : 'You do not need an existing pet. Estimate how long your future foster would be alone using your usual work or school schedule.'}</p>
          <OptionGroup
            name="hours_alone"
            value={form.hours_alone}
            options={HOURS_ALONE}
            onChange={(v) => setField("hours_alone", v)}
          />
        </fieldset>

        <fieldset className="card question">
          <legend>6. How much pet care experience do you have?</legend>
          <p className="muted">All levels are welcome to foster.</p>
          <OptionGroup
            name="experience"
            value={form.experience}
            options={EXPERIENCE}
            onChange={(v) => setField("experience", v)}
          />
        </fieldset>

        <div className="actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
            Back
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? "Saving..." : "Save for shelter screening"}
          </button>
        </div>
        </fieldset>
      </ValidatedForm>

      <aside className="card side-card">
        <h2>How matching works</h2>
        <p className="muted">
          Each pet has care rules set by shelter staff. Every rule your home meets
          adds 20% to the score.
        </p>
        <div className="legend-row"><span className="badge match-strong">100%</span> Meets every rule</div>
        <div className="legend-row"><span className="badge match-good">80%</span> One rule not met</div>
        <div className="legend-row"><span className="badge match-fair">60%</span> Two rules not met</div>
        <p className="muted small">
          Rules checked: housing, yard, other pets, children and time alone.
        </p>
      </aside>
    </div>
  );
}
