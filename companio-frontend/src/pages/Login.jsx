import LoginPlay from "../components/LoginPlay";
import PasswordInput from "../components/PasswordInput";
import Icon from "../components/Icon";
import ValidatedForm from "../components/ValidatedForm";
import useConfirmedAction from "../utils/useConfirmedAction";
import FileInput from "../components/FileInput";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/auth";
import { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";
import Logo from "../components/Logo";

const ROLES = [
  {
    value: "volunteer",
    label: "I want to foster",
    hint: "Find pets that fit my home",
    icon: (
      <>
        <path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M8.62 13.8A2.25 2.25 0 1 1 12 10.84a2.25 2.25 0 1 1 3.38 2.96l-2.63 2.86a1 1 0 0 1-1.5 0z" />
      </>
    ),
  },
  {
    value: "shelter",
    label: "I work at a shelter",
    hint: "Manage pets and placements",
    icon: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
];

const EMPTY_FORM = {
  account_type: "volunteer",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  shelter_id: null,
};

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const { notify } = useFeedback();

  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get("mode") === "register" ? "register" : "login"); // "login" or "register"
  const [form, setForm] = useState({...EMPTY_FORM, account_type: searchParams.get("role") === "shelter" ? "shelter" : "volunteer"});
  const [busy, setBusy] = useState(false);
  const {run,busy:confirmBusy} = useConfirmedAction();
  const [notice, setNotice] = useState("");

  // already logged in? go straight to the right place
  if (user) {
    return <Navigate to={["admin", "super_admin"].includes(user.role) ? "/admin" : "/matches"} replace />;
  }

  const isRegister = mode === "register";
  const isShelter = isRegister && form.account_type === "shelter";

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setNotice("");
  };

  // INPUT
  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.type === "file" ? e.target.files[0] : e.target.value,
    });
  };

  // LOGIN OR REGISTER
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || confirmBusy) return;
    setBusy(true);

    try {
      if (!isRegister) {
        await login(form.email, form.password);
        return;
      }

      const payload = {
        name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        email: form.email,
        password: form.password,
        account_type: form.account_type,
      };
      let submission = payload;
      if (isShelter) {
        if (!form.shelter_id || form.shelter_id.size > 4 * 1024 * 1024) {
          notify("Choose an ID file up to 4 MB.", "error");
          return;
        }
        submission = new FormData();
        Object.entries({ ...payload, shelter_id: form.shelter_id }).forEach(([key, value]) => submission.append(key, value));
      }
      await run({title:isShelter ? "Submit a shelter account request for " + form.email + "?" : "Create a foster account for " + form.email + "?",message:isShelter ? "Your name and private ID will be sent to the Super Admin. Shelter access stays blocked until approval." : "This creates your Companio account. You will complete your home profile next.",confirmLabel:isShelter ? "Submit Account Request" : "Create Account"},async () => {
      const result = await register(submission);

      if (result.pending) {
        // shelter staff: wait for an administrator, then sign in
        setForm({ ...EMPTY_FORM, email: form.email });
        setMode("login");
        setNotice(result.message);
      } else {
        // show the welcome tour once they reach their matches
        try {
          localStorage.setItem(`companio_tour_${result.id}`, "pending");
        } catch {
          // storage blocked - they can still start the tour from the account menu
        }
        navigate("/questionnaire"); // new volunteers answer the questionnaire first
      }
      });
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  let submitLabel = "Sign in";
  if (isShelter) {
    submitLabel = "Request shelter account";
  } else if (isRegister) {
    submitLabel = "Create account & start questionnaire";
  }

  return (
    <div className="auth-page auth-page-login">
      <Logo />

      <div className="auth-layout"><aside className="auth-welcome"><span className="welcome-badge"><Icon name="heart" size={16}/> A little care. A lasting difference.</span><h2>A home between <br/>rescue and forever.</h2><p>Meet a companion who fits your home. Give them a safe place to rest, grow, and begin again.</p><div className="welcome-values"><span><Icon name="shield"/> Thoughtful screening</span><span><Icon name="paw"/> Matches that make sense</span><span><Icon name="home"/> Support along the way</span></div><LoginPlay/></aside>
      <ValidatedForm className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-head">
          <h1>{isRegister ? "Join Companio" : "Welcome back"}</h1>
          <p className="muted">
            {isRegister ? "Already have an account? " : "New to Companio? "}
            <button type="button" className="link-btn" onClick={() => switchMode(isRegister ? "login" : "register")}>
              {isRegister ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>

        {notice && <p className="notice" role="status">{notice}</p>}

        {isRegister && (
          <fieldset className="plain">
            <legend>How will you use Companio?</legend>
            <div className="role-cards">
              {ROLES.map((role) => (
                <label
                  key={role.value}
                  className={form.account_type === role.value ? "role-card role-card-selected" : "role-card"}
                >
                  <input
                    type="radio"
                    name="account_type"
                    value={role.value}
                    checked={form.account_type === role.value}
                    onChange={handleChange}
                  />
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {role.icon}
                  </svg>
                  <strong>{role.label}</strong>
                  <span>{role.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {isRegister && (
          <div className="field-row">
            <label className="field">
              <span>First name <span className="required-mark" aria-hidden="true">*</span></span>
              <input type="text" name="first_name" value={form.first_name} onChange={handleChange} autoComplete="given-name" placeholder="First name" required />
            </label>
            <label className="field">
              <span>Last name <span className="required-mark" aria-hidden="true">*</span></span>
              <input type="text" name="last_name" value={form.last_name} onChange={handleChange} autoComplete="family-name" placeholder="Last name" required />
            </label>
          </div>
        )}

        {isShelter && (
          <>
            <label className="field"><span>Valid ID <span className="required-mark" aria-hidden="true">*</span></span><FileInput name="shelter_id" accept=".jpg,.jpeg,.png,.pdf" onChange={handleChange} required /><span className="field-hint">JPG, PNG or PDF, up to 4 MB. Only the Super Admin can view your ID.</span></label>
          </>
        )}
        <label className="field">
          <span>Email <span className="required-mark" aria-hidden="true">*</span></span>
          <input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" placeholder="you@example.com" required />
        </label>

        <label className="field">
          <span>Password <span className="required-mark" aria-hidden="true">*</span></span>
          <PasswordInput

            placeholder={isRegister ? "At least 8 characters" : "Enter your password"}
            name="password"
            value={form.password}
            onChange={handleChange}
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
          />
          {isRegister && <span className="field-hint">At least 8 characters</span>}
        </label>

        <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>
          {busy ? "Please wait..." : submitLabel}
        </button>

      </ValidatedForm></div>

      <p className="auth-foot">Shelter staff accounts are reviewed by the Super Admin before first use.</p>
    </div>
  );
}
