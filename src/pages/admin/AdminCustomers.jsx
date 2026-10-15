import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { LICENSES } from '../../portal-config';
import { ago, isActive, money, shortDate, useAdmin } from '../../lib/portalData';
import { Avatar, StageDot } from '../../components/Bits';
import Icon from '../../components/Icons';
import { shortPlanner } from './AdminHome';

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
  const shown = customers.filter((c) => !term || [c.name, c.email, c.business].some((v) => v && v.toLowerCase().includes(term)));

  return (
    <main className="page page--wide">
      <div className="page-head">
        <h1 className="h-page">Customers</h1>
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, or business" />
        </label>
      </div>
      <p className="muted small">{customers.length} {customers.length === 1 ? 'customer' : 'customers'} · {money(customers.reduce((n, c) => n + c.spent, 0))} all time</p>
      <div className="table section-gap-sm">
        <div className="tr tr--cust th"><span>Customer</span><span className="hide-phone">Type</span><span>Orders</span><span className="hide-phone">Last order</span><span className="r">Spent</span></div>
        {shown.map((c) => (
          <Link key={c.email} to={`/customers/${encodeURIComponent(c.email)}`} className="tr tr--cust">
            <span className="cust-cell"><Avatar name={c.name} /><span>{c.name}<small>{c.business || c.email}</small></span></span>
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
  const { loading, messagesByOrder, addonsByOrder, totalFor } = useAdmin();
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
    for (const a of addonsByOrder[o.id] ?? []) activity.push({ at: a.created_at, text: `Bought ${a.name}` });
    for (const m of messagesByOrder[o.id] ?? []) {
      if (m.sender !== 'customer') continue;
      activity.push({ at: m.created_at, text: m.kind === 'revision_request' ? `Requested changes on ${o.shopify_order_name}` : m.kind === 'approval' ? `Approved the proof on ${o.shopify_order_name}` : `Sent a message on ${o.shopify_order_name}` });
    }
  }
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <main className="page page--wide">
      <Link to="/customers" className="back-link"><Icon name="back" size={16} /> Customers</Link>
      <div className="cust-layout">
        <div className="cust-profile">
          <Avatar name={c.name} tone="avatar--lg" />
          <h1 className="h-page">{c.name}</h1>
          <p className="muted small">{c.email}</p>
          <div className="pill-row">
            <span className="pill pill--lilac">{c.orders.length > 1 ? 'Returning' : 'New'}</span>
            {[...c.licenses].map((l) => <span key={l} className="pill pill--grey">{LICENSES[l]}</span>)}
          </div>
          <div className="facts">
            {c.business && <div className="kv kv--row"><span>Business</span><span>{c.business}</span></div>}
            <div className="kv kv--row"><span>Customer since</span><span>{new Date(c.first).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div>
            <div className="kv kv--row"><span>Orders</span><span>{c.orders.length}</span></div>
            <div className="kv kv--row"><span>Total spent</span><span className="num">{money(c.spent)}</span></div>
            {brief.app && <div className="kv kv--row"><span>Uses</span><span>{brief.app}{brief.device ? `, ${brief.device}` : ''}</span></div>}
            {c.profile?.phone && <div className="kv kv--row"><span>Phone</span><span>{c.profile.phone}</span></div>}
            {c.profile?.alt_email && <div className="kv kv--row"><span>Also emails</span><span>{c.profile.alt_email}</span></div>}
            <div className="kv kv--row"><span>Portfolio</span><span>{portfolio}</span></div>
          </div>
          <Notes email={c.email} />
          <div className="btn-pair">
            <Link to={`/messages/${latest.id}`} className="btn">Message</Link>
            <a href={`mailto:${c.email}`} className="btn btn--ghost">Email</a>
          </div>
        </div>
        <div>
          <h2 className="h-section">Orders</h2>
          <div className="table">
            {c.orders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="tr tr--cord">
                <span className="num">{o.shopify_order_name}</span>
                <span>{shortPlanner(o)}{addonsByOrder[o.id]?.length ? <span className="muted"> + {addonsByOrder[o.id].map((a) => a.name.toLowerCase()).join(', ')}</span> : null}</span>
                <StageDot stage={o.stage} />
                <span className="hide-phone">{shortDate(o.created_at)}</span>
                <span className="num r">{money(totalFor(o))}</span>
              </Link>
            ))}
          </div>
          <h2 className="h-section section-gap">Recent activity</h2>
          {activity.slice(0, 8).map((a, i) => (
            <div key={i} className="kv kv--row"><span>{a.text}</span><span className="muted small">{ago(a.at)}</span></div>
          ))}
        </div>
      </div>
    </main>
  );
}
