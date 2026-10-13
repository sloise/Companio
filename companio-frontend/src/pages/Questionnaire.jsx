import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";
import OptionGroup from "../components/OptionGroup";
import { EXPERIENCE, HOURS_ALONE, HOUSING, KIDS, YARD } from "../constants";

const EMPTY = {
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
  const { notify } = useFeedback();

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // READ - fill the form with the saved answers (if any)
  useEffect(() => {
    const getProfile = async () => {
      try {
        const response = await api.get("/profile");
        const p = response.data;

        // only a saved profile has an id - anything else means "not answered yet"
        if (p?.id) {
          setForm({
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
        console.error("Error loading profile:", error);
      }
    };

    getProfile();
  }, []);

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const answered = REQUIRED.filter((name) => form[name] !== "" && form[name] != null).length;

  // CREATE / UPDATE
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await api.put("/profile", {
        ...form,
        has_cats: Boolean(form.has_cats), // unticked = false ("no cats"), never missing
        has_dogs: Boolean(form.has_dogs),
        hours_alone: Number(form.hours_alone),
      });
      notify("Home profile saved! Your match scores are up to date.");
      navigate("/matches");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="two-col">
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Your home profile</p>
          <h1>Tell us about your home</h1>
          <p className="muted">
            A few quick questions. Your answers are compared with every pet&apos;s care
            needs to calculate your match score.
          </p>
        </div>

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
          <legend>5. How long is the pet usually alone each day?</legend>
          <p className="muted">On a typical weekday.</p>
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
            {saving ? "Saving..." : "See my matches"}
          </button>
        </div>
      </form>

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
