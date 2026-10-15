import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';

// One "Filter" button that opens a small menu. groups: [{ key, title, options: [{key,label}], value, onChange, all }]
export default function FilterMenu({ groups }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = groups.filter((g) => g.value !== g.all);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="fmenu" ref={ref}>
      <button type="button" className={`fbtn${active.length ? ' fbtn--on' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="filter" size={16} />
        <span>Filter</span>
        {active.length > 0 && <span className="fbtn-count">{active.length}</span>}
      </button>

      {open && <div className="fscrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      {open && (
        <div className="fpanel" role="dialog" aria-label="Filter orders">
          {groups.map((g) => (
            <div key={g.key} className="fgroup">
              <p className="label muted">{g.title}</p>
              {g.options.map((o) => (
                <button key={o.key} type="button" className={`fopt${g.value === o.key ? ' fopt--on' : ''}`} onClick={() => g.onChange(o.key)}>
                  <span>{o.label}</span>
                  {o.count != null && <span className="muted small">{o.count}</span>}
                  {g.value === o.key && <Icon name="check" size={16} className="ox" />}
                </button>
              ))}
            </div>
          ))}
          <div className="fpanel-foot">
            <button type="button" className="link-btn" onClick={() => groups.forEach((g) => g.onChange(g.all))} disabled={!active.length}>
              <u>Clear</u>
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="fchips">
          {active.map((g) => (
            <button key={g.key} type="button" className="fchip" onClick={() => g.onChange(g.all)} aria-label={`Remove ${g.title} filter`}>
              {g.options.find((o) => o.key === g.value)?.label}
              <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
