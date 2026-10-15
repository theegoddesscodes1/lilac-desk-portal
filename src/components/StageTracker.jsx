import { STAGES, stageIndex, stageInfo } from '../portal-config';

export default function StageTracker({ stage }) {
  if (stage === 'closed') {
    const info = stageInfo('closed');
    return (
      <section className="tracker tracker--closed" aria-label="Order progress">
        <p className="tracker-current">{info.label}</p>
        <p className="tracker-note">{info.note}</p>
      </section>
    );
  }

  const current = stageIndex(stage);
  const info = stageInfo(stage);

  return (
    <section className="tracker" aria-label="Order progress">
      <ol className="tracker-steps">
        {STAGES.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
          return (
            <li key={s.key} className={`tracker-step tracker-step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="tracker-dot" aria-hidden="true" />
              <span className="tracker-label">{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="tracker-note">{info.note}</p>
    </section>
  );
}
