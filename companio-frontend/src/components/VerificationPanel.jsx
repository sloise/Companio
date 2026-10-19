import useConfirmedAction from "../utils/useConfirmedAction";
import { useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useFeedback } from '../context/feedback';
export default function VerificationPanel({ application, onChanged }) {
  const [checks, setChecks] = useState({});
  const initialDate = application.screening?.interview_at ? new Date(application.screening.interview_at) : null;
  const [appointmentAt, setAppointmentAt] = useState(initialDate ? new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0,16) : '');
  const [appointmentType, setAppointmentType] = useState(application.screening?.interview_type || 'interview');
  const {run,busy} = useConfirmedAction();
  const { notify } = useFeedback();
  async function download(key) {
    try {
      const response = await api.get('/admin/applications/'+application.id+'/documents/'+key, {responseType:'blob'});
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a'); a.href=url; a.download=key+'.'+({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[response.data.type] || 'bin'); a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch(e) {notify(errorMessage(e),'error');}
  }
  async function schedule() {
    if (!appointmentAt) {notify('Choose the appointment date and time.', 'error');return;}
    await run({title:"Confirm " + application.full_name + "'s appointment for " + application.animal?.name + "?",message:"The " + (appointmentType === "shelter_visit" ? "shelter visit" : "interview") + " will be scheduled for " + new Date(appointmentAt).toLocaleString() + ". The applicant will be notified.",confirmLabel:"Confirm Appointment"},async () => {
      await api.patch('/admin/applications/'+application.id+'/schedule', {interview_type:appointmentType, interview_at:new Date(appointmentAt).toISOString()}); notify('Appointment confirmed; applicant notified.'); onChanged();
    });
  }
  function verify() {
    return run({title:"Record completed verification for " + application.full_name + "?",message:"This records your identity, home, caretaker, appointment and applicable co-signer checks for fostering " + application.animal?.name + ". Confirm only after completing the checks.",confirmLabel:"Record Verification"}, async () => {
      await api.patch('/admin/applications/'+application.id+'/verify', checks); notify('Verification recorded.'); onChanged();
    });
  }
  const screening = application.screening;
  const snapshot = application.profile_snapshot;
  return <section className="card stack-sm"><h3>Identity and home verification</h3>
    {!screening || !snapshot ? <p>This older application has no verification package. Ask the volunteer to withdraw and submit a new application with the required documents.</p> : <>
      <p>Emergency caretaker: {snapshot.emergency_name} - {snapshot.emergency_phone}</p>
      <p>Date of birth: {snapshot.birth_date}</p>
      <p>{screening.appointment_status || 'Requested'} {screening.interview_type === 'shelter_visit' ? 'shelter visit' : 'interview'}: {new Date(screening.interview_at).toLocaleString()}.</p>
      {application.status === 'Pending' && <div className="stack-sm">
        <label className="field">Appointment type<select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)}><option value="interview">Interview</option><option value="shelter_visit">Shelter visit</option></select></label>
        <label className="field">Confirm or reschedule date and time<input type="datetime-local" value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} /></label>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={schedule}>Confirm appointment and notify</button>
      </div>}
      {screening.requires_cosigner && <p>Co-signer: {screening.cosigner_name}, {screening.cosigner_phone}; born {screening.cosigner_birth_date}; {screening.cosigner_relationship}. Consent declared: {screening.cosigner_consent ? 'Yes' : 'No'}.</p>}
      <div className="verification-files">{application.document_keys?.map((key) => <button type="button" className="btn btn-outline btn-sm" key={key} onClick={() => download(key)}>Download {key.replaceAll('_',' ')}</button>)}</div>
      {application.verification_completed_at ? <p className="fit-ok">Verification completed {new Date(application.verification_completed_at).toLocaleString()}.</p> : application.status === 'Pending' && <>
        {[['identity_checked','I validated the government ID and applicant identity.'],['home_checked','I inspected all home photos and confirmed a safe living space.'],['caretaker_checked','I contacted and validated the emergency caretaker.'],['interview_completed','The interview or shelter visit has taken place.'],...(screening.requires_cosigner ? [['cosigner_checked','I validated the adult co-signer ID, age, contact and consent.']] : [])].map(([key,label]) => <label className="check" key={key}><input type="checkbox" checked={Boolean(checks[key])} onChange={(e) => setChecks({...checks,[key]:e.target.checked})} />{label}</label>)}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={verify}>Record completed verification</button>
      </>}
    </>}
  </section>;
}
