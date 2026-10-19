import { phoneProps } from "../utils/phone";
import FileInput from "./FileInput";
export default function ApplicationScreeningFields({ minor, form, onChange, files, setFiles }) {
  return <section className="stack-sm">
    <h3>Safety and verification</h3>
    <p className="muted small">Documents are private and reviewed by shelter staff. Use JPG, PNG, WebP or PDF for IDs; photos must be images. Maximum 4 MB per file.</p>
    <label className="field"><span>Government-issued ID <span className="required-mark" aria-hidden="true">*</span></span><FileInput accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(e) => setFiles((old) => ({...old, government_id:e.target.files[0]}))} /></label>
    <label className="field"><span>Home photos (2-5: sleeping area and secure living space) <span className="required-mark" aria-hidden="true">*</span></span><FileInput accept="image/jpeg,image/png,image/webp" multiple required onChange={(e) => setFiles((old) => ({...old, home_photos:Array.from(e.target.files)}))} /><span>{files.home_photos?.length || 0} selected</span></label>
    <label className="field"><span>Screening appointment <span className="required-mark" aria-hidden="true">*</span></span><select name="interview_type" value={form.interview_type} onChange={onChange} required><option value="interview">Interview</option><option value="shelter_visit">Shelter visit</option></select></label>
    <label className="field"><span>Preferred date and time <span className="required-mark" aria-hidden="true">*</span></span><input type="datetime-local" name="interview_at" value={form.interview_at} onChange={onChange} required /></label>
    <p className="muted small">This is a requested appointment. The shelter confirms or adjusts the appointment in Applications and sends you a notification. It must take place before your foster start date and before approval.</p>
    {minor && <>
      <h3>Adult co-signer required</h3>
      <p className="muted small">Applicants under 18 need a consenting adult co-signer. Staff will validate their identity and contact them before approval.</p>
      {[['cosigner_name','Adult full name','text'],['cosigner_phone','Adult contact number','tel'],['cosigner_birth_date','Adult date of birth','date'],['cosigner_relationship','Relationship to applicant','text']].map(([name,label,type]) => <label className="field" key={name}><span>{label} <span className="required-mark" aria-hidden="true">*</span></span><input type={type} {...(type === "tel" ? phoneProps : {})} name={name} value={form[name]} onChange={onChange} required /></label>)}
      <label className="field"><span>Co-signer government-issued ID <span className="required-mark" aria-hidden="true">*</span></span><FileInput accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(e) => setFiles((old) => ({...old, cosigner_id:e.target.files[0]}))} /></label>
      <label className="check"><input type="checkbox" name="cosigner_consent" checked={form.cosigner_consent} onChange={onChange} required />My adult co-signer has read the privacy notice and agreed to the collection and use of their details and ID for screening, to be contacted, and to take responsibility for this placement.</label>
    </>}
  </section>;
}
