import { plannerLabel } from '../portal-config';
import { shortDate } from '../lib/portalData';
import Icon from './Icons';

// Add-ons that take effect the moment they're bought
const APPLIED = {
  rush: 'Due date moved up',
  extra_revision: 'Added to your rounds',
};
const DELIVERED = ['delivered', 'complete'];

export function addonState(addon, order) {
  if (APPLIED[addon.addon_key]) return { done: true, text: APPLIED[addon.addon_key] };
  if (addon.done_at) return { done: true, text: `Done ${shortDate(addon.done_at)}` };
  if (DELIVERED.includes(order.stage)) return { done: true, text: 'Delivered' };
  return { done: false, text: order.stage === 'order_placed' ? 'Starts after your brief' : 'In progress' };
}

function plannerState(order) {
  if (DELIVERED.includes(order.stage)) return { done: true, text: `Delivered ${shortDate(order.delivered_at)}` };
  const map = {
    order_placed: 'Waiting on the brief',
    brief_received: 'Brief in, design starts next',
    designing: 'In design',
    proof_ready: 'Proof out for review',
    revisions: 'Changes in progress',
    approved: 'Approved, final files next',
    closed: 'Closed',
  };
  return { done: false, text: map[order.stage] || 'In progress' };
}

// Planner + every extra, each with where it stands. Admin can tap an extra to mark it done.
export default function OrderChecklist({ order, orderAddons, onToggle, title = 'Your order' }) {
  const rows = [
    { id: 'planner', name: plannerLabel(order), ...plannerState(order) },
    ...orderAddons.map((a) => ({ id: a.id, name: `${a.name}${a.quantity > 1 ? ` (x${a.quantity})` : ''}`, addon: a, ...addonState(a, order) })),
  ];
  const doneCount = rows.filter((r) => r.done).length;

  return (
    <div className="ocl">
      <div className="ocl-head">
        <p className="label muted">{title}</p>
        <span className="ocl-count">{doneCount} of {rows.length} done</span>
      </div>
      <ul>
        {rows.map((r) => {
          const toggleable = onToggle && r.addon && !APPLIED[r.addon.addon_key] && !DELIVERED.includes(order.stage);
          const inner = (
            <>
              <span className={`ocl-mark${r.done ? ' ocl-mark--done' : ''}`}>{r.done && <Icon name="check" size={11} />}</span>
              <span className="ocl-name">{r.name}</span>
              <span className="ocl-state">{r.text}</span>
            </>
          );
          return (
            <li key={r.id}>
              {toggleable ? (
                <button type="button" className="ocl-row" onClick={() => onToggle(r.addon)} title={r.done ? 'Mark not done' : 'Mark done'}>{inner}</button>
              ) : (
                <div className="ocl-row">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {onToggle && <p className="ocl-hint">Tap an extra to mark it done. The customer sees it right away.</p>}
    </div>
  );
}
