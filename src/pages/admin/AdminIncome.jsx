import Icon from '../../components/Icons';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isActive, isDone, money, shortDate, useAdmin } from '../../lib/portalData';
import { shortPlanner } from './AdminHome';

const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function csv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Order', 'Customer', 'Email', 'Planner', 'Status', 'Ordered', 'Delivered', 'Planner price', 'Add-ons', 'Refunded', 'Total'];
  const lines = rows.map((r) => [r.o.shopify_order_name, r.o.customer_name, r.o.customer_email, shortPlanner(r.o), r.status, r.o.created_at?.slice(0, 10), r.o.delivered_at?.slice(0, 10) ?? '', r.planner, r.addons, r.o.refunded_amount ?? 0, r.total].map(esc).join(','));
  return [header.map(esc).join(','), ...lines].join('\n');
}

export default function AdminIncome() {
  const { loading, orders, orderAddons, addonsByOrder, totalFor } = useAdmin();
  const [period, setPeriod] = useState('month');

  const data = useMemo(() => {
    const now = new Date();
    const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(0);
    const inPeriod = (v) => v && new Date(v) >= start;
    const earnedOrders = orders.filter((o) => isDone(o) && inPeriod(o.delivered_at));
    const earned = earnedOrders.reduce((n, o) => n + totalFor(o), 0);
    const active = orders.filter(isActive);
    const inProgress = active.reduce((n, o) => n + totalFor(o), 0);
    const refunded = orders.filter((o) => inPeriod(o.refunded_at)).reduce((n, o) => n + Number(o.refunded_amount ?? 0), 0);
    const placed = orders.filter((o) => inPeriod(o.created_at));
    const avg = placed.length ? placed.reduce((n, o) => n + totalFor(o), 0) / placed.length : 0;
    const withAddons = placed.filter((o) => addonsByOrder[o.id]?.length).length;

    // Chart: months of this year, or years for all time
    let bars;
    if (period === 'all') {
      const years = [...new Set(orders.map((o) => new Date(o.delivered_at || o.created_at).getFullYear()))].sort();
      if (!years.length) years.push(now.getFullYear());
      bars = years.map((y) => ({ label: String(y), on: y === now.getFullYear(), value: orders.filter((o) => isDone(o) && o.delivered_at && new Date(o.delivered_at).getFullYear() === y).reduce((n, o) => n + totalFor(o), 0) }));
    } else {
      bars = MONTHS.map((m, i) => ({
        label: m,
        on: i === now.getMonth(),
        value: orders.filter((o) => isDone(o) && o.delivered_at && new Date(o.delivered_at).getFullYear() === now.getFullYear() && new Date(o.delivered_at).getMonth() === i).reduce((n, o) => n + totalFor(o), 0),
      }));
    }
    const max = Math.max(1, ...bars.map((b) => b.value));

    const rows = orders
      .filter((o) => inPeriod(o.created_at) || (isDone(o) && inPeriod(o.delivered_at)))
      .map((o) => {
        const addons = (addonsByOrder[o.id] ?? []).reduce((n, a) => n + Number(a.price ?? 0), 0);
        const status = isDone(o) ? `Earned ${shortDate(o.delivered_at)}` : o.stage === 'closed' ? (Number(o.refunded_amount) > 0 ? 'Cancelled' : 'Closed') : 'In progress';
        return { o, status, planner: Number(o.planner_price ?? 0), addons, total: totalFor(o) };
      });

    const byLicense = ['commercial', 'personal'].map((l) => {
      const value = placed.filter((o) => o.license === l).reduce((n, o) => n + totalFor(o), 0);
      return { label: l === 'commercial' ? 'Commercial planners' : 'Personal planners', value };
    });
    const licTotal = byLicense.reduce((n, b) => n + b.value, 0) || 1;

    const addonTotals = {};
    for (const a of orderAddons) {
      if (!inPeriod(a.created_at)) continue;
      const k = a.name;
      addonTotals[k] = addonTotals[k] || { name: k, qty: 0, value: 0 };
      addonTotals[k].qty += a.quantity ?? 1;
      addonTotals[k].value += Number(a.price ?? 0);
    }
    const topAddons = Object.values(addonTotals).sort((a, b) => b.value - a.value).slice(0, 5);

    const label = period === 'month' ? now.toLocaleDateString(undefined, { month: 'long' }) : period === 'year' ? String(now.getFullYear()) : 'all time';
    return { earned, inProgress, activeCount: active.length, refunded, avg, placedCount: placed.length, withAddons, bars, max, rows, byLicense, licTotal, topAddons, label };
  }, [orders, orderAddons, addonsByOrder, totalFor, period]);

  if (loading) return <p className="muted page-pad">Loading</p>;

  function exportCsv() {
    const blob = new Blob([csv(data.rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lilac-desk-income-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="page page--wide">
      <h1 className="sr-only">Income</h1>
      <div className="toolbar toolbar--split">
        <div className="seg">{PERIODS.map((p) => <button key={p.key} type="button" className={period === p.key ? 'on' : ''} onClick={() => setPeriod(p.key)}>{p.label}</button>)}</div>
        <button type="button" className="quiet-link hide-phone" onClick={exportCsv}><Icon name="download" size={14} /> <span>Export CSV</span></button>
      </div>

      <div className="kpis">
        <div><span className="label">Earned, {data.label}</span><b>{money(data.earned)}</b><small>Delivered orders</small></div>
        <div><span className="label">In progress</span><b>{money(data.inProgress)}</b><small>Paid, not yet delivered</small></div>
        <div><span className="label">Refunded</span><b>{money(data.refunded)}</b><small>Cancellations</small></div>
        <div><span className="label">Average order</span><b>{money(data.avg)}</b><small>Add-ons on {data.withAddons} of {data.placedCount}</small></div>
      </div>

      <div className="income-grid">
        <div>
          <div className="kv"><h2 className="h-section">{data.bars.length === 12 ? `${new Date().getFullYear()} by month` : 'By year'}</h2><span className="muted small">Earned, by delivery date</span></div>
          <div className="bars" style={{ gridTemplateColumns: `repeat(${data.bars.length}, 1fr)` }}>
            {data.bars.map((b) => (
              <div key={b.label} className="bar-col">
                {b.value > 0 && <span className="bar-val">{money(b.value)}</span>}
                <i className={b.on ? 'on' : ''} style={{ height: `${(b.value / data.max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="bar-labels" style={{ gridTemplateColumns: `repeat(${data.bars.length}, 1fr)` }}>
            {data.bars.map((b) => <span key={b.label} className={b.on ? 'ox' : ''}>{b.label}</span>)}
          </div>

          <h2 className="h-section section-gap">Orders, {data.label}</h2>
          {data.rows.length === 0 && <p className="muted small">No orders in this period.</p>}
          {data.rows.length > 0 && (
            <div className="table">
              <div className="tr tr--income th"><span>Order</span><span>Customer</span><span>Status</span><span className="r hide-phone">Planner</span><span className="r hide-phone">Add-ons</span><span className="r">Total</span></div>
              {data.rows.map((r) => (
                <Link key={r.o.id} to={`/orders/${r.o.id}`} className="tr tr--income">
                  <span className="num">{r.o.shopify_order_name}</span>
                  <span>{r.o.customer_name || r.o.customer_email}</span>
                  <span><span className={`pill pill--xs ${r.status.startsWith('Earned') ? 'pill--lilac' : ''}`}>{r.status}</span></span>
                  <span className="num r hide-phone">{money(r.planner)}</span>
                  <span className="num r hide-phone">{r.addons ? money(r.addons) : '—'}</span>
                  <span className="num r">{money(r.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="h-section">Where it comes from</h2>
          {data.byLicense.map((b) => (
            <div key={b.label} className="kv kv--row"><span>{b.label}</span><span className="num">{money(b.value)} · {Math.round((b.value / data.licTotal) * 100)}%</span></div>
          ))}
          <p className="label section-gap-sm">Top add-ons</p>
          {data.topAddons.length === 0 && <p className="muted small">None yet.</p>}
          {data.topAddons.map((a) => (
            <div key={a.name} className="kv kv--row"><span>{a.name}{a.qty > 1 ? ` (${a.qty})` : ''}</span><span className="num">{money(a.value)}</span></div>
          ))}
          <p className="muted small section-gap-sm">Amounts are what customers paid for custom planners, before Shopify’s fees. Ready-made products stay in Shopify Analytics.</p>
        </div>
      </div>
    </main>
  );
}
