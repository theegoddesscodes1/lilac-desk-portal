import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { DESIGNER_NAME, FIX_WINDOW_DAYS, REVIEW_URL, plannerLabel } from '../../portal-config';
import { errorText, formatDate, formatSize, notify, openFile, useOrderData } from '../../lib/orderApi';
import { isActive, isDone, shortDate, useCustomer } from '../../lib/portalData';
import { DeliveryLine, ProgressDots, ProgressHead } from '../../components/Bits';
import BriefForm from '../../components/BriefForm';
import ChatPanel from '../../components/ChatPanel';
import AddExtras from '../../components/AddExtras';
import Icon from '../../components/Icons';

function useOrder() {
  const { id } = useParams();
  return useOrderData(id);
}

function Loading({ error }) {
  if (error) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to="/" className="link-btn">Back to your order</Link>
      </main>
    );
  }
  return <p className="muted page-pad">Loading your order</p>;
}

// ---------- Root: send them to their current order ----------

export function CustomerRoot() {
  const { loading, current } = useCustomer();
  if (loading) return <p className="muted page-pad">Loading your order</p>;
  if (!current) {
    return (
      <main className="page page--narrow">
        <p className="label muted">Your orders</p>
        <h1 className="h-display">No custom planner orders yet.</h1>
        <p className="lead">If you just checked out, your order appears here within a minute. Make sure you signed in with the email you used at checkout.</p>
      </main>
    );
  }
  return <Navigate to={`/orders/${current.id}`} replace />;
}

// ---------- Home ----------

function nextStep(order, proofCount, base) {
  const n = proofCount || 1;
  switch (order.stage) {
    case 'order_placed':
      return { title: 'Your brief is ready for you.', text: 'Tell me how you plan and what you love. Your delivery countdown starts as soon as it’s in.', action: 'Fill in your brief', to: `${base}/brief` };
    case 'brief_received':
    case 'designing':
      return { title: 'Your planner is being designed.', text: 'Nothing is needed from you right now. I’ll let you know as soon as your first proof is ready.', action: `Message ${DESIGNER_NAME}`, to: `${base}/messages`, ghost: true };
    case 'proof_ready':
      return { title: `Proof ${n} is ready for you.`, text: 'Look it over, then approve it or send one list of changes.', action: `Review proof ${n}`, to: `${base}/proofs` };
    case 'revisions':
      return { title: 'Your changes are being made.', text: 'I’m working through your list. Your next proof will appear in Proofs.', action: `Message ${DESIGNER_NAME}`, to: `${base}/messages`, ghost: true };
    case 'approved':
      return { title: 'Your final files are being prepared.', text: 'You approved your proof. Your planner will be ready to download soon.', action: `Message ${DESIGNER_NAME}`, to: `${base}/messages`, ghost: true };
    case 'delivered':
    case 'complete':
      return { title: 'Your planner is ready.', text: 'Download your files and start planning.', action: 'Download your files', to: `${base}/files` };
    default:
      return { title: 'This order is closed.', text: 'Message me if you’d like to pick it back up.', action: `Message ${DESIGNER_NAME}`, to: `${base}/messages`, ghost: true };
  }
}

