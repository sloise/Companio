import PasswordInput from "../components/PasswordInput";
import ValidatedForm from "../components/ValidatedForm";
import useConfirmedAction from "../utils/useConfirmedAction";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { useFeedback } from "../context/feedback";
import Logo from "../components/Logo";

// Opened from the link in the "reset your password" email: /reset-password?token=...&email=...
export default function ResetPassword() {
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [form, setForm] = useState({ password: "", password_confirmation: "" });
  const {run,busy} = useConfirmedAction();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.password_confirmation) {
      notify("The two passwords don't match.", "error");
      return;
    }

    await run({title:"Reset the password for " + email + "?",message:"Your password will be replaced and existing sign-in tokens will be revoked. Use the new password to sign in again.",confirmLabel:"Reset Password"},async () => {
      const response = await api.post("/reset-password",{token,email,...form});notify(response.data.message);navigate("/login");
    });
  };

  const linkIsBroken = !token || !email;

  return (
    <div className="auth-page">
      <Logo />

      <ValidatedForm className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-head">
          <h1>Choose a new password</h1>
          {!linkIsBroken && <p className="muted">for {email}</p>}
        </div>

        {linkIsBroken ? (
          <p className="notice notice-error" role="alert">
            This link is incomplete. Please open the link from your email again, or request a new one.
          </p>
        ) : (
          <>
            <label className="field">
              <span>New password <span className="required-mark" aria-hidden="true">*</span></span><PasswordInput
                name="password"
                value={form.password}
                onChange={handleChange}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <span className="field-hint">At least 8 characters</span>
            </label>

            <label className="field">
              <span>Type it again <span className="required-mark" aria-hidden="true">*</span></span><PasswordInput
                name="password_confirmation"
                value={form.password_confirmation}
                onChange={handleChange}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>

            <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>
              {busy ? "Saving..." : "Save new password"}
            </button>
          </>
        )}

        <p className="muted" style={{ textAlign: "center" }}>
          <Link to={linkIsBroken ? "/forgot-password" : "/login"}>
            {linkIsBroken ? "Request a new link" : "Back to sign in"}
          </Link>
        </p>
      </ValidatedForm>
    </div>
  );
}
