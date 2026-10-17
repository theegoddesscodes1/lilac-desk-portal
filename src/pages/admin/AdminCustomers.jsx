import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { LICENSES } from '../../portal-config';
import { ago, isActive, money, shortDate, useAdmin } from '../../lib/portalData';
import { Avatar, avatarKind, StageDot } from '../../components/Bits';
import Icon from '../../components/Icons';
import { shortPlanner } from './AdminHome';
import { Stars } from '../../components/Reviews';

// One entry per customer email, built from their orders
function useCustomers() {
  const { orders, profiles, totalFor } = useAdmin();
  return useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const key = o.customer_email.toLowerCase();
      if (!map.has(key)) map.set(key, { email: key, orders: [], spent: 0, licenses: new Set() });
      const c = map.get(key);
      c.orders.push(o);
      c.spent += totalFor(o);
      c.licenses.add(o.license);
    }
    for (const c of map.values()) {
      c.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const latest = c.orders[0];
      const profile = profiles.find((p) => p.email.toLowerCase() === c.email);
      c.profile = profile;
      c.name = profile?.name || latest.customer_name || c.email;
      c.business = c.orders.find((o) => o.brief?.businessName)?.brief.businessName;
      c.first = c.orders[c.orders.length - 1].created_at;
      c.last = latest.created_at;
      c.active = c.orders.filter(isActive).length;
    }
    return [...map.values()].sort((a, b) => new Date(b.last) - new Date(a.last));
  }, [orders, profiles, totalFor]);
}

