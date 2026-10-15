import { Link } from 'react-router-dom';
import { TIERS, LICENSES } from '../../portal-config';
import { daysUntil, firstName, isActive, isDone, money, useAdmin } from '../../lib/portalData';
import { StageDot } from '../../components/Bits';

const NEEDS_YOU = ['revisions', 'approved', 'brief_received', 'designing'];
const PRIORITY = { revisions: 0, approved: 1, brief_received: 2, designing: 3 };

export const shortPlanner = (o) => `${TIERS[o.tier]?.label ?? o.tier} ${LICENSES[o.license]?.toLowerCase() ?? ''}`;

export function dueText(o) {
  const d = daysUntil(o.due_at);
  if (d == null) return '';
  if (d < 0) return `${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'} overdue`;
  if (d === 0) return 'due today';
  return `due in ${d} ${d === 1 ? 'day' : 'days'}`;
}

function sameMonth(value, ref) {
  if (!value) return false;
  const d = new Date(value);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function upNext(order, messagesByOrder) {
  if (!order) return { title: 'You’re all caught up.', text: 'Nothing needs you right now. New orders and messages will show up here.' };
  const name = firstName(order);
  const num = order.shopify_order_name;
  if (order.stage === 'revisions') {
    const req = [...(messagesByOrder[order.id] ?? [])].reverse().find((m) => m.kind === 'revision_request');
    return {
      title: `${name} asked for changes on ${num}.`,
      quote: req?.body,
      text: `${shortPlanner(order)}, round ${order.revisions_used} of ${order.revisions_included}, ${dueText(order)}.`,
    };
  }
  if (order.stage === 'approved') return { title: `${name} approved the proof on ${num}.`, text: 'Final files are next.' };
  if (order.stage === 'brief_received') return { title: `${name}’s brief is in for ${num}.`, text: `Time to start designing. ${dueText(order).replace(/^./, (c) => c.toUpperCase())}.` };
  return { title: `${num} for ${name} is ${dueText(order)}.`, text: `${shortPlanner(order)} planner, currently designing.` };
}

function Line({ o, total, note, showDue }) {
  return (
    <Link to={`/orders/${o.id}`} className={`line${showDue ? '' : ' line--nodue'}`}>
      <span className="num">{o.shopify_order_name}</span>
      <span className="line-who">{o.customer_name || o.customer_email}<small>{note}</small></span>
      <StageDot stage={o.stage} />
      {showDue && <span className={`small${daysUntil(o.due_at) <= 2 ? ' ox' : ''}`}>{dueText(o).replace('due in ', '')}</span>}
      <span className="num r">{money(total)}</span>
    </Link>
  );
}

export default function AdminHome() {
  const { loading, orders, messagesByOrder, addonsByOrder, totalFor } = useAdmin();
  if (loading) return <p className="muted page-pad">Loading</p>;

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const active = orders.filter(isActive);
  const needs = active
    .filter((o) => NEEDS_YOU.includes(o.stage))
    .sort((a, b) => PRIORITY[a.stage] - PRIORITY[b.stage] || new Date(a.due_at || 8e15) - new Date(b.due_at || 8e15));
  const waiting = active.filter((o) => !NEEDS_YOU.includes(o.stage));
  const recent = orders
    .filter((o) => isDone(o) && o.delivered_at && Date.now() - new Date(o.delivered_at) < 30 * 86400000)
    .sort((a, b) => new Date(b.delivered_at) - new Date(a.delivered_at))
    .slice(0, 3);

  const inProgress = active.reduce((n, o) => n + totalFor(o), 0);
  const earned = orders.filter((o) => isDone(o) && sameMonth(o.delivered_at, now)).reduce((n, o) => n + totalFor(o), 0);
  const earnedLast = orders.filter((o) => isDone(o) && sameMonth(o.delivered_at, lastMonth)).reduce((n, o) => n + totalFor(o), 0);
  const change = earnedLast > 0 ? Math.round(((earned - earnedLast) / earnedLast) * 100) : null;
  const dueWeek = active.filter((o) => o.due_at && daysUntil(o.due_at) <= 7).length;

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const next = upNext(needs[0], messagesByOrder);
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });

  return (
    <main className="page page--wide">
      <div className="ahead">
        <div>
          <p className="label muted">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="h-page">{greeting}, Kerry</h1>
        </div>
        <div className="figs">
          <div><span className="label muted">In progress</span><b>{money(inProgress)}</b><small>{active.length} {active.length === 1 ? 'order' : 'orders'}</small></div>
          <div><span className="label muted">Earned in {monthName}</span><b>{money(earned)}</b><small className={change != null ? 'ox' : ''}>{change != null ? `${change >= 0 ? '+' : ''}${change}% on ${lastMonth.toLocaleDateString(undefined, { month: 'long' })}` : 'Delivered this month'}</small></div>
        </div>
      </div>

      <div className="glance">
        <span className={needs.length ? 'hot' : ''}><b>{needs.length}</b> need you</span>
        <span><b>{active.filter((o) => o.stage === 'order_placed').length}</b> waiting on a brief</span>
        <span><b>{active.filter((o) => o.stage === 'proof_ready').length}</b> proof out</span>
        <span><b>{dueWeek}</b> due this week</span>
      </div>

      <div className="ahome-grid">
        <div>
          <p className="label ox">Up next</p>
          <h2 className="h-display h-display--sm">{next.title}</h2>
          {next.quote && <p className="lead">“{next.quote}”</p>}
          <p className="lead">{next.text}</p>
          {needs[0] && (
            <div className="btn-row">
              <Link to={`/orders/${needs[0].id}`} className="btn btn--ox btn--lg">Open order</Link>
              <Link to={`/messages/${needs[0].id}`} className="btn btn--ghost btn--lg">Reply</Link>
            </div>
          )}

          <p className="label muted section-gap">Needs you · {needs.length}</p>
          {needs.length === 0 && <p className="muted small">Nothing right now.</p>}
          {needs.map((o) => (
            <Line key={o.id} o={o} total={totalFor(o)} showDue note={`${shortPlanner(o)}${addonsByOrder[o.id]?.length ? ` + ${addonsByOrder[o.id].length} add-on${addonsByOrder[o.id].length > 1 ? 's' : ''}` : ''}`} />
          ))}
        </div>
        <div>
          <p className="label muted">Waiting on the customer · {waiting.length}</p>
          {waiting.length === 0 && <p className="muted small">No one.</p>}
          {waiting.map((o) => (
            <Line key={o.id} o={o} total={totalFor(o)} note={o.stage === 'order_placed' ? 'No brief yet' : 'Proof sent, waiting for review'} />
          ))}
          <p className="label muted section-gap">Recently completed</p>
          {recent.length === 0 && <p className="muted small">Nothing delivered in the last 30 days.</p>}
          {recent.map((o) => {
            const left = 14 - Math.floor((Date.now() - new Date(o.delivered_at)) / 86400000);
            return <Line key={o.id} o={o} total={totalFor(o)} note={`Delivered ${new Date(o.delivered_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${left > 0 ? `, fix window ${left} days` : ''}`} />;
          })}
          <p className="small section-gap-sm"><Link to="/orders"><u>All orders</u></Link></p>
        </div>
      </div>
    </main>
  );
}
