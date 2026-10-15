import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NO_RESPONSE_DAYS, WAITING_ON_CUSTOMER, plannerLabel } from '../../portal-config';
import { daysSince, formatDate, proofRounds, useOrderData } from '../../lib/orderApi';
import { RoundFiles, RoundList, verdictText } from '../../components/ProofRounds';
import { ago, approvedProofNumber, money, orderTotal, shortDate, useAdmin } from '../../lib/portalData';
import { Avatar, ProgressDots, StageDot } from '../../components/Bits';
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

export default function AdminOrder() {
  const { id } = useParams();
  const { loading, error, order, files, messages, orderAddons } = useOrderData(id);
  const { orders, totalFor } = useAdmin();
  const [tab, setTab] = useState('overview');
  const [panel, setPanel] = useState('');

  if (loading) return <p className="muted page-pad">Loading order</p>;
  if (error) return <main className="page"><p className="error">{error}</p><Link to="/orders">Back to orders</Link></main>;

  const name = order.customer_name || order.customer_email;
  const first = name.split(' ')[0];
  const rounds = proofRounds(files, messages);
  // The one action that moves this order forward gets the filled button
  const primary = ['brief_received', 'designing', 'revisions'].includes(order.stage) ? 'proof' : order.stage === 'approved' ? 'final' : null;
  const unreadCount = messages.filter((m) => m.sender === 'customer' && !m.read_at).length;
  const latest = rounds[0];
  const approvedNo = approvedProofNumber(messages);
  const lastMsg = [...messages].reverse().find((m) => m.sender !== 'system');
  const theirs = orders.filter((o) => o.customer_email.toLowerCase() === order.customer_email.toLowerCase());
  const spent = theirs.reduce((n, o) => n + (o.id === order.id ? orderTotal(order, orderAddons) : totalFor(o)), 0);
  const quiet = daysSince(order.last_customer_activity_at);
  const flag = WAITING_ON_CUSTOMER.includes(order.stage) && quiet >= NO_RESPONSE_DAYS;
  const byKind = (...k) => files.filter((f) => k.includes(f.kind));

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'files', label: 'Files', count: files.length },
    { key: 'brief', label: 'Brief' },
    { key: 'messages', label: 'Messages', count: unreadCount, dot: true },
  ];

  return (
    <main className="page page--wide">
      <Link to="/orders" className="back-link"><Icon name="back" size={16} /> All orders</Link>
      <div className="order-layout">
        <div>
          <div className="title-row">
            <h1 className="h-page">{order.shopify_order_name}</h1>
            <StageDot stage={order.stage} />
          </div>
          <p className="order-sub">{plannerLabel(order)} for <Link to={`/customers/${encodeURIComponent(order.customer_email)}`}><u>{name}</u></Link></p>
          <p className="muted small">
            Ordered {shortDate(order.created_at)}
            {order.brief_submitted_at && ` · brief in ${shortDate(order.brief_submitted_at)}`}
            {order.due_at && !['delivered', 'complete', 'closed'].includes(order.stage) && ` · ${dueText(order)} (${shortDate(order.due_at)})`}
            {order.delivered_at && ` · delivered ${shortDate(order.delivered_at)}`}
            {` · round ${order.revisions_used} of ${order.revisions_included} used`}
          </p>
          {flag && <p className="flag-note">No response for {quiet} days. Under your policy this order can be closed.</p>}
          <div className="section-gap-sm"><ProgressDots stage={order.stage} labels /></div>

          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
                {t.label}{t.count ? (t.dot ? <span className="badge tab-badge">{t.count}</span> : <span className="muted"> {t.count}</span>) : null}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="overview">
              <div>
                <p className="label muted">Next step</p>
                <p className="lead lead--it">{NEXT[order.stage]?.(first, approvedNo)}</p>
                <div className="btn-row btn-row--three">
                  {[
                    { key: 'proof', label: 'Upload proof' },
                    { key: 'final', label: 'Upload final' },
                    { key: 'stage', label: 'Change stage' },
                  ].map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      aria-pressed={panel === a.key}
                      className={`btn btn--sm ${panel === a.key ? 'btn--ghost btn--active' : a.key === primary ? 'btn--ox' : 'btn--ghost'}`}
                      onClick={() => setPanel(panel === a.key ? '' : a.key)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                {panel === 'proof' && <div className="panel-box"><Uploader order={order} files={files} defaultKind="proof" key="proof" onDone={() => setPanel('')} /></div>}
                {panel === 'final' && <div className="panel-box"><Uploader order={order} files={files} defaultKind="final" key="final" onDone={() => setPanel('')} /></div>}
                {panel === 'stage' && <div className="panel-box"><StageControl order={order} /><DueAndRevisions order={order} /></div>}
              </div>
              <div>
                <p className="label muted">Latest proof</p>
                {latest ? (
                  <div className="latest-round">
                    <p className="latest-round-head">
                      <span>Proof {latest.number}</span>
                      <span className="muted small">{ago(latest.at)} ago · {latest.files.length} {latest.files.length === 1 ? 'file' : 'files'}</span>
                      {latest.verdict && <span className={`ntag${latest.verdict.kind === 'approval' ? ' ntag--ok' : ' ntag--ox'}`}>{verdictText(latest)}</span>}
                    </p>
                    <RoundFiles round={latest} />
                  </div>
                ) : <p className="muted small">No proofs yet.</p>}
                <p className="label muted section-gap-sm">Last message</p>
                {lastMsg ? (
                  <Link to={`/messages/${order.id}`} className="msg-card">
                    <span>{lastMsg.sender === 'admin' ? 'You' : first}: {lastMsg.body || 'Sent a file'}</span>
                    <span className="small ox"><u>Open the chat in Messages →</u></span>
                  </Link>
                ) : <p className="muted small">No messages yet. <Link to={`/messages/${order.id}`}><u>Start the chat</u></Link></p>}
              </div>
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

        <aside className="order-aside">
          <div className="paybox">
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

          <Link to={`/customers/${encodeURIComponent(order.customer_email)}`} className="cust-card">
            <div className="cust-card-head"><Avatar name={name} /><span><b>{name}</b><small>{order.customer_email}</small></span></div>
            <div className="kv"><span>Orders</span><span>{theirs.length}</span></div>
            <div className="kv"><span>Total spent</span><span className="num">{money(spent)}</span></div>
            <span className="small"><u>Customer profile →</u></span>
          </Link>
        </aside>
      </div>
    </main>
  );
}