export function CustomerHome() {
  const { loading, error, order, files, messages, orderAddons, addons } = useOrder();
  const { orders } = useCustomer();
  if (loading || error) return <Loading error={error} />;

  const base = `/orders/${order.id}`;
  const proofs = files.filter((f) => f.kind === 'proof');
  const step = nextStep(order, proofs.length, base);
  const lastFromKerry = [...messages].reverse().find((m) => m.sender === 'admin');
  const others = orders.filter((o) => o.id !== order.id);
  const otherActive = others.filter(isActive);
  const past = others.filter((o) => isDone(o));
  const extrasLine = orderAddons.length ? ` · with ${orderAddons.map((a) => a.name).join(', ')}` : '';

  return (
    <main className="page home">
      <div className="home-grid">
        <div>
          <p className="label muted">Order {order.shopify_order_name} · {plannerLabel(order)}<span className="hide-phone">{extrasLine}</span></p>
          <p className="label ox home-next">Your next step</p>
          <h1 className="h-display">{step.title}</h1>
          <p className="lead">{step.text}</p>
          <div className="btn-row">
            <Link to={step.to} className={`btn ${step.ghost ? 'btn--ghost' : 'btn--ox'} btn--lg`}>{step.action}</Link>
            {!step.ghost && <Link to={`${base}/messages`} className="btn btn--ghost btn--lg hide-phone">Message {DESIGNER_NAME}</Link>}
          </div>

          <div className="home-meta">
            <DeliveryLine order={order} long />
            {order.stage !== 'closed' && (
              <div className="home-progress">
                <ProgressHead stage={order.stage} />
                <ProgressDots stage={order.stage} labels />
              </div>
            )}
          </div>
        </div>

        <div className="home-side">
          {lastFromKerry && (
            <div className="home-quote hide-phone">
              <p className="label muted">Latest from {DESIGNER_NAME} · {shortDate(lastFromKerry.created_at)}</p>
              <p className="quote">“{lastFromKerry.body}”</p>
              <Link to={`${base}/messages`} className="small"><u>Reply</u></Link>
            </div>
          )}
          <AddExtras order={order} addons={addons} orderAddons={orderAddons} />

          {otherActive.length > 0 && (
            <div className="home-list">
              <p className="label muted">Also in progress</p>
              {otherActive.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`} className="mini-row">
                  <span>{plannerLabel(o)}<small>{o.shopify_order_name}</small></span>
                  <span className="small"><u>Open</u></span>
                </Link>
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="home-list">
              <p className="label muted">Past orders</p>
              {past.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}/files`} className="mini-row">
                  <span>{plannerLabel(o)}<small>{o.shopify_order_name} · Delivered {shortDate(o.delivered_at)}</small></span>
                  <span className="small"><u>Files</u></span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------- Brief ----------

export function CustomerBrief() {
  const { loading, error, order, orderAddons, reload } = useOrder();
  if (loading || error) return <Loading error={error} />;
  if (order.brief_submitted_at) {
    return (
      <main className="page page--narrow">
        <Link to={`/orders/${order.id}`} className="back-link"><Icon name="back" size={16} /> Home</Link>
        <p className="label muted">Order {order.shopify_order_name} · {plannerLabel(order)}</p>
        <h1 className="h-page">Your brief</h1>
        <p className="muted small">Submitted {formatDate(order.brief_submitted_at)}. Need to add something? Send me a message.</p>
        <BriefForm order={order} orderAddons={orderAddons} readOnly />
      </main>
    );
  }
  return (
    <main className="page page--brief">
      <Link to={`/orders/${order.id}`} className="back-link"><Icon name="back" size={16} /> Home</Link>
      <BriefForm order={order} orderAddons={orderAddons} onSubmitted={reload} />
    </main>
  );
}

// ---------- Proofs ----------

export function CustomerProofs() {
  const { loading, error, order, files } = useOrder();
  const [notes, setNotes] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (loading || error) return <Loading error={error} />;

  const proofs = files.filter((f) => f.kind === 'proof');
  const [latest, ...earlier] = proofs;
  const waiting = order.stage === 'proof_ready';
  const roundsLeft = order.revisions_included - order.revisions_used;

  async function approve() {
    if (!window.confirm('Approve this proof? Your final files will be prepared from it. Check dates and spelling first.')) return;
    setBusy(true);
    setErr('');
    const { error: rpcError } = await supabase.rpc('approve_proof', { p_order: order.id });
    setBusy(false);
    if (rpcError) setErr(errorText(rpcError));
    else notify(order.id, 'approved');
  }

  async function requestChanges(event) {
    event.preventDefault();
    setBusy(true);
    setErr('');
    const { error: rpcError } = await supabase.rpc('request_revision', { p_order: order.id, p_notes: notes });
    setBusy(false);
    if (rpcError) setErr(errorText(rpcError));
    else {
      setNotes('');
      setAsking(false);
      notify(order.id, 'revision_request');
    }
  }

  return (
    <main className="page page--narrow">
      <div className="page-head">
        <h1 className="h-page">Proofs</h1>
        <span className="pill pill--lilac">{order.revisions_used} of {order.revisions_included} rounds used</span>
      </div>

      {!latest ? (
        <div className="empty">
          <p className="serif">Your first proof will appear here.</p>
          <p className="muted small">You’ll get a notification as soon as it’s ready.</p>
        </div>
      ) : (
        <div className="proof-card">
          <div className="kv">
            <span className="label ox">{waiting ? 'New · ' : ''}Proof {proofs.length}</span>
            <span className="muted small">{formatDate(latest.created_at, true)}</span>
          </div>
          <button type="button" className="proof-file" onClick={() => openFile(latest)}>
            <span className="proof-thumb" aria-hidden="true">PROOF</span>
            <span>
              <span className="proof-name">{latest.name}</span>
              <span className="muted small">{formatSize(latest.size)} · watermarked</span>
              <span className="small"><u>Open proof</u></span>
            </span>
          </button>

          {waiting && !asking && (
            <>
              <div className="btn-pair">
                <button type="button" className="btn btn--ox btn--lg" onClick={approve} disabled={busy}>Approve</button>
                <button type="button" className="btn btn--ghost btn--lg" onClick={() => setAsking(true)} disabled={busy || roundsLeft <= 0}>
                  Request changes
                </button>
              </div>
              <p className="muted small">
                {roundsLeft > 0
                  ? `Approving starts your final files. Changes use 1 of your ${roundsLeft} remaining ${roundsLeft === 1 ? 'round' : 'rounds'}.`
                  : 'You’ve used all your revision rounds. Add an extra round from Home, or message me if something is a mistake on my end.'}
              </p>
            </>
          )}

          {waiting && asking && (
            <form onSubmit={requestChanges} className="ask">
              <label className="field-label" htmlFor="revision-notes">Everything you’d like changed</label>
              <p className="field-help">Send it all in one list. Mistakes on my end don’t use a round; message me about those.</p>
              <textarea id="revision-notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="btn-pair">
                <button type="submit" className="btn btn--ox btn--lg" disabled={busy || !notes.trim()}>Send changes</button>
                <button type="button" className="btn btn--ghost btn--lg" onClick={() => setAsking(false)}>Cancel</button>
              </div>
            </form>
          )}
          {err && <p className="error">{err}</p>}
        </div>
      )}

      {earlier.length > 0 && (
        <div className="home-list section-gap">
          <p className="label muted">Earlier</p>
          {earlier.map((p, i) => (
            <button key={p.id} type="button" className="mini-row" onClick={() => openFile(p)}>
              <span>Proof {earlier.length - i}<small>{shortDate(p.created_at)}</small></span>
              <span className="small"><u>Open</u></span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

// ---------- Messages ----------

export function CustomerMessages() {
  const { loading, error, order, files, messages } = useOrder();
  if (loading || error) return <Loading error={error} />;
  return (
    <main className="page page--chat">
      <div className="chat-head">
        <span className="avatar avatar--ox">{DESIGNER_NAME.charAt(0)}</span>
        <div>
          <p className="chat-name">{DESIGNER_NAME}</p>
          <p className="muted small">Usually replies within a day · {order.shopify_order_name}</p>
        </div>
      </div>
      <ChatPanel orderId={order.id} messages={messages} files={files} viewer="customer" disabled={order.stage === 'closed'} />
    </main>
  );
}

// ---------- Files ----------

const APP_TIPS = {
  GoodNotes: 'Download the PDF, tap Share, then Open in GoodNotes.',
  Notability: 'Download the PDF, tap Share, then Open in Notability.',
  Noteshelf: 'Download the PDF, tap Share, then Open in Noteshelf.',
  'Samsung Notes': 'Download the PDF, then open Samsung Notes and import it with the PDF button.',
  Xodo: 'Download the PDF, then open it with Xodo.',
};

export function CustomerFiles() {
  const { loading, error, order, files, orderAddons } = useOrder();
  if (loading || error) return <Loading error={error} />;

  const released = isDone(order);
  const finals = files.filter((f) => f.kind === 'final' || f.kind === 'source');
  const shared = files.filter((f) => f.uploaded_by === 'customer');
  const fixUntil = order.delivered_at ? new Date(new Date(order.delivered_at).getTime() + FIX_WINDOW_DAYS * 86400000) : null;
  const app = order.brief?.app;

  return (
    <main className="page page--narrow">
      <h1 className="h-page">Your files</h1>

      {!released ? (
        <>
          <div className="lock">
            <Icon name="lock" size={28} className="muted" />
            <p className="serif">Your files unlock when your planner is delivered</p>
            {order.due_at && <p className="muted small">Estimated {shortDate(order.due_at)}</p>}
          </div>
          <p className="label muted section-gap">What you’ll receive</p>
          <div className="mini-row"><span>{plannerLabel(order)}<small>Hyperlinked PDF{app ? ` for ${app}` : ''}</small></span><Icon name="lock" size={16} className="muted" /></div>
          {orderAddons.map((a) => (
            <div key={a.id} className="mini-row"><span>{a.name}{a.quantity > 1 ? ` (x${a.quantity})` : ''}</span><Icon name="lock" size={16} className="muted" /></div>
          ))}
        </>
      ) : (
        <>
          <div className="note-band">
            <p className="label">Delivered {shortDate(order.delivered_at)}</p>
            <p className="small">
              {fixUntil && fixUntil > new Date()
                ? `Spot a mistake on my end? It’s fixed free until ${shortDate(fixUntil)}. Message me any time.`
                : 'Need help with your planner? Message me any time.'}
            </p>
          </div>
          {finals.length === 0 && <p className="muted">Your files are being uploaded.</p>}
          {finals.map((f) => (
            <div key={f.id} className="file-line">
              <span className="file-icon">{f.name.split('.').pop()?.slice(0, 3).toUpperCase()}</span>
              <span>{f.name}<small>{f.kind === 'source' ? 'Source file' : 'Final'} · {formatSize(f.size)}</small></span>
              <button type="button" className="btn btn--sm" onClick={() => openFile(f)}>Download</button>
            </div>
          ))}
          <p className="label muted section-gap">Getting it into {app && APP_TIPS[app] ? app : 'your app'}</p>
          <p className="small">{(app && APP_TIPS[app]) || 'Download the PDF and open it in your note-taking app.'} Keep the original somewhere safe so you can start fresh any time.</p>
          {REVIEW_URL && <a href={REVIEW_URL} className="btn btn--ghost btn--lg btn--block section-gap">Leave a review</a>}
        </>
      )}

      {shared.length > 0 && (
        <>
          <p className="label muted section-gap">Files you’ve shared</p>
          {shared.map((f) => (
            <button key={f.id} type="button" className="mini-row" onClick={() => openFile(f)}>
              <span>{f.name}<small>{f.kind === 'brief' ? 'Brief' : 'Message'} · {shortDate(f.created_at)}</small></span>
              <span className="small"><u>View</u></span>
            </button>
          ))}
        </>
      )}
    </main>
  );
}
