import { LoadError } from "../components/PageStates";
import CorgiLoader from "../components/CorgiLoader";
import useConfirmedAction from "../utils/useConfirmedAction";
import FileInput from "../components/FileInput";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import UserAvatar from '../components/UserAvatar';
import { useFeedback } from '../context/feedback';
import { useAuth } from '../context/auth';
import { HOUSING, YARD, KIDS, HOURS_ALONE, EXPERIENCE } from '../constants';
export default function Profile() {
  const { user, updateUser } = useAuth();
  const { notify } = useFeedback();
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const {run, busy:photoBusy} = useConfirmedAction();
  async function savePhoto(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      notify('Choose a JPG, PNG or WebP image up to 4 MB.', 'error'); return;
    }
    await run({ title: "Save " + user.name + "'s profile picture?", message: "The selected photo will replace your current profile picture.", confirmLabel:"Save Picture" }, async () => {
      const data = new FormData(); data.append('photo', file);
      const response = await api.post('/profile/photo', data);
      updateUser(response.data.user); setPendingPhoto(null); setPhotoVersion((v) => v + 1); notify(response.data.message);
    });
  }
  function removePhoto() {
    return run({title:"Remove " + user.name + "'s profile picture?", message:"Your saved picture will be removed and your initials will be shown instead.",confirmLabel:"Remove Picture",danger:true}, async () => {
      const response = await api.delete('/profile/photo'); updateUser(response.data.user); notify(response.data.message);
    });
  }
  const [profile, setProfile] = useState(undefined);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/profile').then(({ data }) => setProfile(data)).catch((e) => setError(errorMessage(e))); }, []);
  const label = (options, value) => options.find((o) => String(o.value) === String(value))?.label || 'Not provided';
  if (error) return <LoadError message={error} onRetry={()=>window.location.reload()}/>;
  if (profile === undefined) return <CorgiLoader label="Loading your home profile..."/>;
  return <div className="stack"><h1>My profile</h1><section className="card stack-sm"><h2>{user.name}</h2><p>{user.email}</p>
    <section className="profile-photo-editor" aria-label="Profile picture">
      <UserAvatar user={user} large />
      <div className="stack-sm">
        <label className="field">{photoBusy ? 'Saving photo...' : user.photo_url ? 'Change profile picture' : 'Upload profile picture'}
          <FileInput key={photoVersion} accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={(e) => setPendingPhoto(e.target.files[0] || null)} />
        </label>
        {pendingPhoto && <button type="button" className="btn btn-primary btn-sm" disabled={photoBusy} onClick={() => savePhoto(pendingPhoto)}>Save profile picture</button>}
        <p className="muted small">JPG, PNG or WebP, up to 4 MB. Photos are cropped to a square. Photo changes do not change your home screening or edit cooldown.</p>
        {user.photo_url && <button type="button" className="btn btn-outline btn-sm" disabled={photoBusy} onClick={removePhoto}>Remove profile picture</button>}
      </div>
    </section>
    {!profile ? <p>Please complete your personal and home details.</p> : <>
      <p className="notice notice-info">Shelter screening: <strong>{profile.review_status}</strong>. {profile.review_notes || 'The shelter reviews your household and safety details before you can apply.'}</p>
      <dl className="profile-details">{[
        ['Mobile number', profile.phone], ['Address', profile.address], ['Date of birth', profile.birth_date],
        ['Emergency caretaker', profile.emergency_name], ['Caretaker phone', profile.emergency_phone],
        ['Housing', label(HOUSING, profile.housing_type)], ['Yard', label(YARD, profile.yard)],
        ['Existing pets', [profile.has_cats && 'Cats', profile.has_dogs && 'Dogs'].filter(Boolean).join(', ') || 'None'],
        ['Children', label(KIDS, profile.kids)], ['Future foster time alone', label(HOURS_ALONE, profile.hours_alone)],
        ['Experience', label(EXPERIENCE, profile.experience)],
      ].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
      {profile.next_edit_at && new Date(profile.next_edit_at) > new Date() && <p>Next edit: {new Date(profile.next_edit_at).toLocaleString()}. Contact the shelter for urgent corrections.</p>}
    </>}
    <Link to="/questionnaire" className="btn btn-outline">{profile ? 'View / edit profile' : 'Complete profile'}</Link>
    <p className="muted small">Edits are limited to once every seven days and require shelter re-screening.</p>
  </section></div>;
}
