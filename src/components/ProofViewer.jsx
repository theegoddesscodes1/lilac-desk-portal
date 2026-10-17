import { useEffect, useRef, useState } from 'react';
import { isImage, isPdf, openFile, viewUrl } from '../lib/orderApi';
import AutoGrow from './AutoGrow';
import Icon from './Icons';

// One page with its pins on top. In pin mode, a tap anywhere on the page starts a new note there.
function PageFrame({ pageNo, children, pins, numberOf, pinning, onTap, onOpenPin, pending, showStatus, flash }) {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      className={`pv-frame${pinning ? ' pv-frame--pin' : ''}`}
      onClick={(e) => {
        if (!pinning || e.target.closest('.pin')) return;
        const box = ref.current.getBoundingClientRect();
        onTap(pageNo, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
      }}
    >
      {children}
      {pins.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pin${showStatus && p.done_at ? ' pin--done' : ''}${showStatus && p.skipped_at ? ' pin--skipped' : ''}${flash === p.id ? ' pin--flash' : ''}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPin(p);
          }}
          aria-label={`Note ${numberOf(p)}`}
        >
          {showStatus && p.done_at ? '✓' : numberOf(p)}
        </button>
      ))}
      {pending && pending.page === pageNo && <span className="pin pin--new" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}>+</span>}
    </div>
  );
}

function PdfPage({ doc, pageNo, width, frame }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let task = null;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNo);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [doc, pageNo, width]);
  return frame(pageNo, <canvas ref={canvasRef} className="pv-page" style={{ width: `${width}px` }} />);
}

// Renders every page of a PDF, so it shows in the app on any phone or computer
function PdfPages({ url, frame }) {
  const wrapRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [state, setState] = useState('loading');
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loaded = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        loaded = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        setWidth(Math.min(wrapRef.current?.clientWidth || 800, 1100));
        setDoc(loaded);
        setState('ok');
      } catch (err) {
        console.warn('Preview failed', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [url]);

  return (
    <div ref={wrapRef} className="pv-pages">
      {state === 'loading' && <p className="pv-note">Loading proof…</p>}
      {state === 'error' && <p className="pv-note">This file can't be previewed here. Use Download to open it.</p>}
      {doc && width > 0 && Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={i} doc={doc} pageNo={i + 1} width={width} frame={frame} />)}
    </div>
  );
}

