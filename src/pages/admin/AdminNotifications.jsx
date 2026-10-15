import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Link } from 'react-router-dom';
import { ago, firstName, useAdmin } from '../../lib/portalData';
import { Avatar } from '../../components/Bits';
import Icon from '../../components/Icons';
import { shortPlanner } from './AdminHome';

const SEEN_KEY = 'ld-notifications-seen';

export function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(t) {
  try {
    localStorage.setItem(SEEN_KEY, String(t));
  } catch {
    /* private mode: badge just won't clear between visits */
  }
}

// Everything a customer did, newest first
export function buildFeed({ orders, orderAddons, messages }) {
  const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
  const who = (o) => firstName(o);
  const items = [];

  for (const o of orders) {
    items.push({ id: `o-${o.id}`, at: o.created_at, order: o, kind: 'order', text: <>New order <b>{o.shopify_order_name}</b> from {o.customer_name || o.customer_email}</>, sub: shortPlanner(o), to: `/orders/${o.id}` });
    if (o.brief_submitted_at) {
      items.push({ id: `b-${o.id}`, at: o.brief_submitted_at, order: o, kind: 'brief', text: <>{who(o)} submitted the brief for <b>{o.shopify_order_name}</b></>, sub: 'Ready to start designing', to: `/orders/${o.id}` });
    }
  }

  for (const m of messages) {
    const o = byId[m.order_id];
    if (!o || m.sender !== 'customer') continue;
    const base = { id: `m-${m.id}`, at: m.created_at, order: o, to: `/messages/${o.id}`, sub: m.body };
    if (m.kind === 'revision_request') items.push({ ...base, kind: 'changes', text: <>{who(o)} asked for changes on <b>{o.shopify_order_name}</b></> });
    else if (m.kind === 'approval') items.push({ ...base, kind: 'approved', text: <>{who(o)} approved the proof for <b>{o.shopify_order_name}</b></> });
    else items.push({ ...base, kind: 'message', text: <>{who(o)} sent a message</>, sub: m.body || 'Sent a file' });
  }

  for (const a of orderAddons) {
    const o = byId[a.order_id];
    // Add-ons bought in the same checkout as the planner are part of the new-order alert
    if (!o || Math.abs(new Date(a.created_at) - new Date(o.created_at)) < 10 * 60 * 1000) continue;
    items.push({ id: `a-${a.id}`, at: a.created_at, order: o, kind: 'addon', text: <>{who(o)} added <b>{a.name}</b> to {o.shopify_order_name}</>, to: `/orders/${o.id}` });
  }

  return items.filter((i) => i.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 80);
}

function bucket(at) {
  const d = new Date(at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return 'Today';
  if (d >= new Date(today - 86400000)) return 'Yesterday';
  if (d >= new Date(today - 6 * 86400000)) return 'This week';
  return 'Earlier';
}

const TAG = { changes: 'Changes', approved: 'Approved', addon: 'Add-on', brief: 'Brief', order: 'New order' };

export default function AdminNotifications({ seenAt, onSeen }) {
  const data = useAdmin();
  const feed = useMemo(() => buildFeed(data), [data]);

  // Mark everything seen when leaving the page, so new items stay highlighted while you look
  useEffect(() => () => onSeen(), [onSeen]);

  if (data.loading) return <p className="muted page-pad">Loading</p>;

  const groups = [];
  for (const item of feed) {
    const label = bucket(item.at);
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(item);
  }

  return (
    <main className="page page--narrow">
      <div className="page-head page-head--center">
        <h1 className="h-page">Notifications</h1>
        <Link to="/settings" className="icon-link" aria-label="Notification settings">
          <Icon name="gear" size={18} />
          <span>Settings</span>
        </Link>
      </div>

      {feed.length === 0 && <p className="muted">Nothing yet. New orders, briefs, messages, and approvals will show up here.</p>}

      {groups.map((g) => (
        <section key={g.label} className="nfeed">
          <p className="label muted">{g.label}</p>
          {g.items.map((item) => (
            <Link key={item.id} to={item.to} className={`nrow${new Date(item.at).getTime() > seenAt ? ' nrow--new' : ''}`}>
              <Avatar name={item.order.customer_name || item.order.customer_email} tone={item.kind === 'changes' ? 'avatar--ox' : ''} />
              <span className="nrow-body">
                <span className="nrow-text">{item.text}</span>
                {item.sub && <span className="nrow-sub">{item.sub}</span>}
                <span className="nrow-meta">
                  {TAG[item.kind] && <span className={`ntag${item.kind === 'changes' ? ' ntag--ox' : ''}`}>{TAG[item.kind]}</span>}
                  <span>{ago(item.at)} ago</span>
                </span>
              </span>
              {new Date(item.at).getTime() > seenAt && <span className="nav-dot" aria-label="New" />}
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}

export { writeSeen };

// "Seen up to" time, shared by all your devices through Supabase.
// Falls back to this device only if the studio_state table isn't set up.
export function useSeenAt() {
  const [seenAt, setSeenAt] = useState(() => readSeen() || Date.now());

  useEffect(() => {
    let alive = true;
    const load = () =>
      supabase
        .from('studio_state')
        .select('notifications_seen_at')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => {
          if (alive && data?.notifications_seen_at) setSeenAt(new Date(data.notifications_seen_at).getTime());
        });
    load();
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    const channel = supabase
      .channel('studio-state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'studio_state' }, (payload) => {
        const t = payload.new?.notifications_seen_at;
        if (t) setSeenAt(new Date(t).getTime());
      })
      .subscribe();
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onShow);
      supabase.removeChannel(channel);
    };
  }, []);

  const markSeen = useCallback(async () => {
    const now = Date.now();
    setSeenAt(now);
    writeSeen(now);
    const { data, error } = await supabase.rpc('mark_notifications_seen');
    if (!error && data) setSeenAt(new Date(data).getTime());
  }, []);

  return [seenAt, markSeen];
}
