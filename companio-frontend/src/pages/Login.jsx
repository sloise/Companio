import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
};

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const { notify } = useFeedback();

  const [mode, setMode] = useState("login"); // "login" or "register"
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // already logged in? go straight to the right place
  if (user) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/matches"} replace />;
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
      [e.target.name]: e.target.value,
    });
  };

  // LOGIN OR REGISTER
  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);

    try {
      if (!isRegister) {
        await login(form.email, form.password);
        return;
      }

      const result = await register({
        name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        email: form.email,
        password: form.password,
        account_type: form.account_type,
      });

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
    <div className="auth-page">
      <Logo />

      <form className="auth-card" onSubmit={handleSubmit}>
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
              First name
              <input type="text" name="first_name" value={form.first_name} onChange={handleChange} autoComplete="given-name" required />
            </label>
            <label className="field">
              Last name
              <input type="text" name="last_name" value={form.last_name} onChange={handleChange} autoComplete="family-name" required />
            </label>
          </div>
        )}

        <label className="field">
          Email
          <input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" required />
        </label>

        <label className="field">
          Password
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
          />
          {isRegister && <span className="field-hint">At least 8 characters</span>}
          {!isRegister && (
            <Link className="field-hint forgot-link" to="/forgot-password">Forgot password?</Link>
          )}
        </label>

        <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>
          {busy ? "Please wait..." : submitLabel}
        </button>

        {/* Demo logins from the seeder - only shown while developing (npm run dev), never on the live site */}
        {import.meta.env.DEV && !isRegister && (
          <p className="hint">
            Demo: <code>andrea@companio.test</code> (volunteer) or{" "}
            <code>admin@companio.test</code> (shelter admin). Password: <code>password</code>
          </p>
        )}
      </form>

      <p className="auth-foot">Shelter staff accounts are confirmed by an administrator before first use.</p>
    </div>
  );
}
