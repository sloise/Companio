import CorgiLoader from "./CorgiLoader";
import useConfirmedAction from "../utils/useConfirmedAction";
import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useFeedback } from '../context/feedback';
export default function ProfileReviews() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('oldest');
  const [loading,setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [findings, setFindings] = useState({});
  const [notes, setNotes] = useState({});
  const {run,busy} = useConfirmedAction();
  const { notify } = useFeedback();
  useEffect(() => { api.get('/admin/profiles/pending').then(({data}) => {setProfiles(data);setError('');}).catch((e) => setError(errorMessage(e))).finally(()=>setLoading(false)); }, [reload]);
  async function review(profile, review_status) {
    await run({title:(review_status === "Approved" ? "Approve " : "Reject ") + profile.user?.name + "'s home profile?",message:review_status === "Approved" ? "This confirms the home screening and lets the volunteer submit eligible foster applications." : "The volunteer will be notified and will need an approved profile before applying. Screening comments remain optional.",confirmLabel:review_status === "Approved" ? "Confirm Approval" : "Confirm Rejection",danger:review_status === "Rejected"}, async () => {
      await api.patch('/admin/profiles/'+profile.id+'/review', { review_status, findings_type:findings[profile.id] || "none", review_notes:findings[profile.id] === "comments" ? notes[profile.id]?.trim() || null : null, reviewed_version:profile.updated_at });
      notify('Profile screening saved.'); setReload((n) => n+1);
    });
  }
  const query = search.trim().toLocaleLowerCase();
  const shown = profiles.filter(profile => [profile.user?.name, profile.user?.email, profile.name].some(value => (value || '').toLocaleLowerCase().includes(query))).sort((a,b) => {
    const order = (new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime()) || a.id - b.id;
    return sort === 'oldest' ? order : -order;
  });
  return <section className="card stack-sm"><h2>Home profile screening ({profiles.length})</h2>
    {error && <p role="alert">{error}</p>}
    <p className="muted small">New and edited profiles need screening before applications. Check contact and household details and record your findings.</p>
    <div className="filters">
      <label className="field filter-search">Search home profiles<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email" /></label>
      <label className="field">Sort home profiles<select value={sort} onChange={event => setSort(event.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      {(search || sort !== 'oldest') && <button type="button" className="btn btn-outline" onClick={() => {setSearch('');setSort('oldest');}}>Reset</button>}
    </div>
    {!loading && !error && <p className="muted small" role="status">Showing {shown.length} of {profiles.length} home profiles awaiting screening</p>}
    {!loading && !error && profiles.length > 0 && !shown.length && <p className="notice notice-info">No applicants match your search.</p>}
    {loading && <CorgiLoader label="Loading home screening..." compact/>}
    {!loading && !error && !profiles.length && <p className="muted small">All caught up. New or updated home profiles will appear here.</p>}
    {shown.map((p) => <details key={p.id}><summary>{p.user?.name} - {p.user?.email}</summary><div className="stack-sm">
      <dl className="profile-details">{[['Phone',p.phone],['Address',p.address],['Date of birth',p.birth_date],['Housing',p.housing_type],['Yard',p.yard],['Cats',p.has_cats?'Yes':'No'],['Dogs',p.has_dogs?'Yes':'No'],['Children',p.kids],['Hours alone',p.hours_alone],['Experience',p.experience],['Emergency caretaker',p.emergency_name],['Caretaker phone',p.emergency_phone]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not provided'}</dd></div>)}</dl>
      <label className="field">Screening findings (optional)<select aria-label={"Screening findings for " + p.user?.name} value={findings[p.id] || "none"} onChange={(e) => setFindings({...findings,[p.id]:e.target.value})}><option value="none">None</option><option value="comments">Comments</option></select></label>
      {findings[p.id] === "comments" && <label className="field">Additional findings<textarea maxLength={1000} placeholder="Enter any additional screening findings (optional)" value={notes[p.id] || ''} onChange={(e) => setNotes({...notes,[p.id]:e.target.value})} /></label>}
      <div className="actions"><button className="btn btn-outline" disabled={busy} onClick={() => review(p,'Rejected')}>Reject profile</button><button className="btn btn-primary" disabled={busy || !p.birth_date || !p.phone || !p.address || !p.emergency_name || !p.emergency_phone} onClick={() => review(p,'Approved')}>Approve screened profile</button></div>
    </div></details>)}
  </section>;
}
