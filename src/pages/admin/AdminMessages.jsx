import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { STAGE_TONE, stageInfo } from '../../portal-config';
import { useOrderData } from '../../lib/orderApi';
import { ago, money, useAdmin } from '../../lib/portalData';
import { QuoteThread } from '../QuotePages';
import { ContactThread } from '../ContactPages';
import { Avatar, StageDot, avatarKind } from '../../components/Bits';
import ArchiveButton from '../../components/ArchiveButton';
import ChatPanel from '../../components/ChatPanel';
import Icon from '../../components/Icons';
import { dueText, shortPlanner } from './AdminHome';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'reply', label: 'Needs reply' },
  { key: 'contact', label: 'Contact' },
  { key: 'archived', label: 'Archived' },
];

const QUICK = ['Got it, working on it now.', 'Your new proof is up.', 'Your final files are ready to download.'];
const LIVE = ['delivered', 'complete', 'closed'];

// One customer, all their orders: chips switch between each order's messages
function Conversation({ orderId }) {
  const { loading, error, order, files, messages } = useOrderData(orderId);
  const { conversationFor, isOnline } = useAdmin();
  if (loading) return <p className="muted page-pad">Loading</p>;
  if (error) return <p className="error page-pad">{error}</p>;
  const name = order.customer_name || order.customer_email;
  const convo = conversationFor(order.id);
  const chips = convo?.chips ?? [];
  const online = isOnline(order.customer_email);
  return (
    <div className="convo">
      <div className="convo-head">
        <Link to="/messages" className="convo-back" aria-label="All messages"><Icon name="back" /></Link>
        <Avatar name={name} kind={avatarKind(order)} online={online} />
        <div className="convo-who">
          <Link to={`/customers/${encodeURIComponent(order.customer_email)}`} className="chat-name"><u>{name}</u></Link>
          {online ? <span className="online-text"> · Active now</span> : order.brief?.businessName ? <span className="muted"> · {order.brief.businessName}</span> : null}
          <p className="muted small">
            <Link to={`/orders/${order.id}`}><u>{order.shopify_order_name}</u></Link> {shortPlanner(order)} · {stageInfo(order.stage).label}
            {order.due_at && !LIVE.includes(order.stage) ? ` · ${dueText(order)}` : ''}
          </p>
        </div>
        {convo && <ArchiveButton threadKey={convo.key} archived={convo.archived} className="archive-btn--icon" />}
        <Link to={`/orders/${order.id}`} className="btn btn--ghost btn--sm hide-phone">Open order</Link>
      </div>
      {chips.length > 1 && (
        <div className="ochips" role="tablist" aria-label="Their orders">
          {chips.map(({ order: o, thread }) => (
            <Link
              key={o.id}
              to={`/messages/${o.id}`}
              role="tab"
              aria-selected={o.id === order.id}
              className={`ochip${o.id === order.id ? ' ochip--on' : ''}`}
              title={`${o.shopify_order_name} · ${stageInfo(o.stage).label}`}
            >
              <i className={`sd sd--${STAGE_TONE[o.stage] || 'grey'}`} />
              {o.shopify_order_name}
              {thread.unread > 0 && o.id !== order.id && <i className="ochip-dot" aria-label="Unread" />}
            </Link>
          ))}
        </div>
      )}
      <ChatPanel key={order.id} orderId={order.id} messages={messages} files={files} viewer="admin" customerName={name} quickReplies={QUICK} />
    </div>
  );
}

