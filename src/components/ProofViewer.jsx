import { useEffect, useRef, useState } from 'react';
import { isImage, isPdf, openFile, viewUrl } from '../lib/orderApi';
import Icon from './Icons';


// Renders every page of a PDF as an image, so it shows in the app on any phone or computer
function PdfPages({ url }) {
  const ref = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        const box = ref.current;
        box.innerHTML = '';
        const width = Math.min(box.clientWidth || 800, 1100);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i += 1) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.className = 'pv-page';
          box.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (i === 1) setState('ok');
        }
      } catch (err) {
        console.warn('Preview failed', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [url]);

  return (
    <>
      {state === 'loading' && <p className="pv-note">Loading proof…</p>}
      {state === 'error' && <p className="pv-note">This file can't be previewed here. Use Download to open it.</p>}
      <div ref={ref} className="pv-pages" />
    </>
  );
}

// Full-screen viewer for a set of files (one proof round). Download is always one tap away.
export default function ProofViewer({ files, title, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const file = files[index];

  useEffect(() => {
    let alive = true;
    setUrl('');
    setFailed(false);
    viewUrl(file)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);

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
    <div className="pv" role="dialog" aria-label={title || file.name}>
      <div className="pv-bar">
        <div className="pv-title">
          {title && <span className="pv-round">{title}</span>}
          <span className="pv-name">{file.name}</span>
        </div>
        <button type="button" className="btn btn--sm btn--light" onClick={() => openFile(file)}>
          <Icon name="files" size={14} /> Download
        </button>
        <button type="button" className="pv-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </div>

      {files.length > 1 && (
        <div className="pv-tabs" role="tablist">
          {files.map((f, i) => (
            <button key={f.id} type="button" role="tab" aria-selected={i === index} className={i === index ? 'on' : ''} onClick={() => setIndex(i)}>
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="pv-body">
        {failed && <p className="pv-note">This file couldn't be loaded. Try Download.</p>}
        {url && isPdf(file) && <PdfPages key={url} url={url} />}
        {url && isImage(file) && <img className="pv-img" src={url} alt={file.name} />}
        {url && !isPdf(file) && !isImage(file) && (
          <p className="pv-note">This type of file can't be shown here. Use Download to open it.</p>
        )}
      </div>
    </div>
  );
}
