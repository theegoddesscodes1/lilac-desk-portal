import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ALL_STAGES, NO_RESPONSE_DAYS, WAITING_ON_CUSTOMER, plannerLabel, stageInfo } from '../portal-config';
import { daysSince, errorText, formatDate, notify, uploadOrderFile, useOrderData } from '../lib/orderApi';
import StageTracker from '../components/StageTracker';
import BriefForm from '../components/BriefForm';
import FileList from '../components/FileList';
import ChatPanel from '../components/ChatPanel';

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StageControl({ order }) {
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
      <label className="check">
        <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
        Email the customer about this update
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function DueAndRevisions({ order }) {
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

function Uploader({ order }) {
  const [kind, setKind] = useState('proof');
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
        await uploadOrderFile(order.id, kind, file, 'admin');
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
        <label className="check">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
          Add the proof watermark before uploading
        </label>
      )}
      {kind !== 'source' && (
        <label className="check">
          <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} />
          {kind === 'proof' ? 'Set stage to Proof ready and email the customer' : 'Set stage to Delivered and email the customer'}
        </label>
      )}
      {kind !== 'proof' && (
        <p className="field-help">Final and source files stay hidden from the customer until the stage is Delivered.</p>
      )}
      <button type="submit" className="btn" disabled={!files.length || Boolean(busy)}>
        {busy || 'Upload'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export default function AdminOrderPage() {
  const { id } = useParams();
  const { loading, error, order, files, messages, orderAddons } = useOrderData(id);

  if (loading) return <p className="muted page-pad">Loading order</p>;
  if (error) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to="/" className="link-btn">Back to orders</Link>
      </main>
    );
  }

  const quiet = daysSince(order.last_customer_activity_at);
  const flag = WAITING_ON_CUSTOMER.includes(order.stage) && quiet >= NO_RESPONSE_DAYS;
  const byKind = (k) => files.filter((f) => f.kind === k);

  return (
    <main className="page page--wide">
      <header className="order-head">
        <Link to="/" className="back-link">All orders</Link>
        <h1 className="h-page">{order.shopify_order_name}</h1>
        <p className="order-sub">
          {plannerLabel(order)}, {order.customer_name || order.customer_email}
          {order.customer_name && <span className="muted"> ({order.customer_email})</span>}
        </p>
        <p className="muted small">
          Ordered {formatDate(order.created_at)}
          {order.brief_submitted_at && `, brief submitted ${formatDate(order.brief_submitted_at)}`}
          {order.due_at && `, due ${formatDate(order.due_at, true)}`}
          {order.delivered_at && `, delivered ${formatDate(order.delivered_at)}`}
        </p>
        {flag && (
          <p className="flag-note">
            No response for {quiet} days. Under your policy this order can be closed.
          </p>
        )}
      </header>

      <StageTracker stage={order.stage} />

      <div className="order-grid">
        <div className="order-main">
          <section className="panel">
            <h2 className="h-section">Manage</h2>
            <StageControl order={order} />
            <DueAndRevisions order={order} />
            <Uploader order={order} />
          </section>

          <section className="panel">
            <h2 className="h-section">Files</h2>
            <h3 className="h-sub">Proofs</h3>
            <FileList files={byKind('proof')} empty="No proofs yet." />
            <h3 className="h-sub">Final files</h3>
            <FileList files={[...byKind('final'), ...byKind('source')]} empty="No final files yet." />
            <h3 className="h-sub">From the customer</h3>
            <FileList files={[...byKind('brief'), ...byKind('chat')]} empty="Nothing uploaded yet." />
          </section>

          <section className="panel">
            <h2 className="h-section">Add-ons</h2>
            {orderAddons.length === 0 ? (
              <p className="muted">No add-ons.</p>
            ) : (
              <ul className="plain-list">
                {orderAddons.map((a) => (
                  <li key={a.id}>
                    {a.name}
                    {a.quantity > 1 ? ` (x${a.quantity})` : ''}
                    <span className="muted small"> {formatDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="h-section">Brief</h2>
            {order.brief_submitted_at ? (
              <BriefForm order={order} readOnly />
            ) : (
              <p className="muted">Not submitted yet.</p>
            )}
          </section>
        </div>

        <aside className="order-side">
          <ChatPanel
            orderId={order.id}
            messages={messages}
            files={files}
            viewer="admin"
            customerName={order.customer_name || order.customer_email}
          />
        </aside>
      </div>
    </main>
  );
}
