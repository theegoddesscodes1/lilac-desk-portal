import { useState } from 'react';
import { formatDate, formatSize, openFile } from '../lib/orderApi';
import ProofViewer from './ProofViewer';
import Icon from './Icons';

export function verdictText(round) {
  if (!round?.verdict) return '';
  return round.verdict.kind === 'approval' ? 'Approved' : 'Changes requested';
}

// The files inside one round: tap a name to view, or download it
export function RoundFiles({ round, title }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <ul className="rfiles">
        {round.files.map((f, i) => (
          <li key={f.id}>
            <button type="button" className="rfile-name" onClick={() => setOpen(i)}>
              <Icon name="proof" size={16} />
              <span>{f.name}</span>
            </button>
            <span className="rfile-size">{formatSize(f.size)}</span>
            <button type="button" className="rfile-dl" onClick={() => openFile(f)} aria-label={`Download ${f.name}`}>
              <Icon name="files" size={16} />
            </button>
          </li>
        ))}
      </ul>
      {open != null && <ProofViewer files={round.files} startIndex={open} title={title || `Proof ${round.number}`} onClose={() => setOpen(null)} />}
    </>
  );
}

// Compact list of rounds (earlier proofs, admin files tab)
export function RoundList({ rounds, newest = null }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="rlist">
        {rounds.map((r) => (
          <div key={r.number} className="rrow">
            <button type="button" className="rrow-main" onClick={() => setOpen(r)}>
              <span className="rrow-title">Proof {r.number}{newest === r.number && <span className="ntag ntag--ox rrow-new">New</span>}</span>
              <span className="rrow-meta">
                {r.files.length} {r.files.length === 1 ? 'file' : 'files'} · {formatDate(r.at)}
                {r.verdict && <span className={r.verdict.kind === 'approval' ? 'ok' : ''}> · {verdictText(r)}</span>}
              </span>
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(r)}>View</button>
          </div>
        ))}
      </div>
      {open && <ProofViewer files={open.files} title={`Proof ${open.number}`} onClose={() => setOpen(null)} />}
    </>
  );
}
