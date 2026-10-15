import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NO_RESPONSE_DAYS, WAITING_ON_CUSTOMER, plannerLabel } from '../../portal-config';
import { daysSince, formatDate, proofRounds, useOrderData } from '../../lib/orderApi';
import { RoundList, verdictText } from '../../components/ProofRounds';
import ProofViewer from '../../components/ProofViewer';
import { ago, approvedProofNumber, money, orderTotal, shortDate, useAdmin } from '../../lib/portalData';
import { Avatar, StageDot } from '../../components/Bits';
import BriefForm from '../../components/BriefForm';
import FileList from '../../components/FileList';
import ChatPanel from '../../components/ChatPanel';
import Icon from '../../components/Icons';
import { DueAndRevisions, StageControl, Uploader } from '../../components/AdminControls';
import { dueText } from './AdminHome';

const NEXT = {
  order_placed: (n) => `Waiting on ${n} to fill in the brief.`,
  brief_received: () => 'The brief is in. Time to start designing.',
  designing: () => 'Designing. Upload the first proof when it’s ready.',
  proof_ready: (n) => `Waiting on ${n} to review the latest proof.`,
  revisions: (n) => `${n} asked for changes. Make them and upload the next proof.`,
  approved: (n, p) => `${n} approved ${p ? `proof ${p}` : 'the proof'}. Upload the final files.`,
  delivered: () => 'Delivered. Mark it complete once the fix window is over.',
  complete: () => 'Complete.',
  closed: () => 'Closed.',
};

const DONE = ['delivered', 'complete'];

// Milestones for this order, with the current one carrying its action
function buildSteps(order, rounds) {
  const oldestFirst = [...rounds].reverse();
  const steps = [{ key: 'placed', label: 'Order placed', sub: shortDate(order.created_at), state: 'done' }];
  steps.push(
    order.brief_submitted_at
      ? { key: 'brief', label: 'Brief received', sub: shortDate(order.brief_submitted_at), state: 'done', link: 'brief' }
      : { key: 'brief', label: 'Brief', sub: 'Waiting on the customer', state: 'now' }
  );
  for (const r of oldestFirst) {
    const verdict = r.verdict ? ` · ${verdictText(r).toLowerCase()} ${shortDate(r.verdict.at)}` : ' · waiting on review';
    steps.push({ key: `p${r.number}`, label: `Proof ${r.number}`, sub: `${r.files.length} ${r.files.length === 1 ? 'file' : 'files'} sent ${shortDate(r.at)}${verdict}`, state: r.verdict ? 'done' : 'now', round: r });
  }
  if (['brief_received', 'designing', 'revisions'].includes(order.stage)) {
    steps.push({ key: 'nextproof', label: `Proof ${rounds.length + 1}`, sub: 'Ready when you are', state: 'now', action: 'proof' });
  }
  if (order.brief_submitted_at) {
    steps.push(
      order.delivered_at
        ? { key: 'final', label: 'Final files delivered', sub: shortDate(order.delivered_at), state: 'done', link: 'files' }
        : { key: 'final', label: 'Final files', sub: order.stage === 'approved' ? 'Proof approved, ready to deliver' : 'After the proof is approved', state: order.stage === 'approved' ? 'now' : 'todo', action: order.stage === 'approved' ? 'final' : null }
    );
  }
  steps.push({ key: 'complete', label: 'Complete', sub: order.stage === 'complete' ? 'Done' : '', state: order.stage === 'complete' ? 'done' : 'todo' });
  return steps;
}

