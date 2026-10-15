import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ALL_STAGES, stageInfo } from '../portal-config';
import { errorText, nextRoundNumber, notify, refreshAll, uploadOrderFile } from '../lib/orderApi';
import Icon from './Icons';

// A real tick box: tap to tick, tap again to untick
export function Check({ checked, onChange, children }) {
  return (
    <label className="qcheck qcheck--ctl">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="qcheck-box"><Icon name="check" size={13} /></span>
      <span>{children}</span>
    </label>
  );
}

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StageControl({ order }) {
  const [stage, setStage] = useState(order.stage);
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setStage(order.stage), [order.stage]);

  async function save() {
    setBusy(true);
    setError('');
    const patch = { stage };
    if (stage === 'delivered' && !order.delivered_at) patch.delivered_at = new Date().toISOString();
    const { error: updateError } = await supabase.from('orders').update(patch).eq('id', order.id);
    if (!updateError) {
      await supabase.from('messages').insert({
        order_id: order.id,
        sender: 'system',
        body: `Stage updated: ${stageInfo(stage).label}.`,
      });
      if (tell) notify(order.id, stage === 'delivered' ? 'final_ready' : stage === 'proof_ready' ? 'proof_ready' : 'stage');
      refreshAll();
    }
    setBusy(false);
    if (updateError) setError(errorText(updateError));
  }

  return (
    <div className="control">
      <label className="field-label" htmlFor="stage-select">Stage</label>
      <div className="control-row">
        <select id="stage-select" value={stage} onChange={(e) => setStage(e.target.value)}>
          {ALL_STAGES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <button type="button" className="btn" onClick={save} disabled={busy || stage === order.stage}>
          Update stage
        </button>
      </div>
      <Check checked={tell} onChange={setTell}>Email the customer about this update</Check>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function DueAndRevisions({ order }) {
  const [due, setDue] = useState(toLocalInput(order.due_at));
  const [included, setIncluded] = useState(order.revisions_included);
  const [used, setUsed] = useState(order.revisions_used);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setDue(toLocalInput(order.due_at));
    setIncluded(order.revisions_included);
    setUsed(order.revisions_used);
  }, [order.due_at, order.revisions_included, order.revisions_used]);

  async function save() {
    setMsg('');
    const { error } = await supabase
      .from('orders')
      .update({
        due_at: due ? new Date(due).toISOString() : null,
        revisions_included: Number(included),
        revisions_used: Number(used),
      })
      .eq('id', order.id);
    setMsg(error ? errorText(error) : 'Saved.');
    if (!error) refreshAll();
  }

  return (
    <div className="control">
      <div className="control-grid">
        <div>
          <label className="field-label" htmlFor="due-input">Due date</label>
          <input id="due-input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="rev-included">Rounds included</label>
          <input id="rev-included" type="number" min="0" value={included} onChange={(e) => setIncluded(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="rev-used">Rounds used</label>
          <input id="rev-used" type="number" min="0" value={used} onChange={(e) => setUsed(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn--ghost" onClick={save}>Save</button>
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}

export function Uploader({ order, files: existing = [], defaultKind = 'proof', onDone }) {
  const [kind, setKind] = useState(defaultKind);
  const [watermark, setWatermark] = useState(true);
  const [advance, setAdvance] = useState(true);
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const round = nextRoundNumber(existing);
  const isProof = kind === 'proof';

  async function upload() {
    if (!files.length) return;
    setError('');
    try {
      for (let i = 0; i < files.length; i += 1) {
        let file = files[i];
        if (isProof && watermark) {
          setProgress({ step: 'Watermarking', n: i + 1 });
          const { watermarkProof } = await import('../lib/watermark');
          const result = await watermarkProof(file);
          if (!result.watermarked) {
            throw new Error(`${file.name} isn't a PDF or image, so it can't be watermarked. Untick the watermark to upload it as is.`);
          }
          file = result.file;
        }
        setProgress({ step: 'Uploading', n: i + 1 });
        // Everything uploaded together is one proof round
        await uploadOrderFile(order.id, kind, file, 'admin', isProof ? round : null);
      }

      if (advance && isProof) {
        await supabase.from('orders').update({ stage: 'proof_ready' }).eq('id', order.id);
        await supabase.from('messages').insert({ order_id: order.id, sender: 'system', body: 'A new proof is ready to review.' });
        notify(order.id, 'proof_ready');
      }
      if (advance && kind === 'final') {
        await supabase
          .from('orders')
          .update({ stage: 'delivered', delivered_at: order.delivered_at ?? new Date().toISOString() })
          .eq('id', order.id);
        await supabase.from('messages').insert({ order_id: order.id, sender: 'system', body: 'Your planner is ready to download.' });
        notify(order.id, 'final_ready');
      }
      setFiles([]);
      refreshAll();
      onDone?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setProgress(null);
    }
  }

  const busy = Boolean(progress);

  return (
    <div className="up">
      {!isProof && order.license === 'commercial' && (
        <div className="up-kinds">
          {[['final', 'Final files'], ['source', 'Keynote source']].map(([k, label]) => (
            <button key={k} type="button" className={`pill-opt${kind === k ? ' pill-opt--on' : ''}`} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="up-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span>{f.name}</span>
              {!busy && (
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!busy && (
        <label className="up-drop">
          <Icon name="plus" size={16} />
          <span>{files.length ? 'Add more files' : isProof ? `Choose files for proof ${round}` : 'Choose files'}</span>
          <input type="file" multiple onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
        </label>
      )}

      <div className="up-opts">
        {isProof && <Check checked={watermark} onChange={setWatermark}>Watermark</Check>}
        {kind !== 'source' && <Check checked={advance} onChange={setAdvance}>{isProof ? 'Send to the customer now' : 'Mark delivered and notify'}</Check>}
      </div>
      {!isProof && <p className="field-help">Final and source files stay hidden until the order is delivered.</p>}

      {busy ? (
        <div className="up-progress">
          <span>{progress.step} {progress.n} of {files.length}…</span>
          <i style={{ width: `${(progress.n / files.length) * 100}%` }} />
        </div>
      ) : (
        <button type="button" className="btn btn--sm btn--ox up-go" disabled={!files.length} onClick={upload}>
          {isProof ? `Send proof ${round}` : 'Upload'}{files.length ? ` · ${files.length} ${files.length === 1 ? 'file' : 'files'}` : ''}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
