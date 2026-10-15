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
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const kinds = [
    { key: 'proof', label: 'Proof' },
    { key: 'final', label: 'Final file' },
    ...(order.license === 'commercial' ? [{ key: 'source', label: 'Keynote source file' }] : []),
  ];

  async function upload(event) {
    event.preventDefault();
    if (!files.length) return;
    setError('');
    // Everything uploaded together is one proof round
    const round = kind === 'proof' ? nextRoundNumber(existing) : null;
    try {
      for (const original of files) {
        let file = original;
        if (kind === 'proof' && watermark) {
          setBusy(`Watermarking ${original.name}`);
          const { watermarkProof } = await import('../lib/watermark');
          const result = await watermarkProof(original);
          if (!result.watermarked) {
            throw new Error(`${original.name} isn't a PDF or image, so it can't be watermarked. Untick watermarking to upload it as is.`);
          }
          file = result.file;
        }
        setBusy(`Uploading ${file.name}`);
        await uploadOrderFile(order.id, kind, file, 'admin', round);
      }

      if (advance && kind === 'proof') {
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
      event.target.reset();
      refreshAll();
      onDone?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <form className="control" onSubmit={upload}>
      <label className="field-label" htmlFor="upload-kind">Upload</label>
      <div className="control-row">
        <select id="upload-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k.key} value={k.key}>{k.label}</option>
          ))}
        </select>
        <label className="btn btn--ghost file-pick">
          {files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} chosen` : 'Choose files'}
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      {kind === 'proof' && (
        <Check checked={watermark} onChange={setWatermark}>Add the proof watermark before uploading</Check>
      )}
      {kind !== 'source' && (
        <Check checked={advance} onChange={setAdvance}>
          {kind === 'proof' ? 'Set stage to Proof ready and notify the customer' : 'Set stage to Delivered and notify the customer'}
        </Check>
      )}
      {kind !== 'proof' && (
        <p className="field-help">Final and source files stay hidden from the customer until the stage is Delivered.</p>
      )}
      {kind === 'proof' && <p className="field-help">Everything you choose here goes out together as proof {nextRoundNumber(existing)}.</p>}
      <button type="submit" className="btn" disabled={!files.length || Boolean(busy)}>
        {busy || 'Upload'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