// Latest things that happened on this order, newest first
function buildActivity(order, rounds, messages, orderAddons, first) {
  const items = [];
  // Order events only; conversations live in the Messages tab
  for (const m of messages) {
    if (m.kind === 'approval') items.push({ id: m.id, at: m.created_at, text: `${first} approved ${approvedProofNumber(messages, m) ? `proof ${approvedProofNumber(messages, m)}` : 'the proof'}`, to: 'chat', strong: true });
    else if (m.kind === 'revision_request') items.push({ id: m.id, at: m.created_at, text: `${first} asked for changes`, sub: m.body, to: 'chat', strong: true });
  }
  if (order.delivered_at) items.push({ id: 'delivered', at: order.delivered_at, text: 'Final files delivered', to: 'files' });
  if (Number(order.refunded_amount) > 0 && order.refunded_at) items.push({ id: 'refund', at: order.refunded_at, text: `Refunded ${money(order.refunded_amount)}`, strong: true });
  for (const r of rounds) items.push({ id: `r${r.number}`, at: r.at, text: `You sent proof ${r.number}`, sub: `${r.files.length} ${r.files.length === 1 ? 'file' : 'files'}`, round: r });
  if (order.brief_submitted_at) items.push({ id: 'brief', at: order.brief_submitted_at, text: `${first} submitted the brief`, to: 'brief' });
  for (const a of orderAddons) {
    if (Math.abs(new Date(a.created_at) - new Date(order.created_at)) > 10 * 60000) items.push({ id: a.id, at: a.created_at, text: `${first} added ${a.name}`, to: 'files' });
  }
  items.push({ id: 'placed', at: order.created_at, text: `Order placed`, sub: plannerLabel(order) });
  return items.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export default function AdminOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { loading, error, order, files, messages, orderAddons } = useOrderData(id);
  const { orders, totalFor } = useAdmin();
  const [tab, setTab] = useState('overview');
  const [panel, setPanel] = useState('');
  const [viewing, setViewing] = useState(null);
  const [allActivity, setAllActivity] = useState(false);

  if (loading) return <p className="muted page-pad">Loading order</p>;
  if (error) return <main className="page"><p className="error">{error}</p><Link to="/orders">Back to orders</Link></main>;

  const name = order.customer_name || order.customer_email;
  const first = name.split(' ')[0];
  const rounds = proofRounds(files, messages);
  const unreadCount = messages.filter((m) => m.sender === 'customer' && !m.read_at).length;
  const approvedNo = approvedProofNumber(messages);
  const theirs = orders.filter((o) => o.customer_email.toLowerCase() === order.customer_email.toLowerCase());
  const spent = theirs.reduce((n, o) => n + (o.id === order.id ? orderTotal(order, orderAddons) : totalFor(o)), 0);
  const quiet = daysSince(order.last_customer_activity_at);
  const flag = WAITING_ON_CUSTOMER.includes(order.stage) && quiet >= NO_RESPONSE_DAYS;
  const byKind = (...k) => files.filter((f) => k.includes(f.kind));
  const steps = buildSteps(order, rounds);
  const activity = buildActivity(order, rounds, messages, orderAddons, first);
  const shownActivity = allActivity ? activity : activity.slice(0, 6);
  const profile = `/customers/${encodeURIComponent(order.customer_email)}`;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'files', label: 'Files', count: files.length },
    { key: 'brief', label: 'Brief' },
    { key: 'messages', label: 'Messages', count: unreadCount, dot: true },
  ];

  const openItem = (item) => {
    if (item.round) setViewing(item.round);
    else if (item.to === 'chat') navigate(`/messages/${order.id}`);
    else if (item.to) setTab(item.to);
  };

  const paybox = (
    <div className="paybox paybox--light">
      <div className="paybox-head"><span className="label">Order total</span><b>{money(orderTotal(order, orderAddons))}</b></div>
      <div className="paybox-row"><span>{plannerLabel(order)}</span><span className="num">{order.planner_price != null ? money(order.planner_price) : '—'}</span></div>
      {orderAddons.map((a) => (
        <div key={a.id} className="paybox-row"><span>{a.name}{a.quantity > 1 ? ` (x${a.quantity})` : ''}</span><span className="num">{a.price != null ? money(a.price) : '—'}</span></div>
      ))}
      {Number(order.refunded_amount) > 0 && (
        <div className="paybox-row ox"><span>Refunded {shortDate(order.refunded_at)}</span><span className="num">−{money(order.refunded_amount)}</span></div>
      )}
      <div className="paybox-row muted small"><span>Paid {formatDate(order.created_at)} · Shopify {order.shopify_order_name}</span></div>
    </div>
  );

  return (
    <main className="page page--wide">
      <Link to="/orders" className="back-link"><Icon name="back" size={16} /> All orders</Link>

      <Link to={profile} className="ocust">
        <Avatar name={name} />
        <span className="ocust-main">
          <b>{name}</b>
          <small>{order.customer_email}</small>
        </span>
        <span className="ocust-stats">
          <span>{theirs.length} {theirs.length === 1 ? 'order' : 'orders'}</span>
          <span className="num">{money(spent)}</span>
        </span>
        <Icon name="back" size={16} className="ocust-arrow" />
      </Link>

      <div className="order-layout">
        <div>
          <div className="title-row">
            <h1 className="h-page">{order.shopify_order_name}</h1>
            <StageDot stage={order.stage} />
          </div>
          <p className="order-sub">{plannerLabel(order)}</p>
          <p className="muted small">
            Ordered {shortDate(order.created_at)}
            {order.due_at && !['delivered', 'complete', 'closed'].includes(order.stage) && ` · ${dueText(order)} (${shortDate(order.due_at)})`}
            {` · ${order.revisions_used} of ${order.revisions_included} change rounds used`}
          </p>
          {flag && <p className="flag-note">No response for {quiet} days. Under your policy this order can be closed.</p>}

          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
                {t.label}{t.count ? (t.dot ? <span className="badge tab-badge">{t.count}</span> : <span className="muted"> {t.count}</span>) : null}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="ov">
              <p className="lead lead--it ov-next">{NEXT[order.stage]?.(first, approvedNo)}</p>

              <ol className="steps">
                {steps.map((s) => (
                  <li key={s.key} className={`step step--${s.state}`}>
                    <span className="step-mark">{s.state === 'done' ? <Icon name="check" size={12} /> : null}</span>
                    <div className="step-body">
                      <div className="step-line">
                        {s.round ? (
                          <button type="button" className="step-label link-btn" onClick={() => setViewing(s.round)}>{s.label}</button>
                        ) : s.link ? (
                          <button type="button" className="step-label link-btn" onClick={() => setTab(s.link)}>{s.label}</button>
                        ) : (
                          <span className="step-label">{s.label}</span>
                        )}
                        {s.action && (
                          <button
                            type="button"
                            aria-pressed={panel === s.action}
                            className={`btn btn--sm ${panel === s.action ? 'btn--ghost btn--active' : 'btn--ox'}`}
                            onClick={() => setPanel(panel === s.action ? '' : s.action)}
                          >
                            {s.action === 'proof' ? 'Upload proof' : 'Upload final'}
                          </button>
                        )}
                      </div>
                      {s.sub && <p className="step-sub">{s.sub}</p>}
                      {s.action && panel === s.action && (
                        <div className="panel-box">
                          <Uploader order={order} files={files} defaultKind={s.action} key={s.action} onDone={() => setPanel('')} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="ov-head">
                <p className="label muted">Latest updates</p>

              </div>
              <ul className="log">
                {shownActivity.map((item) => {
                  const clickable = item.round || item.to;
                  const inner = (
                    <>
                      <span className="log-text">
                        <span className={item.strong ? 'log-strong' : ''}>{item.text}</span>
                        {item.sub && <small>{item.sub}</small>}
                      </span>
                      <span className="log-time">{ago(item.at)}</span>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {clickable ? <button type="button" className="log-row" onClick={() => openItem(item)}>{inner}</button> : <div className="log-row">{inner}</div>}
                    </li>
                  );
                })}
              </ul>
              {activity.length > 6 && (
                <button type="button" className="link-btn small log-more" onClick={() => setAllActivity((v) => !v)}>
                  {allActivity ? 'Show less' : `Show all ${activity.length}`}
                </button>
              )}

              <div className="ov-tools">
                <button type="button" className={`link-btn small${panel === 'stage' ? ' ox' : ''}`} onClick={() => setPanel(panel === 'stage' ? '' : 'stage')}>
                  Change stage, due date, or rounds
                </button>
                {panel === 'stage' && <div className="panel-box"><StageControl order={order} /><DueAndRevisions order={order} /></div>}
              </div>

              <div className="show-phone-block">{paybox}</div>
            </div>
          )}

          {tab === 'files' && (
            <div className="tab-body">
              <h3 className="h-sub">Proofs</h3>
              {rounds.length ? <RoundList rounds={rounds} /> : <p className="muted">No proofs yet.</p>}
              <h3 className="h-sub">Final files</h3>
              <FileList files={byKind('final', 'source')} empty="No final files yet." />
              <h3 className="h-sub">From the customer</h3>
              <FileList files={byKind('brief', 'chat')} empty="Nothing uploaded yet." />
            </div>
          )}

          {tab === 'brief' && (
            <div className="tab-body">
              {order.brief_submitted_at ? <BriefForm order={order} orderAddons={orderAddons} readOnly /> : <p className="muted">Not submitted yet.</p>}
            </div>
          )}

          {tab === 'messages' && (
            <div className="tab-body tab-body--chat">
              <ChatPanel orderId={order.id} messages={messages} files={files} viewer="admin" customerName={name} />
            </div>
          )}
        </div>

        <aside className="order-aside hide-phone">{paybox}</aside>
      </div>

      {viewing && <ProofViewer files={viewing.files} title={`Proof ${viewing.number}`} onClose={() => setViewing(null)} />}
    </main>
  );
}
