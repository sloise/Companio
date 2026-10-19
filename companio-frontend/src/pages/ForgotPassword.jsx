import ValidatedForm from "../components/ValidatedForm";
import { useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";
import Logo from "../components/Logo";

export default function ForgotPassword() {
  const { notify } = useFeedback();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentMessage, setSentMessage] = useState("");

  // ask Laravel to email a reset link
  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);

    try {
      const response = await api.post("/forgot-password", { email });
      setSentMessage(response.data.message);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <Logo />

      <ValidatedForm className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-head">
          <h1>Forgot your password?</h1>
          <p className="muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        </div>

        {sentMessage ? (
          <p className="notice" role="status">{sentMessage}</p>
        ) : (
          <>
            <label className="field">
              <span>Email <span className="required-mark" aria-hidden="true">*</span></span><input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </>
        )}

        <p className="muted" style={{ textAlign: "center" }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </ValidatedForm>
    </div>
  );
}
