import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { FIX_WINDOW_DAYS, RELEASED_STAGES, plannerLabel } from '../portal-config';
import { errorText, formatDate, notify, useOrderData } from '../lib/orderApi';
import StageTracker from '../components/StageTracker';
import Countdown from '../components/Countdown';
import BriefForm from '../components/BriefForm';
import FileList from '../components/FileList';
import ChatPanel from '../components/ChatPanel';
import AddExtras from '../components/AddExtras';

function ProofReview({ order, proofs }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roundsLeft = order.revisions_included - order.revisions_used;
  const waiting = order.stage === 'proof_ready';

  async function approve() {
    if (!window.confirm('Approve this proof? Your final files will be prepared from it. Check dates and spelling first.')) return;
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('approve_proof', { p_order: order.id });
    setBusy(false);
    if (rpcError) setError(errorText(rpcError));
    else notify(order.id, 'approved');
  }

  async function requestChanges(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('request_revision', { p_order: order.id, p_notes: notes });
    setBusy(false);
    if (rpcError) setError(errorText(rpcError));
    else {
      setNotes('');
      notify(order.id, 'revision_request');
    }
  }

  return (
    <section className="panel" aria-label="Proofs">
      <div className="panel-head">
        <h2 className="h-section">Proofs</h2>
        <p className="muted small">
          {order.revisions_used} of {order.revisions_included} revision rounds used
        </p>
      </div>
      <FileList files={proofs} empty="Your first proof will appear here." />

      {waiting && (
        <div className="review">
          <p>Look over the latest proof, then approve it or send one list of everything you'd like changed.</p>
          <button type="button" className="btn" onClick={approve} disabled={busy}>
            Approve proof
          </button>

          <form onSubmit={requestChanges} className="review-form">
            <label className="field-label" htmlFor="revision-notes">Request changes</label>
            {roundsLeft > 0 ? (
              <>
                <p className="field-help">
                  This uses one of your {roundsLeft} remaining {roundsLeft === 1 ? 'round' : 'rounds'}. Mistakes on my end don't count; message me about those.
                </p>
                <textarea id="revision-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <button type="submit" className="btn btn--ghost" disabled={busy || !notes.trim()}>
                  Send changes
                </button>
              </>
            ) : (
              <p className="field-help">
                You've used all your revision rounds. Add an extra revision round below, or message me if something is a mistake on my end.
              </p>
            )}
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </section>
  );
}

function FinalFiles({ order, finals }) {
  const fixUntil = order.delivered_at
    ? new Date(new Date(order.delivered_at).getTime() + FIX_WINDOW_DAYS * 86400000)
    : null;
  const windowOpen = fixUntil && fixUntil > new Date();

  return (
    <section className="panel panel--accent" aria-label="Final files">
      <h2 className="h-section">Your planner</h2>
      <FileList files={finals} empty="Your final files are being uploaded." />
      {fixUntil && (
        <p className="muted small">
          {windowOpen
            ? `Found a mistake on my end, like a broken link or a spelling error? Message me by ${formatDate(fixUntil)} and I'll fix it free.`
            : 'The free fix window for this order has ended.'}
        </p>
      )}
    </section>
  );
}

export default function OrderPage() {
  const { id } = useParams();
  const { loading, error, order, files, messages, orderAddons, addons } = useOrderData(id);

  if (loading) return <p className="muted page-pad">Loading your order</p>;
  if (error) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to="/" className="link-btn">Back to your orders</Link>
      </main>
    );
  }

  const proofs = files.filter((f) => f.kind === 'proof');
  const finals = files.filter((f) => f.kind === 'final' || f.kind === 'source');
  const released = RELEASED_STAGES.includes(order.stage);
  const briefOpen = order.stage === 'order_placed' && !order.brief_submitted_at;

  return (
    <main className="page">
      <header className="order-head">
        <Link to="/" className="back-link">All orders</Link>
        <h1 className="h-page">{order.shopify_order_name}</h1>
        <p className="order-sub">{plannerLabel(order)}</p>
      </header>

      <StageTracker stage={order.stage} />
      <Countdown dueAt={order.due_at} stage={order.stage} />

      <div className="order-grid">
        <div className="order-main">
          {released && <FinalFiles order={order} finals={finals} />}

          {briefOpen ? (
            <section className="panel">
              <BriefForm order={order} />
            </section>
          ) : (
            <>
              {order.stage !== 'closed' && <ProofReview order={order} proofs={proofs} />}
              <section className="panel">
                <details>
                  <summary className="h-section summary">Your brief</summary>
                  <BriefForm order={order} readOnly />
                </details>
              </section>
            </>
          )}

          <AddExtras order={order} addons={addons} orderAddons={orderAddons} />
        </div>

        <aside className="order-side">
          <ChatPanel
            orderId={order.id}
            messages={messages}
            files={files}
            viewer="customer"
          />
        </aside>
      </div>
    </main>
  );
}