// Full-screen viewer for a set of files (one proof round). Download is always one tap away.
// With pins: shows the notes pinned on this round; with pinning on, the customer can tap to add notes.
// checklist: Kerry's notes panel (iPad and desktop) with onStatus(pin, 'done'|'skipped'|'open') and onReason(pin, text).
// showStatus: show done / not-changed on the pins (always for Kerry; for customers once the next proof is out).
export default function ProofViewer({ files, title, startIndex = null, onClose, pins = [], pinning = false, onAddPin, onRemovePin, checklist = false, showStatus = checklist, onStatus, onReason }) {
  const [flash, setFlash] = useState(null);
  const [reasonFor, setReasonFor] = useState(null);
  const [reasonText, setReasonText] = useState('');
  // Open on the first file that has notes, unless a file was picked
  const [index, setIndex] = useState(() => startIndex ?? Math.max(0, files.findIndex((f) => pins.some((p) => p.file_id === f.id))));
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState(pinning);
  const [pending, setPending] = useState(null);
  const [text, setText] = useState('');
  const [openPin, setOpenPin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // A one-time tip the first time someone can pin notes (remembered on this device)
  const [tip, setTip] = useState(() => {
    if (!pinning) return false;
    try {
      return !localStorage.getItem('ld-pin-tip');
    } catch {
      return true;
    }
  });
  const hideTip = () => {
    setTip(false);
    try {
      localStorage.setItem('ld-pin-tip', '1');
    } catch {
      /* private mode: it just shows again next time */
    }
  };
  const file = files[index];
  const filePins = pins.filter((p) => p.file_id === file.id);
  const numberOf = (p) => pins.findIndex((x) => x.id === p.id) + 1;
  const unsent = pins.filter((p) => !p.sent_at);

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
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      if (pending || openPin) {
        setPending(null);
        setOpenPin(null);
      } else onClose();
    };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [onClose, pending, openPin]);

  async function savePin(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onAddPin({ file_id: file.id, page: pending.page, x: Number(pending.x.toFixed(4)), y: Number(pending.y.toFixed(4)), body: text.trim() });
      setPending(null);
      setText('');
    } catch (error) {
      setErr(error.message || 'Couldn’t save that note.');
    } finally {
      setBusy(false);
    }
  }

  const frame = (pageNo, content) => (
    <PageFrame
      key={pageNo}
      pageNo={pageNo}
      pins={filePins.filter((p) => p.page === pageNo)}
      numberOf={numberOf}
      pinning={pinning && mode}
      pending={pending}
      showStatus={showStatus}
      flash={flash}
      onTap={(page, x, y) => {
        hideTip();
        setOpenPin(null);
        setText('');
        setPending({ page, x, y });
      }}
      onOpenPin={(p) => {
        setPending(null);
        setOpenPin(p);
      }}
    >
      {content}
    </PageFrame>
  );

  return (
    <div className="pv" role="dialog" aria-label={title || file.name}>
      <div className="pv-bar">
        <div className="pv-title">
          {title && <span className="pv-round">{title}</span>}
          <span className="pv-name">{file.name}</span>
        </div>
        {pinning && (
          <button type="button" className={`pv-pinbtn${mode ? ' pv-pinbtn--on' : ''}`} onClick={() => setMode((m) => !m)} aria-pressed={mode}>
            <Icon name="plus" size={14} /> <span>{mode ? 'Adding notes' : 'Add a note'}</span>
          </button>
        )}
        <button type="button" className="btn btn--sm btn--light pv-dl" onClick={() => openFile(file)}>
          <Icon name="download" size={14} /> <span>Download</span>
        </button>
        <button type="button" className="pv-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </div>

      {pinning && mode && <p className="pv-hint">Tap the spot you’d like changed and write your note. Notes go out together when you send your changes.</p>}

      {files.length > 1 && (
        <div className="pv-tabs" role="tablist">
          {files.map((f, i) => (
            <button key={f.id} type="button" role="tab" aria-selected={i === index} className={i === index ? 'on' : ''} onClick={() => { setIndex(i); setPending(null); setOpenPin(null); }}>
              {f.name}{pins.some((p) => p.file_id === f.id) ? ` · ${pins.filter((p) => p.file_id === f.id).length}` : ''}
            </button>
          ))}
        </div>
      )}

      <div className="pv-main">
      <div className="pv-body">
        {failed && <p className="pv-note">This file couldn't be loaded. Try Download.</p>}
        {url && isPdf(file) && <PdfPages key={url} url={url} frame={frame} />}
        {url && isImage(file) && <div className="pv-pages">{frame(1, <img className="pv-img" src={url} alt={file.name} />)}</div>}
        {url && !isPdf(file) && !isImage(file) && (
          <p className="pv-note">This type of file can't be shown here. Use Download to open it.</p>
        )}
      </div>
      {checklist && pins.length > 0 && (
        <aside className="pv-list" aria-label="Notes checklist">
          <div className="pv-list-head">
            <p className="pv-list-title">Notes</p>
            <span>{pins.filter((p) => p.done_at || p.skipped_at).length} of {pins.length} handled</span>
          </div>
          <div className="pv-list-bar"><i style={{ width: `${(pins.filter((p) => p.done_at || p.skipped_at).length / pins.length) * 100}%` }} /></div>
          <ol>
            {pins.map((p) => {
              const state = p.done_at ? 'done' : p.skipped_at ? 'skipped' : '';
              return (
                <li key={p.id} className={`${state}${openPin?.id === p.id || flash === p.id ? ' on' : ''}`}>
                  <button type="button" className="pv-check" aria-label={p.done_at ? 'Mark not done' : 'Mark done'} title={p.done_at ? 'Mark not done' : 'Mark done'} onClick={() => onStatus?.(p, p.done_at ? 'open' : 'done')}>
                    {p.done_at ? '✓' : ''}
                  </button>
                  <div className="pv-li-main">
                    <button
                      type="button"
                      className="pv-item"
                      onClick={() => {
                        const i = files.findIndex((f) => f.id === p.file_id);
                        if (i >= 0 && i !== index) setIndex(i);
                        setFlash(p.id);
                        setTimeout(() => document.querySelector('.pin--flash')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), i !== index ? 900 : 60);
                        setTimeout(() => setFlash(null), 2200);
                      }}
                    >
                      <span className="pv-num">{numberOf(p)}</span>
                      <span className="pv-text">
                        <small>Page {p.page}{files.length > 1 ? ` · ${(files.find((f) => f.id === p.file_id)?.name || '').replace(/\.pdf$/i, '')}` : ''}</small>
                        <span>{p.body}</span>
                      </span>
                    </button>
                    {p.skipped_at && reasonFor !== p.id && (
                      <p className="pv-skip">
                        <b>Not changed</b>{p.admin_note ? `: ${p.admin_note}` : ''}{' '}
                        <button type="button" onClick={() => { setReasonFor(p.id); setReasonText(p.admin_note || ''); }}>Edit</button>
                        <button type="button" onClick={() => onStatus?.(p, 'open')}>Undo</button>
                      </p>
                    )}
                    {!p.done_at && !p.skipped_at && reasonFor !== p.id && (
                      <button type="button" className="pv-skip-btn" onClick={() => { setReasonFor(p.id); setReasonText(''); }}>Didn’t change this</button>
                    )}
                    {reasonFor === p.id && (
                      <form
                        className="pv-reason"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!p.skipped_at) await onStatus?.(p, 'skipped');
                          await onReason?.(p, reasonText.trim());
                          setReasonFor(null);
                        }}
                      >
                        <AutoGrow autoFocus value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Why, in a line (they’ll see this with the next proof)" maxHeight={120} />
                        <div>
                          <button type="submit" className="pv-reason-save">Save</button>
                          <button type="button" onClick={() => setReasonFor(null)}>Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="pv-list-foot">Customers see what’s done, and your reasons, when you send the next proof.</p>
        </aside>
      )}
      </div>

      {tip && pinning && mode && !pending && !openPin && (
        <div className="pv-tip" role="note">
          <span className="pv-tip-pin" aria-hidden="true"><i /></span>
          <p><b>Tap anywhere on the proof</b> to leave a note right on that spot, like “make this title smaller.”</p>
          <p className="pv-tip-sub">Add as many as you like. They go to me together when you send your changes.</p>
          <button type="button" className="btn btn--sm btn--light" onClick={hideTip}>Got it</button>
        </div>
      )}

      {pending && (
        <form className="pv-sheet" onSubmit={savePin}>
          <p className="pv-sheet-title">Note for page {pending.page}</p>
          <AutoGrow autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What would you like changed here?" maxHeight={160} />
          {err && <p className="pv-sheet-err">{err}</p>}
          <div className="pv-sheet-btns">
            <button type="submit" className="btn btn--sm btn--light" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save note'}</button>
            <button type="button" className="pv-link" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </form>
      )}

      {openPin && (
        <div className="pv-sheet">
          <p className="pv-sheet-title">Note {numberOf(openPin)} · page {openPin.page}</p>
          <p className="pv-sheet-body">{openPin.body}</p>
          <div className="pv-sheet-btns">
            <button type="button" className="btn btn--sm btn--light" onClick={() => setOpenPin(null)}>Close</button>
            {pinning && !openPin.sent_at && (
              <button type="button" className="pv-link" onClick={() => { onRemovePin(openPin.id); setOpenPin(null); }}>Delete note</button>
            )}
          </div>
        </div>
      )}

      {pinning && !pending && !openPin && unsent.length > 0 && (
        <div className="pv-foot">
          <span>{unsent.length} {unsent.length === 1 ? 'note' : 'notes'} ready to send</span>
          <button type="button" className="btn btn--sm btn--light" onClick={onClose}>Done</button>
        </div>
      )}
    </div>
  );
}
