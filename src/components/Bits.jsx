import { useEffect, useState } from 'react';
import { COUNTDOWN_STAGES, STAGES, STAGE_TONE, stageIndex, stageInfo } from '../portal-config';
import { daysUntil } from '../lib/portalData';

export function StageDot({ stage, children }) {
  return (
    <span className="stage-dot">
      <i className={`sd sd--${STAGE_TONE[stage] || 'grey'}`} />
      {children ?? stageInfo(stage).label}
    </span>
  );
}

const SHORT = { order_placed: 'Placed', brief_received: 'Brief', designing: 'Designing', proof_ready: 'Proof ready', revisions: 'Revisions', approved: 'Approved', delivered: 'Delivered', complete: 'Complete' };

export function ProgressDots({ stage, labels = false }) {
  if (stage === 'closed') return <p className="muted small">{stageInfo('closed').note}</p>;
  const current = stageIndex(stage);
  return (
    <div className="pdots-wrap">
      <div className="pdots" role="img" aria-label={`Step ${current + 1} of ${STAGES.length}: ${stageInfo(stage).label}`}>
        {STAGES.map((s, i) => (
          <span key={s.key} className="pdots-seg">
            {i > 0 && <b className={i <= current ? 'on' : ''} />}
            <i className={i < current ? 'done' : i === current ? 'now' : ''} />
          </span>
        ))}
      </div>
      {labels && (
        <div className="pdots-labels">
          {STAGES.map((s, i) => (
            <span key={s.key} className={i === current ? 'now' : ''}>{SHORT[s.key] ?? s.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressHead({ stage }) {
  const current = stageIndex(stage);
  if (stage === 'closed') return null;
  return (
    <div className="kv">
      <span className="label">Progress</span>
      <span className="small">
        <span className="ox">{stageInfo(stage).label}</span>
        <span className="muted"> &middot; step {current + 1} of {STAGES.length}</span>
      </span>
    </div>
  );
}

function useMinuteTick() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
}

// "Estimated delivery   Wed, Oct 21 · 6 days" with a slim progress line
export function DeliveryLine({ order, long = false }) {
  useMinuteTick();
  if (order.tier === 'custom' && !order.due_at && COUNTDOWN_STAGES.includes(order.stage)) {
    return (
      <div className="delivery">
        <div className="kv">
          <span className="label">Estimated delivery</span>
          <span className="muted small">Confirming soon</span>
        </div>
      </div>
    );
  }
  if (!order.due_at || !COUNTDOWN_STAGES.includes(order.stage)) return null;
  const due = new Date(order.due_at);
  const start = new Date(order.brief_submitted_at || order.created_at);
  const total = Math.max(1, due - start);
  const pct = Math.min(100, Math.max(0, ((Date.now() - start) / total) * 100));
  const left = daysUntil(order.due_at);
  const dateText = due.toLocaleDateString(undefined, long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
  const leftText = left > 1 ? `${left} days` : left === 1 ? '1 day' : left === 0 ? 'today' : 'final touches';

  return (
    <div className="delivery">
      <div className="kv">
        <span className="label">Estimated delivery</span>
        <span className="delivery-date">
          {dateText} <span className="muted small">&middot; {leftText}</span>
        </span>
      </div>
      <div className="delivery-line"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// Avatar colour by planner type: personal lilac, commercial oxblood, custom charcoal
export function avatarKind(order) {
  if (!order) return '';
  if (order.tier === 'custom' || order === 'custom') return 'avatar--dark';
  if (order.license === 'commercial') return 'avatar--ox';
  return '';
}

export function Avatar({ name, tone = '', kind = '', online = false }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={`avatar ${kind} ${tone}${online ? ' avatar--online' : ''}`}>
      {letter}
      {online && <i className="avatar-online" aria-label="Online now" />}
    </span>
  );
}