export default function AdminMessages() {
  const { id, qid, cid } = useParams();
  const { loading, customerThreads = [], quoteThreads = [], contactThreads = [], isOnline } = useAdmin();
  const [filter, setFilter] = useState('all');

  // Customers, custom planner requests and contact messages in one list, newest first
  const all = useMemo(
    () =>
      [
        ...customerThreads,
        ...quoteThreads.map((t) => ({ ...t, type: 'quote' })),
        ...contactThreads.filter((t) => !t.contact.quote_id).map((t) => ({ ...t, type: 'contact' })),
      ].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt)),
    [customerThreads, quoteThreads, contactThreads]
  );
  const shown = all.filter((t) =>
    filter === 'archived' ? t.archived
      : t.archived ? false
      : filter === 'unread' ? t.unread > 0
      : filter === 'reply' ? t.needsReply
      : filter === 'contact' ? t.type === 'contact'
      : true
  );
  const openQuote = qid && quoteThreads.find((t) => t.quote.id === qid);
  const openContact = cid && contactThreads.find((t) => t.contact.id === cid);

  if (loading) return <p className="muted page-pad">Loading</p>;

  return (
    <main className={`inbox${id || qid || cid ? ' inbox--open' : ''}`}>
      <div className="inbox-list">
        <div className="inbox-head">
          <h1 className="sr-only">Messages</h1>
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 && (
          <p className="muted inbox-empty">{filter === 'archived' ? 'Nothing archived yet. Finished orders move here on their own.' : filter === 'all' ? 'No conversations yet.' : 'Nothing here.'}</p>
        )}
        {shown.map((t) => {
          if (t.type === 'contact') {
            const c = t.contact;
            const cname = c.name || c.email;
            const cpreview = t.last ? `${t.last.sender === 'admin' ? 'You: ' : ''}${t.last.body || ''}` : '';
            return (
              <Link key={t.key} to={`/messages/c/${c.id}`} className={`thread${cid === c.id ? ' thread--on' : ''}${t.unread ? ' thread--unread' : ''}`}>
                <Avatar name={cname} kind="avatar--plain" />
                <span className="thread-body">
                  <span className="thread-top"><span className="thread-name">{cname}</span><span className="muted small">{ago(t.lastAt)}</span></span>
                  <span className="thread-preview">{cpreview}</span>
                  <span className="thread-meta">
                    <span className="ntag">Contact</span>
                    {t.unread > 0 && <span className="dot" />}
                    <span className="muted small">{c.status === 'closed' ? 'Done' : c.topic}</span>
                  </span>
                </span>
              </Link>
            );
          }
          if (t.type === 'quote') {
            const q = t.quote;
            const qname = q.name || q.email;
            const qpreview = t.last ? `${t.last.sender === 'admin' ? 'You: ' : ''}${t.last.kind === 'quote' ? 'Quote sent' : t.last.body || ''}` : '';
            return (
              <Link key={t.key} to={`/messages/q/${q.id}`} className={`thread${qid === q.id ? ' thread--on' : ''}${t.unread ? ' thread--unread' : ''}`}>
                <Avatar name={qname} kind="avatar--dark" online={isOnline(q.email)} />
                <span className="thread-body">
                  <span className="thread-top"><span className="thread-name">{qname}</span><span className="muted small">{ago(t.lastAt)}</span></span>
                  <span className="thread-preview">{qpreview}</span>
                  <span className="thread-meta">
                    <span className="ntag ntag--ox">Quote</span>
                    {t.unread > 0 && <span className="dot" />}
                    <span className="muted small">
                      {q.status === 'open' ? 'New request' : q.status === 'quoted' ? `Quoted ${money(q.price)}` : q.status === 'paid' ? 'Paid' : q.closed_by === 'customer' ? `Declined${q.close_reason ? ` · ${q.close_reason}` : ''}` : 'Closed'}
                    </span>
                  </span>
                </span>
              </Link>
            );
          }
          const on = t.chips.some((x) => x.order.id === id);
          const preview = t.last ? `${t.last.sender === 'admin' ? 'You: ' : ''}${t.last.body || 'Sent a file'}` : '';
          const n = t.chips.length;
          return (
            <Link key={t.key} to={`/messages/${t.best.id}`} className={`thread${on ? ' thread--on' : ''}${t.unread ? ' thread--unread' : ''}`}>
              <Avatar name={t.name} kind={avatarKind(t.best)} online={isOnline(t.email)} />
              <span className="thread-body">
                <span className="thread-top"><span className="thread-name">{t.name}</span><span className="muted small">{ago(t.lastAt)}</span></span>
                <span className="thread-preview">{preview}</span>
                <span className="thread-meta">
                  {t.hasRevision && <span className="ntag ntag--ox">Changes</span>}
                  {t.unread > 0 && !t.hasRevision && <span className="dot" />}
                  <span className="muted small">{n > 1 ? `${n} orders` : t.best.shopify_order_name}</span>
                  {n === 1 && <StageDot stage={t.best.stage} />}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      <div className="inbox-chat">
        {cid ? (
          <ContactThread key={cid} admin contactId={cid} embedded headExtra={openContact && <ArchiveButton threadKey={openContact.key} archived={openContact.archived} className="archive-btn--icon" />} />
        ) : qid ? (
          <QuoteThread key={qid} admin quoteId={qid} embedded headExtra={openQuote && <ArchiveButton threadKey={openQuote.key} archived={openQuote.archived} className="archive-btn--icon" />} />
        ) : id ? (
          <Conversation key={id} orderId={id} />
        ) : (
          <p className="muted inbox-pick hide-phone">Choose a conversation.</p>
        )}
      </div>
    </main>
  );
}
