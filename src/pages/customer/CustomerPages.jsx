import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { DESIGNER_NAME, FIX_WINDOW_DAYS, SHOP_URL, plannerLabel } from '../../portal-config';
import OrderChecklist from '../../components/OrderChecklist';
import { errorText, formatDate, formatSize, notify, openFile, proofRounds, refreshAll, useOrderData } from '../../lib/orderApi';
import { FileChip, ImageGrid, isImage } from '../../components/FilePreview';
import { RoundList } from '../../components/ProofRounds';
import ProofViewer from '../../components/ProofViewer';
import { pinLines, usePins } from '../../lib/proofPins';
import { daysUntil, isActive, isDone, shortDate, useCustomer } from '../../lib/portalData';
import { signOut } from '../../lib/appVersion';
import { DeliveryLine, ProgressDots, ProgressHead } from '../../components/Bits';
import BriefForm from '../../components/BriefForm';
import ChatPanel from '../../components/ChatPanel';
import AddExtras from '../../components/AddExtras';
import Icon from '../../components/Icons';
import AutoGrow from '../../components/AutoGrow';
import { DeclinePanel, QuoteCard } from '../QuotePages';
import { ContactRows } from '../ContactPages';
import PlannerGuide from '../../components/PlannerGuide';
import CustomerChatSwitch from '../../components/CustomerChatSwitch';
import { ReviewSlot, REVIEWABLE } from '../../components/Reviews';

function useOrder() {
  const { id } = useParams();
  return useOrderData(id);
}

function NoOrder({ title }) {
  const { email, contacts, unreadContact } = useCustomer();
  return (
    <main className="page page--narrow empty-state">
      <p className="label muted">Your orders</p>
      <h1 className="h-display">{title}</h1>
      <p className="lead">You’re signed in as <b>{email}</b>. Orders show up under the email used at checkout, usually within a minute of paying.</p>
      <ul className="empty-tips">
        <li>Used a different email at checkout? Sign out and sign in with that one.</li>
        <li>Just ordered? Give it a minute, then refresh.</li>
        <li>Still stuck? Email <a href="mailto:support@lilacdesk.com">support@lilacdesk.com</a> with your order number.</li>
      </ul>
      <div className="btn-row">
        <Link to="/quote/new" className="btn btn--ox">Request a custom planner</Link>
        <a href={`${SHOP_URL}/pages/custom-planners`} className="btn btn--ghost">See planner tiers</a>
        <button type="button" className="btn btn--ghost" onClick={signOut}>Sign out</button>
      </div>
      {contacts?.length > 0 && <div className="noorder-contacts"><ContactRows contacts={contacts} unreadContact={unreadContact} /></div>}
    </main>
  );
}

function Loading({ error }) {
  if (error) return <NoOrder title="We couldn’t find that order." />;
  return <p className="muted page-pad">Loading your order</p>;
}

// ---------- Root: send them to their current order ----------

export function CustomerRoot() {
  const { loading, current, openQuote, quotes } = useCustomer();
  if (loading) return <p className="muted page-pad">Loading your order</p>;
  if (!current && (openQuote || quotes?.length)) return <QuoteHome quote={openQuote || quotes[0]} />;
  if (!current) return <NoOrder title="No custom planner orders yet." />;
  return <Navigate to={`/orders/${current.id}`} replace />;
}

// ---------- Home when there's a custom request but no order yet ----------

const QUOTE_STEPS = ['Request', 'Quote', 'Pay', 'Brief'];

