import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TIERS } from '../portal-config';
import { isActive, useCustomer } from '../lib/portalData';

// Customer side: switch between their chats (one per order, plus questions and custom requests).
// Hidden when they only have one chat.
// active = { type: 'order' | 'contact' | 'quote', id }
export default function CustomerChatSwitch({ active }) {
  const ctx = useCustomer();
  const trackRef = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const activeKey = `${active?.type}-${active?.id}`;

  // Keep the open chat in view and fade the edges when there are more chats to scroll to
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const on = el.querySelector('.ochip--on');
    if (on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
    const check = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [activeKey, ctx?.orders?.length, ctx?.quotes?.length, ctx?.contacts?.length]);

  if (!ctx) return null;
  const { orders = [], quotes = [], contacts = [], unreadFor, unreadQuote, unreadContact } = ctx;
  const isOn = (type, id) => active?.type === type && active?.id === id;

  const sortedOrders = [...orders].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || new Date(b.created_at) - new Date(a.created_at));
  const chats = [
    ...sortedOrders.map((o) => ({
      type: 'order',
      id: o.id,
      to: `/orders/${o.id}/messages`,
      label: `${TIERS[o.tier]?.label ?? 'Planner'} · ${o.shopify_order_name}`,
      unread: unreadFor(o.id),
    })),
    // Requests from the quote form (quotes sent inside an order chat already live there)
    ...quotes
      .filter((q) => !q.request?.order_id)
      .filter((q) => q.status === 'open' || q.status === 'quoted' || unreadQuote(q.id) || isOn('quote', q.id))
      .map((q) => ({ type: 'quote', id: q.id, to: `/quotes/${q.id}`, label: 'Custom request', unread: unreadQuote(q.id) })),
    // Contact-form questions (ones turned into a request show as that request)
    ...contacts
      .filter((c) => !c.quote_id)
      .filter((c) => c.status === 'open' || unreadContact(c.id) || isOn('contact', c.id))
      .map((c) => ({ type: 'contact', id: c.id, to: `/contact/${c.id}`, label: c.topic || 'Your question', unread: unreadContact(c.id) })),
  ];

  if (chats.length < 2) return null;

  return (
    <div ref={trackRef} className={`ochips cchips${edge.left ? ' cchips--l' : ''}${edge.right ? ' cchips--r' : ''}`} role="tablist" aria-label="Your chats">
      {chats.map((c) => {
        const on = isOn(c.type, c.id);
        return (
          <Link key={`${c.type}-${c.id}`} to={c.to} role="tab" aria-selected={on} className={`ochip${on ? ' ochip--on' : ''}`}>
            {c.label}
            {c.unread > 0 && !on && <i className="ochip-dot" aria-label="Unread" />}
          </Link>
        );
      })}
    </div>
  );
}
