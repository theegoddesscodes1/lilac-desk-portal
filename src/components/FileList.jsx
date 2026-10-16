import { useState } from 'react';
import { canPreview, formatDate, formatSize, isImage, openFile } from '../lib/orderApi';
import { useViewUrls } from './FilePreview';
import ProofViewer from './ProofViewer';
import Icon from './Icons';

// Images open in a viewer first; every file has its own Download button
export default function FileList({ files, empty = 'No files yet.' }) {
  const urls = useViewUrls(files);
  const [open, setOpen] = useState(null);
  if (!files.length) return <p className="muted">{empty}</p>;

  return (
    <>
      <ul className="file-list">
        {files.map((file) => {
          const url = isImage(file) ? urls[file.path] : null;
          return (
            <li key={file.id} className="file-row">
              {url ? (
                <button type="button" className="file-thumb" onClick={() => setOpen(file)} aria-label={`View ${file.name}`}>
                  <img src={url} alt="" loading="lazy" />
                </button>
              ) : null}
              <div className="file-info">
                {canPreview(file) ? (
                  <button type="button" className="file-name link-btn" onClick={() => setOpen(file)}>{file.name}</button>
                ) : (
                  <p className="file-name">{file.name}</p>
                )}
                <p className="muted small">
                  {formatDate(file.created_at, true)}
                  {file.size ? `, ${formatSize(file.size)}` : ''}
                </p>
              </div>
              <button type="button" className="ibtn" onClick={() => openFile(file)} aria-label={`Download ${file.name}`}>
                <Icon name="files" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {open && <ProofViewer files={[open]} onClose={() => setOpen(null)} />}
    </>
  );
}