function QuoteHome({ quote }) {
  const { unreadQuote, contacts, unreadContact } = useCustomer();
  const [declining, setDeclining] = useState(false);
  const chat = `/quotes/${quote.id}`;
  const unread = unreadQuote(quote.id);
  const at = { open: 1, quoted: 2, paid: 3, closed: -1 }[quote.status] ?? 1;
  const copy = {
    open: { title: 'Your request is in.', text: 'I’m reading it over and will reply in your request chat, usually within a day. You’ll get an email when I do.' },
    quoted: { title: 'Your quote is ready.', text: 'Look it over, ask anything you’re unsure about, and pay when you’re ready. Your brief opens right after.' },
    paid: { title: 'Payment received.', text: 'Your order is being set up. It will appear here in a minute or two.' },
    closed: quote.closed_by === 'customer'
      ? { title: 'You declined this quote.', text: 'Thanks for letting me know. If anything changes, send a new request anytime, or choose one of the planner tiers.' }
      : { title: 'This request is closed.', text: 'This quote didn’t go ahead. If anything changes, you can send a new request anytime, or choose one of the planner tiers.' },
  }[quote.status] || {};
  const idea = quote.request?.idea;

  return (
    <main className="page home">
      <div className="home-grid">
        <div>
          <p className="label muted">Custom planner request · {formatDate(quote.created_at)}</p>
          <p className="label ox home-next">{quote.status === 'closed' ? (quote.closed_by === 'customer' ? 'Declined' : 'Request closed') : 'Where things are'}</p>
          <h1 className="h-display">{copy.title}</h1>
          <p className="lead">{copy.text}</p>
          <div className="btn-row">
            {quote.status === 'closed' ? (
              <>
                <Link to="/quote/new" className="btn btn--ox btn--lg">Send a new request</Link>
                <a href={`${SHOP_URL}/pages/custom-planners`} className="btn btn--ghost btn--lg">See planner tiers</a>
              </>
            ) : quote.status === 'quoted' && quote.invoice_url ? (
              <>
                <a href={quote.invoice_url} className="btn btn--ox btn--lg">Pay and start</a>
                <Link to={chat} className="btn btn--ghost btn--lg">Ask a question{unread ? ` (${unread})` : ''}</Link>
              </>
            ) : (
              <Link to={chat} className={`btn ${unread ? 'btn--ox' : 'btn--ghost'} btn--lg`}>{unread ? `Read ${DESIGNER_NAME}’s reply` : 'Open your request'}</Link>
            )}
          </div>

          {['open', 'quoted'].includes(quote.status) && (declining ? (
            <div className="panel-box qhome-decline">
              <DeclinePanel quote={quote} onDone={() => setDeclining(false)} onCancel={() => setDeclining(false)} />
            </div>
          ) : (
            <button type="button" className="link-btn small qhome-no" onClick={() => setDeclining(true)}>
              {quote.status === 'quoted' ? 'No thanks, decline this quote' : 'Withdraw this request'}
            </button>
          ))}

          {at > 0 && (
            <ol className="qprog" aria-label="Progress">
              {QUOTE_STEPS.map((label, i) => (
                <li key={label} className={i < at ? 'done' : i === at ? 'now' : ''}><span />{label}</li>
              ))}
            </ol>
          )}
        </div>

        <div className="home-side">
          {quote.status === 'quoted' && quote.price ? <QuoteCard quote={quote} compact /> : null}
          {idea && (
            <div className="home-quote">
              <p className="label muted">What you asked for</p>
              <p className="quote">“{idea}”</p>
              <Link to={chat} className="small"><u>{quote.status === 'closed' ? 'View the conversation' : 'Open the conversation'}</u></Link>
            </div>
          )}
          <ContactRows contacts={(contacts || []).filter((c) => c.quote_id !== quote.id)} unreadContact={unreadContact} />
        </div>
      </div>
    </main>
  );
}

// ---------- Home ----------

