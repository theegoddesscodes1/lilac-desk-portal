import { useEffect, useState } from 'react';
import { COUNTDOWN_STAGES } from '../portal-config';
import { formatDate } from '../lib/orderApi';

function remaining(dueAt) {
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return { days, hours };
}

export default function Countdown({ dueAt, stage }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!dueAt || !COUNTDOWN_STAGES.includes(stage)) return null;
  const left = remaining(dueAt);

  return (
    <section className="countdown" aria-label="Delivery countdown">
      <p className="label">Estimated delivery</p>
      {left ? (
        <p className="countdown-time">
          <span>{left.days}</span> {left.days === 1 ? 'day' : 'days'} <span>{left.hours}</span> {left.hours === 1 ? 'hour' : 'hours'}
        </p>
      ) : (
        <p className="countdown-time countdown-time--due">Final touches</p>
      )}
      <p className="muted">Due {formatDate(dueAt)}. Revision rounds add time, and the date updates as we go.</p>
    </section>
  );
}
