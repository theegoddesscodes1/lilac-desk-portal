import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { stageInfo } from '../../portal-config';
import { useOrderData } from '../../lib/orderApi';
import { ago, money, useAdmin } from '../../lib/portalData';
import { QuoteThread } from '../QuotePages';
import { Avatar, avatarKind } from '../../components/Bits';
import ChatPanel from '../../components/ChatPanel';
import Icon from '../../components/Icons';
import { dueText, shortPlanner } from './AdminHome';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'reply', label: 'Needs reply' },
  { key: 'quotes', label: 'Quotes' },
];

const QUICK = ['Got it, working on it now.', 'Your new proof is up.', 'Your final files are ready to download.'];

function Conversation({ orderId }) {
  const { loading, error, order, files, messages } = useOrderData(orderId);
  if (loading) return <p className="muted page-pad">Loading</p>;
  if (error) return <p className="error page-pad">{error}</p>;
  const name = order.customer_name || order.customer_email;
  return (
    <div className="convo">
      <div className="convo-head">
        <Link to="/messages" className="convo-back" aria-label="All messages"><Icon name="back" /></Link>
        <Avatar name={name} kind={avatarKind(order)} />
        <div className="convo-who">
          <Link to={`/customers/${encodeURIComponent(order.customer_email)}`} className="chat-name"><u>{name}</u></Link>
          {order.brief?.businessName && <span className="muted"> · {order.brief.businessName}</span>}
          <p className="muted small">
            <Link to={`/orders/${order.id}`}><u>{order.shopify_order_name}</u></Link> {shortPlanner(order)} · {stageInfo(order.stage).label}
            {order.due_at && !['delivered', 'complete', 'closed'].includes(order.stage) ? ` · ${dueText(order)}` : ''}
          </p>
        </div>
        <Link to={`/orders/${order.id}`} className="btn btn--ghost btn--sm hide-phone">Open order</Link>
      </div>
      <ChatPanel orderId={order.id} messages={messages} files={files} viewer="admin" customerName={name} quickReplies={QUICK} />
    </div>
  );
}

export default function AdminMessages() {
  const { id, qid } = useParams();
  const { loading, threads, quoteThreads } = useAdmin();
  const [filter, setFilter] = useState('all');

  // Order chats and custom planner requests in one list, newest first
  const shown = useMemo(() => {
    const all = [
      ...threads.map((t) => ({ ...t, type: 'order', key: t.order.id })),
      ...(quoteThreads ?? []).map((t) => ({ ...t, type: 'quote', key: `q-${t.quote.id}` })),
    ].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    return all.filter((t) =>
      filter === 'unread' ? t.unread > 0 : filter === 'reply' ? t.needsReply : filter === 'quotes' ? t.type === 'quote' : true
    );
  }, [threads, quoteThreads, filter]);

  if (loading) return <p className="muted page-pad">Loading</p>;

  return (
    <main className={`inbox${id || qid ? ' inbox--open' : ''}`}>
      <div className="inbox-list">
        <div className="inbox-head">
          <h1 className="sr-only">Messages</h1>
          <div className="seg">{FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>)}</div>
        </div>
        {shown.length === 0 && <p className="muted inbox-empty">{filter === 'all' ? 'No conversations yet.' : 'Nothing here.'}</p>}
        {shown.map((t) => {
          if (t.type === 'quote') {
            const q = t.quote;
            const qname = q.name || q.email;
            const qpreview = t.last ? `${t.last.sender === 'admin' ? 'You: ' : ''}${t.last.kind === 'quote' ? 'Quote sent' : t.last.body || ''}` : '';
            return (
              <Link key={t.key} to={`/messages/q/${q.id}`} className={`thread${qid === q.id ? ' thread--on' : ''}${t.unread ? ' thread--unread' : ''}`}>
                <Avatar name={qname} kind="avatar--dark" />
                <span className="thread-body">
                  <span className="thread-top"><span className="thread-name">{qname}</span><span className="muted small">{ago(t.lastAt)}</span></span>
                  <span className="thread-preview">{qpreview}</span>
                  <span className="thread-meta">
                    <span className="ntag ntag--ox">Quote</span>
                    {t.unread > 0 && <span className="dot" />}
                    <span className="muted small">{q.status === 'open' ? 'New request' : q.status === 'quoted' ? `Quoted ${money(q.price)}` : q.status === 'paid' ? 'Paid' : q.closed_by === 'customer' ? `Declined${q.close_reason ? ` · ${q.close_reason}` : ''}` : 'Closed'}</span>
                  </span>
                </span>
              </Link>
            );
          }
          const name = t.order.customer_name || t.order.customer_email;
          const preview = t.last ? `${t.last.sender === 'admin' ? 'You: ' : ''}${t.last.body || 'Sent a file'}` : '';
          return (
            <Link key={t.key} to={`/messages/${t.order.id}`} className={`thread${id === t.order.id ? ' thread--on' : ''}${t.unread ? ' thread--unread' : ''}`}>
              <Avatar name={name} kind={avatarKind(t.order)} />
              <span className="thread-body">
                <span className="thread-top"><span className="thread-name">{name}</span><span className="muted small">{ago(t.lastAt)}</span></span>
                <span className="thread-preview">{preview}</span>
                <span className="thread-meta">
                  {t.hasRevision && <span className="ntag ntag--ox">Changes</span>}
                  {t.unread > 0 && !t.hasRevision && <span className="dot" />}
                  <span className="muted small">{t.order.shopify_order_name}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      <div className="inbox-chat">
        {qid ? <QuoteThread key={qid} admin quoteId={qid} embedded /> : id ? <Conversation key={id} orderId={id} /> : <p className="muted inbox-pick hide-phone">Choose a conversation.</p>}
      </div>
    </main>
  );
}