function nextStep(order, proofCount, base) {
  const n = proofCount || 1;
  switch (order.stage) {
    case 'order_placed':
      if (Object.keys(order.brief || {}).length) {
        return { title: 'Your brief is started.', text: 'Pick up where you left off. Your delivery countdown starts as soon as you submit it.', action: 'Finish your brief', to: `${base}/brief` };
      }
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

// For the "Also in progress" list: when it's due, and anything waiting on them
function customerDue(o) {
  if (!o.due_at) return o.brief_submitted_at ? 'Delivery date coming soon' : 'Delivery date set after your brief';
  const d = daysUntil(o.due_at);
  if (d < 0) return `Was due ${shortDate(o.due_at)}`;
  if (d === 0) return 'Due today';
  return `Due in ${d} ${d === 1 ? 'day' : 'days'} · ${shortDate(o.due_at)}`;
}

function needsFrom(o, unread) {
  if (o.stage === 'order_placed' && !o.brief_submitted_at) return { label: 'Brief needed', action: 'Fill in', path: 'brief' };
  if (o.stage === 'proof_ready') return { label: 'Proof to review', action: 'Review', path: 'proofs' };
  if (unread) return { label: 'New message', action: 'Read', path: 'messages' };
  return null;
}

export function CustomerHome() {
  const { loading, error, order, files, messages, orderAddons, addons } = useOrder();
  const { orders, openQuote, contacts, unreadContact, unreadFor } = useCustomer();
  if (loading || error) return <Loading error={error} />;

  const base = `/orders/${order.id}`;
  const proofs = files.filter((f) => f.kind === 'proof');
  const step = nextStep(order, proofRounds(files).length, base);
  const lastFromKerry = [...messages].reverse().find((m) => m.sender === 'admin');
  const others = orders.filter((o) => o.id !== order.id);
  // Ones waiting on them first, then soonest due
  const otherActive = others.filter(isActive).sort((a, b) => Number(Boolean(needsFrom(b, unreadFor(b.id)))) - Number(Boolean(needsFrom(a, unreadFor(a.id)))) || new Date(a.due_at || 8e15) - new Date(b.due_at || 8e15));
  const past = others.filter((o) => isDone(o));

  return (
    <main className="page home">
      <div className="home-grid">
        <div>
          <p className="label muted">Order {order.shopify_order_name} · {plannerLabel(order)}</p>
          {orderAddons.length > 0 && <p className="label muted home-extras">With {orderAddons.map((a) => a.name).join(', ')}</p>}
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
          {REVIEWABLE.includes(order.stage) && (
            <div className="home-review">
              <p className="label muted">How’s your planner?</p>
              <ReviewSlot order={order} variant="card" autoOpen={new URLSearchParams(window.location.search).get('review') === '1'} />
            </div>
          )}
          {lastFromKerry && (
            <div className="home-quote hide-phone">
              <p className="label muted">Latest from {DESIGNER_NAME} · {shortDate(lastFromKerry.created_at)}</p>
              <p className="quote">“{lastFromKerry.body}”</p>
              <Link to={`${base}/messages`} className="small"><u>Reply</u></Link>
            </div>
          )}
          {order.brief_submitted_at && (
            <Link to={`${base}/brief`} className="mini-row home-brief">
              <span>Your brief<small>Submitted {shortDate(order.brief_submitted_at)}</small></span>
              <span className="small"><u>View</u></span>
            </Link>
          )}
          <OrderChecklist order={order} orderAddons={orderAddons} />
          <AddExtras order={order} addons={addons} orderAddons={orderAddons} />
          {openQuote ? (
            <Link to={openQuote.request?.order_id ? `/orders/${openQuote.request.order_id}/messages` : `/quotes/${openQuote.id}`} className="mini-row">
              <span>{openQuote.request?.from === 'chat' ? `A quote from ${DESIGNER_NAME}` : 'Your custom planner request'}<small>{openQuote.status === 'quoted' ? 'Ready to review and pay' : 'In conversation'}</small></span>
              <span className="small"><u>Open</u></span>
            </Link>
          ) : (
            <Link to="/quote/new" className="mini-row">
              <span>Something custom in mind?<small>Request a quote for a planner beyond the tiers</small></span>
              <span className="small"><u>Ask</u></span>
            </Link>
          )}

          <ContactRows contacts={(contacts || []).filter((c) => !c.quote_id && (c.status === 'open' || unreadContact(c.id)))} unreadContact={unreadContact} />

          {otherActive.length > 0 && (
            <div className="home-list">
              <p className="label muted">Also in progress</p>
              {otherActive.map((o) => {
                const need = needsFrom(o, unreadFor(o.id));
                return (
                  <Link key={o.id} to={need ? `/orders/${o.id}/${need.path}` : `/orders/${o.id}`} className="mini-row other-order">
                    <span>
                      {plannerLabel(o)}
                      <small>{o.shopify_order_name} · {customerDue(o)}</small>
                      {need && <span className="otag otag--ox other-need">{need.label}</span>}
                    </span>
                    <span className="small"><u>{need ? need.action : 'Open'}</u></span>
                  </Link>
                );
              })}
            </div>
          )}
          {(isDone(order) || past.length > 0) && !otherActive.length && (
            <a href={`${SHOP_URL}/pages/custom-planners`} className="again">
              <span className="label ox">Order again</span>
              <b>Ready for next year’s planner?</b>
              <span>Choose a tier, and your last brief is waiting to be reused, so you only change what’s different.</span>
              <span className="again-go">See planner tiers <Icon name="chevron" size={14} /></span>
            </a>
          )}
          {past.length > 0 && (
            <div className="home-list">
              <p className="label muted">Past orders</p>
              {past.map((o) => (
                <div key={o.id} className="mini-row mini-row--past">
                  <Link to={`/orders/${o.id}`} className="mini-row-main">
                    <span>{plannerLabel(o)}<small>{o.shopify_order_name} · Delivered {shortDate(o.delivered_at)}</small></span>
                  </Link>
                  <span className="mini-row-acts">
                    <ReviewSlot order={o} />
                    <Link to={`/orders/${o.id}/files`} className="small"><u>Files</u></Link>
                  </span>
                </div>
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
  const { orders } = useCustomer();
  const navigate = useNavigate();
  if (loading || error) return <Loading error={error} />;
  // Their most recent submitted brief on another order, to start from
  const previous = orders
    .filter((o) => o.id !== order.id && o.brief_submitted_at && Object.keys(o.brief || {}).length)
    .sort((a, b) => new Date(b.brief_submitted_at) - new Date(a.brief_submitted_at))[0] || null;
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
      <BriefForm order={order} orderAddons={orderAddons} previous={previous} onSubmitted={reload} onSaved={() => { reload(); navigate(`/orders/${order.id}`); }} />
    </main>
  );
}

// ---------- Proofs ----------

export function CustomerProofs() {
  const { id } = useParams();
  const { loading, error, order, files, messages, reload } = useOrder();
  const { pins, add: addPin, remove: removePin, markSent } = usePins(id);
  const [notes, setNotes] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [viewing, setViewing] = useState(false);
  if (loading || error) return <Loading error={error} />;

  const rounds = proofRounds(files, messages);
  const pinsFor = (r) => pins.filter((p) => p.round === r.number && r.files.some((f) => f.id === p.file_id));
  const draftPins = rounds[0] ? pinsFor(rounds[0]).filter((p) => !p.sent_at) : [];
  // Their notes on the round before this one, with what Kerry did (shown once the new proof is out)
  const prevRound = rounds[1] || null;
  const prevNotes = prevRound ? pinsFor(prevRound).filter((p) => p.sent_at) : [];
  const [showPrev, setShowPrev] = [viewing === 'prev', (on) => setViewing(on ? 'prev' : false)];
  const [latest, ...earlier] = rounds;
  const waiting = order.stage === 'proof_ready';
  const approved = latest && (latest.verdict?.kind === 'approval' || (!waiting && ['approved', 'delivered', 'complete'].includes(order.stage)));
  const changes = latest?.verdict?.kind === 'revision_request';
  const roundsLeft = order.revisions_included - order.revisions_used;

  async function approve() {
    const extra = draftPins.length ? `\n\nYou have ${draftPins.length} unsent ${draftPins.length === 1 ? 'note' : 'notes'} on this proof. Approving will discard ${draftPins.length === 1 ? 'it' : 'them'}.` : '';
    if (!window.confirm(`Approve proof ${latest.number}? Your final files will be prepared from it. Check dates and spelling first.${extra}`)) return;
    for (const p of draftPins) await removePin(p.id);
    setBusy(true);
    setErr('');
    const { error: rpcError } = await supabase.rpc('approve_proof', { p_order: order.id });
    setBusy(false);
    if (rpcError) setErr(errorText(rpcError));
    else {
      notify(order.id, 'approved');
      reload();
      refreshAll();
    }
  }

  async function requestChanges(event) {
    event.preventDefault();
    setBusy(true);
    setErr('');
    // Pinned notes go first ("1. page 4: make this smaller"), then anything they typed
    const composed = [draftPins.length ? `Notes on the proof:\n${pinLines(draftPins, latest.files).join('\n')}` : '', notes.trim()].filter(Boolean).join('\n\n');
    const { error: rpcError } = await supabase.rpc('request_revision', { p_order: order.id, p_notes: composed });
    setBusy(false);
    if (rpcError) setErr(errorText(rpcError));
    else {
      await markSent(latest.number);
      setNotes('');
      setAsking(false);
      notify(order.id, 'revision_request');
      reload();
      refreshAll();
    }
  }

  return (
    <main className="page page--narrow">
      <div className="page-head">
        <h1 className="sr-only">Proofs</h1>
        <span className="pill pill--lilac">{order.revisions_used} of {order.revisions_included} rounds used</span>
      </div>

      {!latest ? (
        <div className="empty">
          <p className="serif">Your first proof will appear here.</p>
          <p className="muted small">You’ll get a notification as soon as it’s ready.</p>
        </div>
      ) : (
        <>
          {waiting && (
            <div className="proof-ask">
              <p className="label ox">Waiting for you</p>
              <p className="proof-ask-title">Proof {latest.number} is ready to review.</p>
              <p className="muted small">Open it, check dates and spelling, then approve it or send one list of changes. Tap right on the proof to pin a note where you want something changed.</p>
              {prevNotes.length > 0 && (
                <div className="prev-notes">
                  <div className="prev-notes-head">
                    <p>Your notes from proof {prevRound.number}</p>
                    <span>{prevNotes.filter((p) => p.done_at).length} of {prevNotes.length} done</span>
                  </div>
                  <ol>
                    {prevNotes.map((p, i) => (
                      <li key={p.id}>
                        <span className={`pn-mark${p.done_at ? ' pn-mark--done' : ''}`}>{p.done_at ? '✓' : i + 1}</span>
                        <span className="pn-body">
                          <small>Page {p.page}{p.done_at ? ' · done' : p.skipped_at ? ' · not changed' : ''}</small>
                          {p.body}
                          {p.skipped_at && p.admin_note && <span className="pn-reason">{p.admin_note}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="link-btn small" onClick={() => setShowPrev(true)}>See them on proof {prevRound.number}</button>
                </div>
              )}
              <button type="button" className="proof-open" onClick={() => setViewing(true)}>
                <Icon name="proof" size={18} />
                <span><b>Open proof {latest.number}</b><small>{draftPins.length ? `${draftPins.length} ${draftPins.length === 1 ? 'note' : 'notes'} pinned so far` : `${latest.files.length} ${latest.files.length === 1 ? 'file' : 'files'} · tap to view and add notes`}</small></span>
                <Icon name="chevron" size={16} />
              </button>
              {!asking ? (
                <>
                  <div className="btn-pair">
                    <button type="button" className="btn btn--ox" onClick={approve} disabled={busy}>Approve</button>
                    <button type="button" className="btn btn--ghost" onClick={() => setAsking(true)} disabled={busy || roundsLeft <= 0}>{draftPins.length ? `Send ${draftPins.length} ${draftPins.length === 1 ? 'note' : 'notes'}` : 'Request changes'}</button>
                  </div>
                  <p className="muted small proof-ask-note">
                    {roundsLeft > 0
                      ? `Changes use 1 of your ${roundsLeft} remaining ${roundsLeft === 1 ? 'round' : 'rounds'}.`
                      : 'You’ve used all your revision rounds. Add an extra round from Home, or message me if something is a mistake on my end.'}
                  </p>
                </>
              ) : (
                <form onSubmit={requestChanges} className="ask">
                  {draftPins.length > 0 && (
                    <div className="pin-list">
                      <p className="field-label">Your notes on the proof</p>
                      <ol>
                        {draftPins.map((p) => (
                          <li key={p.id}>
                            <span><b>Page {p.page}</b> {p.body}</span>
                            <button type="button" className="ibtn" onClick={() => removePin(p.id)} aria-label="Remove note"><Icon name="close" size={13} /></button>
                          </li>
                        ))}
                      </ol>
                      <button type="button" className="link-btn small" onClick={() => setViewing(true)}>Add more on the proof</button>
                    </div>
                  )}
                  <label className="field-label" htmlFor="revision-notes">{draftPins.length ? 'Anything else' : 'Everything you’d like changed'}</label>
                  <p className="field-help">Send it all in one list. Mistakes on my end don’t use a round; message me about those.</p>
                  <AutoGrow id="revision-notes" className="ask-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxHeight={300} placeholder={draftPins.length ? 'Optional' : ''} />
                  <div className="btn-pair">
                    <button type="submit" className="btn btn--ox" disabled={busy || (!notes.trim() && !draftPins.length)}>Send changes</button>
                    <button type="button" className="btn btn--ghost" onClick={() => setAsking(false)}>Cancel</button>
                  </div>
                </form>
              )}
              {err && <p className="error">{err}</p>}
            </div>
          )}

          {approved && (
            <p className="proof-note"><Icon name="check" size={15} /> You approved proof {latest.number}{latest.verdict ? ` on ${formatDate(latest.verdict.at)}` : ''}. Your final files are being prepared.</p>
          )}
          {changes && <p className="proof-note">You asked for changes on {formatDate(latest.verdict.at)}. Your next proof will show up here.</p>}

          <p className="label muted section-gap-sm">All proofs</p>
          <RoundList rounds={rounds} newest={waiting ? latest.number : null} pinsFor={(r) => pinsFor(r).filter((p) => p.sent_at)} showStatus />
          {showPrev && <ProofViewer files={prevRound.files} title={`Proof ${prevRound.number} · your notes`} pins={prevNotes} showStatus onClose={() => setShowPrev(false)} />}
          {viewing === true && (
            <ProofViewer
              files={latest.files}
              title={`Proof ${latest.number}`}
              pins={pinsFor(latest)}
              pinning={waiting && roundsLeft > 0}
              onAddPin={(pin) => addPin({ ...pin, round: latest.number })}
              onRemovePin={removePin}
              onClose={() => {
                setViewing(false);
                if (draftPins.length) setAsking(true);
              }}
            />
          )}
        </>
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
      <CustomerChatSwitch active={{ type: 'order', id: order.id }} />
      <ChatPanel orderId={order.id} messages={messages} files={files} viewer="customer" disabled={order.stage === 'closed'} />
    </main>
  );
}

// ---------- Files ----------


export function CustomerFiles() {
  const { loading, error, order, files, messages, orderAddons } = useOrder();
  if (loading || error) return <Loading error={error} />;

  const released = isDone(order);
  const finals = files.filter((f) => f.kind === 'final' || f.kind === 'source');
  const shared = files.filter((f) => f.uploaded_by === 'customer');
  const sharedImages = shared.filter(isImage);
  const sharedOther = shared.filter((f) => !isImage(f));
  const rounds = proofRounds(files, messages);
  const fixUntil = order.delivered_at ? new Date(new Date(order.delivered_at).getTime() + FIX_WINDOW_DAYS * 86400000) : null;

  return (
    <main className="page page--narrow">
      <h1 className="sr-only">Your files</h1>

      {!released ? (
        <>
          <p className="lock-line">
            <Icon name="lock" size={16} />
            <span>Your files unlock when your planner is delivered{order.due_at ? <span className="muted"> · estimated {shortDate(order.due_at)}</span> : null}</span>
          </p>
          <div><OrderChecklist order={order} orderAddons={orderAddons} title="What you’ll receive" /></div>
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
          <div className="files-acts">
            <ReviewSlot order={order} variant="card" />
            <Link to={`/orders/${order.id}/receipt`} className="btn btn--ghost btn--sm"><Icon name="download" size={14} /> Receipt</Link>
          </div>
          <PlannerGuide order={order} orderAddons={orderAddons} finals={finals} />
        </>
      )}

      {rounds.length > 0 && (
        <>
          <p className="label muted section-gap">Proofs</p>
          <RoundList rounds={rounds} />
        </>
      )}

      {shared.length > 0 && (
        <>
          <p className="label muted section-gap">Files you’ve shared</p>
          {sharedImages.length > 0 && <ImageGrid files={sharedImages} />}
          {sharedOther.length > 0 && (
            <div className="chip-list">
              {sharedOther.map((f) => <FileChip key={f.id} file={f} />)}
            </div>
          )}
        </>
      )}
    </main>
  );
}
