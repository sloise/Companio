export default function UserAvatar({ user, large = false }) {
  const initials = user.name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return <span className={large ? 'user-avatar-image user-avatar-large' : 'user-avatar-image'}>
    {user.photo_url ? <img src={user.photo_url} alt={large ? user.name + "'s profile photo" : ''} /> : initials}
  </span>;
}
