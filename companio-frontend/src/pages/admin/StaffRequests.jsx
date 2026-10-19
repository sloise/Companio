import CorgiLoader from "../../components/CorgiLoader";
import useConfirmedAction from "../../utils/useConfirmedAction";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api, { errorMessage } from "../../api/client";
import { useAuth } from "../../context/auth";
import { useFeedback } from "../../context/feedback";
import ApplicantIdModal from "../../components/ApplicantIdModal";
import { timeAgo } from "../../utils/format";

export default function StaffRequests({ summary = false }) {
 const {user} = useAuth();
 const {notify} = useFeedback();
 const [requests,setRequests] = useState([]);
 const [error,setError] = useState("");
 const [loading,setLoading] = useState(true);
 const {run,busy} = useConfirmedAction();
 const [reload,setReload] = useState(0);
 const [preview,setPreview] = useState(null);
 useEffect(() => {
   if (user.role !== 'super_admin') return;
   let current = true;
   api.get('/admin/staff-requests', {params:summary ? {recent:1} : {}}).then(({data}) => {if(current){setRequests(data);setError("");}}).catch((e) => {if(current)setError(errorMessage(e));}).finally(() => {if(current)setLoading(false);});
   return () => {current=false;};
 },[user.role,summary,reload]);
 if (user.role !== 'super_admin') return summary ? null : <Navigate to="/admin" replace />;
 const decide = (person,approve) => run({
   title:(approve?'Approve ':'Reject ')+person.name+"'s request?",
   message:approve?'Confirm identity before granting Shelter Admin access.':'The application and reason are retained for auditing. The applicant may register again.',
   confirmLabel:approve?'Confirm Approval':'Confirm Rejection',danger:!approve,reasonRequired:!approve,
 }, async (answer) => {
   const response = approve ? await api.patch('/admin/staff-requests/'+person.id) : await api.delete('/admin/staff-requests/'+person.id,{data:{rejection_reason:answer}});
   notify(response.data.message);setReload((v)=>v+1);window.dispatchEvent(new Event('staff-requests-changed'));
 });
 return <section className="card table-card" aria-labelledby={summary?'recent-staff-title':'staff-title'}>
   <div className="page-head pad"><div><h2 id={summary?'recent-staff-title':'staff-title'}>{summary?'New staff requests':'Staff Requests'}</h2><p className="muted small">{summary?'Latest pending shelter registrations.':'Review pending requests and previous decisions. Rejected applications remain available for auditing.'}</p></div>{summary && <Link to="/admin/staff-requests">View all requests</Link>}</div>
   {error && <p role="alert" className="pad">{error} <button type="button" className="link-btn" onClick={()=>setReload((v)=>v+1)}>Retry</button></p>}
   {loading ? <div className="pad"><CorgiLoader label="Loading staff requests..." compact/></div> : !requests.length ? <p className="pad muted">No {summary?'pending ':''}staff requests.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records"><table><thead><tr><th>Applicant</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>
     {requests.map((person)=><tr key={person.id}><td><strong>{person.name}</strong><p>{person.email}</p>{person.archived_at && <p className="muted small">Previous application (archived)</p>}{person.rejection_reason && <p>{person.rejection_reason}</p>}{person.duplicates?.length > 0 && <p className="notice">Matching shelter records: review shared membership manually.</p>}</td><td>{person.role==='staff_pending'?'Pending':person.role==='staff_rejected'?'Rejected':'Approved'}</td><td>{timeAgo(person.created_at)}</td><td><div className="row-actions">
       {person.has_id && <button type="button" className="btn btn-outline btn-sm" onClick={()=>setPreview(person)}>View ID</button>}
       {person.role==='staff_pending' && <><button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={()=>decide(person,false)}>Reject</button><button type="button" className="btn btn-primary btn-sm" disabled={busy || !person.has_id} onClick={()=>decide(person,true)}>Approve</button></>}
     </div></td></tr>)}
   </tbody></table></div>}
   {preview && <ApplicantIdModal key={preview.id} person={preview} onClose={()=>setPreview(null)} />}
 </section>;
}
