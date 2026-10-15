import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { plannerLabel, stageInfo } from '../portal-config';
import { errorText, formatDate } from '../lib/orderApi';

export default function OrdersListPage({ email }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(errorText(loadError));
        setOrders(data ?? []);
      });
  }, []);

  if (!orders) return <p className="muted page-pad">Loading your orders</p>;

  return (
    <main className="page">
      <h1 className="h-page">Your orders</h1>
      {error && <p className="error">{error}</p>}
      {orders.length === 0 ? (
        <div className="panel">
          <p>No custom planner orders are linked to {email}.</p>
          <p className="muted">
            Orders appear here a minute or two after checkout. If you ordered with a different email address, sign out and use that one.
          </p>
        </div>
      ) : (
        <ul className="order-cards">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="order-card">
                <span className="order-card-name">{o.shopify_order_name}</span>
                <span className="order-card-planner">{plannerLabel(o)}</span>
                <span className="order-card-stage">{stageInfo(o.stage).label}</span>
                <span className="muted small">Ordered {formatDate(o.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
