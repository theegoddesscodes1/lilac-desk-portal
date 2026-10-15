import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { openFile } from '../lib/orderApi';
import Icon from './Icons';

const BUCKET = 'order-files';
const IMAGE = /\.(png|jpe?g|gif|webp|heic|avif|svg)$/i;

export const isImage = (file) => IMAGE.test(file?.name || file?.path || '');

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

export function Lightbox({ file, url, onClose }) {
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
        <button type="button" className="btn btn--sm btn--light" onClick={() => openFile(file)}>
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

// One file: images open in the viewer, everything else downloads
export function FileChip({ file }) {
  const urls = useViewUrls([file]);
  const [open, setOpen] = useState(false);
  const image = isImage(file) && urls[file.path];
  return (
    <>
      <button type="button" className="file-chip" onClick={() => (image ? setOpen(true) : openFile(file))}>
        {image ? <img src={urls[file.path]} alt="" /> : <Icon name="files" size={14} />}
        <span>{file.name}</span>
      </button>
      {open && <Lightbox file={file} url={urls[file.path]} onClose={() => setOpen(false)} />}
    </>
  );
}
