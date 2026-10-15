import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ALL_STAGES, NO_RESPONSE_DAYS, WAITING_ON_CUSTOMER, plannerLabel, stageInfo } from '../portal-config';
import { daysSince, errorText } from '../lib/orderApi';

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'waiting', label: 'Waiting on customer' },
  { key: 'done', label: 'Delivered and complete' },
  { key: 'all', label: 'All' },
];

function matches(order, filter) {
  if (filter === 'active') return !['delivered', 'complete', 'closed'].includes(order.stage);
  if (filter === 'waiting') return WAITING_ON_CUSTOMER.includes(order.stage);
  if (filter === 'done') return ['delivered', 'complete'].includes(order.stage);
  return true;
}

function dueText(order) {
  if (!order.due_at || ['delivered', 'complete', 'closed'].includes(order.stage)) return '';
  const days = Math.ceil((new Date(order.due_at).getTime() - Date.now()) / 86400000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('active');
  const [error, setError] = useState('');

  async function load() {
    const { data, error: loadError } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (loadError) setError(errorText(loadError));
    setOrders(data ?? []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const shown = useMemo(() => (orders ?? []).filter((o) => matches(o, filter)), [orders, filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const s of ALL_STAGES) c[s.key] = 0;
    for (const o of orders ?? []) c[o.stage] = (c[o.stage] ?? 0) + 1;
    return c;
  }, [orders]);

  if (!orders) return <p className="muted page-pad">Loading orders</p>;

  return (
    <main className="page page--wide">
      <h1 className="h-page">Orders</h1>
      {error && <p className="error">{error}</p>}

      <div className="stat-row">
        {ALL_STAGES.filter((s) => counts[s.key] > 0).map((s) => (
          <p key={s.key} className="stat">
            <span>{counts[s.key]}</span>
            {s.label}
          </p>
        ))}
      </div>

      <div className="filters" role="tablist" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`filter${filter === f.key ? ' filter--on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="muted">No orders here.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Planner</th>
                <th>Stage</th>
                <th>Due</th>
                <th>Last heard from</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const quiet = daysSince(o.last_customer_activity_at);
                const flag = WAITING_ON_CUSTOMER.includes(o.stage) && quiet >= NO_RESPONSE_DAYS;
                return (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`}>{o.shopify_order_name}</Link></td>
                    <td>
                      {o.customer_name || o.customer_email}
                      {o.customer_name && <span className="muted small block">{o.customer_email}</span>}
                    </td>
                    <td>{plannerLabel(o)}</td>
                    <td>{stageInfo(o.stage).label}</td>
                    <td>{dueText(o)}</td>
                    <td className={flag ? 'flag' : ''}>
                      {quiet === 0 ? 'Today' : quiet === 1 ? 'Yesterday' : `${quiet} days ago`}
                      {flag && <span className="block small">Can be closed</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Orders are created automatically when a custom planner is paid for in Shopify.</p>
    </main>
  );
}