export function AdminCustomerList() {
  const { loading } = useAdmin();
  const customers = useCustomers();
  const [q, setQ] = useState('');
  if (loading) return <p className="muted page-pad">Loading</p>;
  const term = q.trim().toLowerCase();
  // Every word typed has to match: name, email, business, order numbers, or planner type
  const shown = customers.filter((c) => {
    if (!term) return true;
    const hay = [c.name, c.email, c.business, ...c.orders.flatMap((o) => [o.shopify_order_name, String(o.shopify_order_name || '').replace('#', ''), o.tier, o.license])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return term.replace(/#/g, '').split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  });

  return (
    <main className="page page--wide">
      <h1 className="sr-only">Customers</h1>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, or order #" />
        </label>
      </div>
      <p className="muted small">{customers.length} {customers.length === 1 ? 'customer' : 'customers'} · {money(customers.reduce((n, c) => n + c.spent, 0))} all time</p>
      <div className="table section-gap-sm">
        <div className="tr tr--cust th"><span>Customer</span><span className="hide-phone">Type</span><span>Orders</span><span className="hide-phone">Last order</span><span className="r">Spent</span></div>
        {shown.map((c) => (
          <Link key={c.email} to={`/customers/${encodeURIComponent(c.email)}`} className="tr tr--cust">
            <span className="cust-cell"><Avatar name={c.name} kind={avatarKind(c.orders[0])} /><span>{c.name}<small>{c.business || c.email}</small></span></span>
            <span className="hide-phone">{[...c.licenses].map((l) => LICENSES[l]).join(', ')}</span>
            <span>{c.orders.length}{c.active ? <span className="muted small"> · {c.active} active</span> : null}</span>
            <span className="hide-phone">{shortDate(c.last)}</span>
            <span className="num r">{money(c.spent)}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

function Notes({ email }) {
  const { notes, reload } = useAdmin();
  const saved = notes.find((n) => n.email.toLowerCase() === email)?.notes ?? '';
  const [text, setText] = useState(saved);
  const [state, setState] = useState('');
  useEffect(() => setText(saved), [saved]);

  async function save() {
    if (text === saved) return;
    setState('Saving');
    const { error } = await supabase.from('customer_notes').upsert({ email, notes: text, updated_at: new Date().toISOString() });
    setState(error ? 'Not saved' : 'Saved');
    reload();
  }

  return (
    <div className="notes">
      <div className="kv"><span className="label">Your notes</span><span className="muted small">{state}</span></div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} placeholder="Only you can see these. Likes, dislikes, how they like to work…" />
    </div>
  );
}

export function AdminCustomer() {
  const { email: raw } = useParams();
  const email = decodeURIComponent(raw).toLowerCase();
  const { loading, messagesByOrder, addonsByOrder, totalFor, bestOrderFor, isOnline, reviews = [] } = useAdmin();
  const customers = useCustomers();
  if (loading) return <p className="muted page-pad">Loading</p>;
  const c = customers.find((x) => x.email === email);
  if (!c) return <main className="page"><p className="muted">No orders from {email}.</p><Link to="/customers"><u>All customers</u></Link></main>;

  const latest = c.orders[0];
  const brief = c.orders.find((o) => o.brief?.app)?.brief ?? {};
  const portfolio = brief.portfolio || (brief.portfolioOptOut?.length ? 'Keep private' : 'OK to show');

  const activity = [];
  for (const o of c.orders) {
    activity.push({ at: o.created_at, text: `Ordered ${o.shopify_order_name}, ${shortPlanner(o)}` });
    if (o.brief_submitted_at) activity.push({ at: o.brief_submitted_at, text: `Submitted the brief for ${o.shopify_order_name}` });
    else if (Object.keys(o.brief || {}).length) activity.push({ at: o.last_customer_activity_at, text: `Started the brief for ${o.shopify_order_name} (draft saved)` });
    for (const a of addonsByOrder[o.id] ?? []) activity.push({ at: a.created_at, text: `Bought ${a.name}` });
    const rv = reviews.find((r) => r.order_id === o.id);
    if (rv) activity.push({ at: rv.created_at, text: `Left a ${rv.rating}-star review on ${o.shopify_order_name}` });
    for (const m of messagesByOrder[o.id] ?? []) {
      if (m.sender !== 'customer') continue;
      activity.push({ at: m.created_at, text: m.kind === 'revision_request' ? `Requested changes on ${o.shopify_order_name}` : m.kind === 'approval' ? `Approved the proof on ${o.shopify_order_name}` : `Sent a message on ${o.shopify_order_name}` });
    }
  }
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));

  const since = new Date(c.first).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <main className="page page--wide">
      <Link to="/customers" className="back-link"><Icon name="back" size={16} /> Customers</Link>

      <div className="cp-head">
        <Avatar name={c.name} tone="avatar--lg" kind={avatarKind(c.orders[0])} online={isOnline?.(c.email)} />
        <div className="cp-who">
          <h1 className="h-page">{c.name}</h1>
          <p className="muted small">{c.business ? `${c.business} · ` : ''}{c.email}</p>
          <div className="pill-row">
            <span className="ntag">{c.orders.length > 1 ? 'Returning' : 'New'}</span>
            {[...c.licenses].map((l) => <span key={l} className="ntag">{LICENSES[l]}</span>)}
          </div>
        </div>
        <div className="cp-actions">
          <Link to={`/messages/${(bestOrderFor?.(c.email) || latest).id}`} className="btn btn--sm">Message</Link>
          <a href={`mailto:${c.email}`} className="btn btn--ghost btn--sm">Email</a>
        </div>
      </div>

      <div className="cp-stats">
        <div><span className="label muted">Orders</span><b className="num">{c.orders.length}</b></div>
        <div><span className="label muted">Spent</span><b className="num">{money(c.spent)}</b></div>
        <div><span className="label muted">Since</span><b className="num">{since}</b></div>
      </div>

      <div className="cust-layout">
        <div>
          <p className="label muted cp-sec">Orders</p>
          <div className="table">
            {c.orders.map((o) => {
              const rv = reviews.find((r) => r.order_id === o.id);
              return (
              <Link key={o.id} to={`/orders/${o.id}`} className="tr tr--cord">
                <span className="num">{o.shopify_order_name}</span>
                <span>{shortPlanner(o)}{addonsByOrder[o.id]?.length ? <span className="muted"> + {addonsByOrder[o.id].map((a) => a.name.toLowerCase()).join(', ')}</span> : null}</span>
                <StageDot stage={o.stage} />
                <span className="rev-cell">{rv ? <Stars value={rv.rating} size={12} /> : null}</span>
                <span className="hide-phone">{shortDate(o.created_at)}</span>
                <span className="num r">{money(totalFor(o))}</span>
              </Link>
              );
            })}
          </div>

          <p className="label muted cp-sec">Recent activity</p>
          <ul className="log">
            {activity.slice(0, 8).map((a, i) => (
              <li key={i}><div className="log-row"><span className="log-text"><span>{a.text}</span></span><span className="log-time">{ago(a.at)}</span></div></li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label muted cp-sec">Details</p>
          <div className="cp-details">
            {brief.app && <div className="kv kv--row"><span>Uses</span><span>{brief.app}{brief.device ? `, ${brief.device}` : ''}</span></div>}
            {c.profile?.phone && <div className="kv kv--row"><span>Phone</span><a href={`tel:${c.profile.phone}`}>{c.profile.phone}</a></div>}
            {c.profile?.alt_email && <div className="kv kv--row"><span>Also emails</span><span>{c.profile.alt_email}</span></div>}
            <div className="kv kv--row"><span>Portfolio</span><span>{portfolio}</span></div>
          </div>
          <Notes email={c.email} />
        </div>
      </div>
    </main>
  );
}
