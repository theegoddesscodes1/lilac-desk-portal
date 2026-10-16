import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../lib/portalData';
import Icon from './Icons';

// Archive or bring back a conversation in Messages (admin only)
export default function ArchiveButton({ threadKey, archived, className = '' }) {
  const admin = useAdmin();
  const navigate = useNavigate();
  if (!admin?.setArchived) return null;
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm archive-btn ${className}`}
      onClick={async () => {
        await admin.setArchived(threadKey, !archived);
        if (!archived) navigate('/messages');
      }}
      title={archived ? 'Move back to your inbox' : 'Archive this conversation'}
    >
      <Icon name="archive" size={15} /> <span>{archived ? 'Unarchive' : 'Archive'}</span>
    </button>
  );
}
