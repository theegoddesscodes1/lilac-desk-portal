import { stageInfo } from '../../portal-config';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isActive, isDone, money, shortDate, useAdmin } from '../../lib/portalData';
import { StageDot } from '../../components/Bits';
import Icon from '../../components/Icons';
import FilterMenu from '../../components/FilterMenu';
import { PRESET_TAGS, TagChips } from '../../components/OrderTags';
import { shortPlanner } from './AdminHome';

const STATUS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'active', label: 'Active', test: (o) => isActive(o) && !['order_placed', 'proof_ready'].includes(o.stage) },
  { key: 'waiting', label: 'Waiting', test: (o) => ['order_placed', 'proof_ready'].includes(o.stage) },
  { key: 'delivered', label: 'Delivered', test: isDone },
  { key: 'closed', label: 'Closed', test: (o) => o.stage === 'closed' },
];
const LICENSE = [
  { key: 'any', label: 'All' },
  { key: 'personal', label: 'Personal' },
  { key: 'commercial', label: 'Commercial' },
];

// Search by order number (with or without #), name, email, business, or planner type ("premium", "custom commercial")
function matches(o, term, tags = []) {
  const words = term.replace(/#/g, '').split(/\s+/).filter(Boolean);
  const hay = [
    o.shopify_order_name,
    String(o.shopify_order_name || '').replace('#', ''),
    o.customer_name,
    o.customer_email,
    o.brief?.businessName,
    o.tier,
    o.license,
    `${o.tier} ${o.license}`,
    stageInfo(o.stage).label,
    ...tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

export default function AdminOrders() {
  const { loading, orders, addonsByOrder, totalFor, tagsByOrder = {} } = useAdmin();
  const [tag, setTag] = useState('any');
  const [status, setStatus] = useState('all');
  const [license, setLicense] = useState('any');
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const test = STATUS.find((s) => s.key === status).test;
    const term = q.trim().toLowerCase();
    const shown = orders.filter(
      (o) =>
        test(o) &&
        (license === 'any' || o.license === license) &&
        (tag === 'any' || (tag === 'tagged' ? (tagsByOrder[o.id] || []).length > 0 : (tagsByOrder[o.id] || []).includes(tag))) &&
        (!term || matches(o, term, tagsByOrder[o.id]))
    );
    const out = [];
    for (const o of shown) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out.find((x) => x.key === key);
      if (!g) out.push((g = { key, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), rows: [] }));
      g.rows.push(o);
    }
    // Within each month: active orders first, soonest due at the top
    const rank = (o) => (isActive(o) ? 0 : 1);
    for (const g of out) {
      g.rows.sort((a, b) => rank(a) - rank(b) || new Date(a.due_at || 8e15) - new Date(b.due_at || 8e15) || new Date(b.created_at) - new Date(a.created_at));
    }
    return out;
  }, [orders, status, license, tag, tagsByOrder, q]);

  if (loading) return <p className="muted page-pad">Loading</p>;

  return (
    <main className="page page--wide">
      <h1 className="sr-only">All orders</h1>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order #, name, or planner" />
        </label>
        <FilterMenu
          groups={[
            { key: 'status', title: 'Status', all: 'all', value: status, onChange: setStatus, options: STATUS.map((s) => ({ ...s, count: orders.filter(s.test).length })) },
            { key: 'license', title: 'License', all: 'any', value: license, onChange: setLicense, options: LICENSE },
            {
              key: 'tag',
              title: 'Your tags',
              all: 'any',
              value: tag,
              onChange: setTag,
              options: [
                { key: 'any', label: 'All' },
                { key: 'tagged', label: 'Any tag', count: orders.filter((o) => (tagsByOrder[o.id] || []).length).length },
                ...[...new Set([...PRESET_TAGS, ...Object.values(tagsByOrder).flat()])].map((t) => ({ key: t, label: t, count: orders.filter((o) => (tagsByOrder[o.id] || []).includes(t)).length })).filter((t) => t.count > 0),
              ],
            },
          ]}
        />
      </div>

      {groups.length === 0 && <p className="muted">No orders match.</p>}
      {groups.map((g) => (
        <section key={g.key} className="month">
          <p className="label">
            {g.label} · <span className="ox">{g.rows.length} {g.rows.length === 1 ? 'order' : 'orders'} · {money(g.rows.reduce((n, o) => n + totalFor(o), 0))}</span>
          </p>
          <div className="table">
            <div className="tr th"><span>Order</span><span>Customer</span><span>Planner</span><span>Stage</span><span className="hide-phone">Ordered</span><span className="r">Paid</span></div>
            {g.rows.map((o) => {
              const n = addonsByOrder[o.id]?.length ?? 0;
              return (
                <Link key={o.id} to={`/orders/${o.id}`} className="tr">
                  <span className="num">{o.shopify_order_name}</span>
                  <span>{o.customer_name || o.customer_email}<TagChips tags={tagsByOrder[o.id]} /></span>
                  <span>{shortPlanner(o)}{n ? <span className="muted"> +{n}</span> : null}</span>
                  <StageDot stage={o.stage} />
                  <span className="hide-phone">{shortDate(o.created_at)}</span>
                  <span className="num r">{money(totalFor(o))}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
