import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { canPreview, isImage, openFile } from '../lib/orderApi';
import ProofViewer from './ProofViewer';
import Icon from './Icons';

const BUCKET = 'order-files';
export { isImage };

// Short-lived view links (no forced download) for a list of stored files
export function useViewUrls(files) {
  const [urls, setUrls] = useState({});
  const key = (files || []).map((f) => f.path).join('|');

  useEffect(() => {
    const paths = (files || []).filter(isImage).map((f) => f.path);
    if (!paths.length) return;
    let alive = true;
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        setUrls(Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

export function Lightbox({ file, url, onClose, onDownload }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-label={file.name} onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-name">{file.name}</span>
        <button type="button" className="btn btn--sm btn--light" onClick={() => (onDownload ? onDownload() : openFile(file))}>
          <Icon name="files" size={14} /> Download
        </button>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </div>
      <img src={url} alt={file.name} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// Grid of image thumbnails; tap to view large, download from there
export function ImageGrid({ files, onRemove }) {
  const urls = useViewUrls(files);
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="thumbs">
        {files.map((f) => (
          <div key={f.id} className="thumb">
            <button type="button" className="thumb-btn" onClick={() => urls[f.path] && setOpen(f)} aria-label={`View ${f.name}`}>
              {urls[f.path] ? <img src={urls[f.path]} alt="" loading="lazy" /> : <span className="thumb-ph" />}
            </button>
            {onRemove && (
              <button type="button" className="thumb-x" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.name}`}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {open && <Lightbox file={open} url={urls[open.path]} onClose={() => setOpen(null)} />}
    </>
  );
}

// One file: images and PDFs open in the viewer (with Download there), anything else downloads
export function FileChip({ file }) {
  const urls = useViewUrls([file]);
  const [open, setOpen] = useState(false);
  const thumb = isImage(file) ? urls[file.path] : null;
  return (
    <>
      <button type="button" className="file-chip" onClick={() => (canPreview(file) ? setOpen(true) : openFile(file))}>
        {thumb ? <img src={thumb} alt="" /> : <Icon name="files" size={14} />}
        <span>{file.name}</span>
      </button>
      {open && <ProofViewer files={[file]} onClose={() => setOpen(false)} />}
    </>
  );
}

// A photo sent in chat: shown big enough to see, like a text message. Tap to open full size.
export function ChatImage({ file }) {
  const urls = useViewUrls([file]);
  const [open, setOpen] = useState(false);
  const url = urls[file.path];
  return (
    <>
      <button type="button" className="msg-photo" onClick={() => url && setOpen(true)} aria-label={`View ${file.name}`}>
        {url ? <img src={url} alt={file.name} loading="lazy" /> : <span className="msg-photo-ph" />}
      </button>
      {open && <Lightbox file={file} url={url} onClose={() => setOpen(false)} />}
    </>
  );
}
