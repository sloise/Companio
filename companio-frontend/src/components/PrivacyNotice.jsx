import { useEffect, useState } from "react";
import api from "../api/client";

export default function PrivacyNotice({ form, onChange, onNotice }) {
  const [notice, setNotice] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/privacy-notice').then(({data}) => {
      if (active) {setNotice(data);setFailed(false);onNotice(data.ready ? data.version : '');}
    }).catch(() => {if (active) {setFailed(true);onNotice('');}});
    return () => {active = false;};
  }, [retry, onNotice]);
  return <section className="notice notice-info stack-sm" aria-labelledby="privacy-notice-title">
    <h3 id="privacy-notice-title">Privacy notice and consent</h3>
    {!notice?.ready ? <p role="status">{failed ? 'The privacy notice could not be loaded.' : notice ? 'The shelter is completing its privacy contact and retention policy. Applications are unavailable until these are published.' : 'Loading the privacy notice...'}</p> : <>
      <p>{notice.controller} collects your name, email, contact and home profile, date of birth, emergency contact, government ID, home photos, application message and appointment details. For applicants under 18, we also collect the adult co-signer&apos;s name, phone, date of birth, relationship, ID and consent confirmation.</p>
      <p>Authorized shelter staff use these records to verify identity and age, screen the home, contact you and your co-signer, assess foster suitability, and manage the application and placement. Records are stored privately in Companio and are not shown to other volunteers.</p>
      <p><strong>Retention:</strong> {notice.retention}</p>
      <p>Contact {notice.contact} to request access, correction or deletion, object to processing, or withdraw consent. Withdrawal may prevent screening or continuation of an application; legal retention duties may still apply. You may lodge a complaint with the <a href="https://privacy.gov.ph/" target="_blank" rel="noreferrer">National Privacy Commission</a>.</p>
      <p>Please share this notice with your co-signer and emergency contact before providing their details. Avoid including unrelated people or documents in home photos.</p>
    </>}
    {failed && <button type="button" className="btn btn-outline btn-sm" onClick={() => setRetry(value => value + 1)}>Retry privacy notice</button>}
    <label className="check"><input type="checkbox" name="privacy_consent" checked={form.privacy_consent} onChange={onChange} required disabled={!notice?.ready || failed} />I have read this notice and consent to the collection, private storage and use of my personal data, ID and home photos for the screening and placement purposes and retention period stated above.</label>
  </section>;
}
