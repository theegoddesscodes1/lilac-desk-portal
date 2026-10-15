import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { LEGACY_LABELS, plannerLabel, visibleSections } from '../portal-config';
import { errorText, notify, uploadOrderFile } from '../lib/orderApi';
import { FileChip, ImageGrid, isImage } from './FilePreview';
import Icon from './Icons';

const filled = (v) => (Array.isArray(v) ? v.length > 0 : v === true || (typeof v === 'string' && v.trim() !== ''));
const optionValue = (o) => (typeof o === 'string' ? o : o.value);

function sectionDone(section, values) {
  const required = section.fields.filter((f) => f.required);
  if (required.length) return required.every((f) => filled(values[f.name]));
  return section.fields.some((f) => filled(values[f.name]));
}

// Next 18 months, for the start month picker
function monthOptions() {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 18; i += 1) {
    out.push(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function savedText(at) {
  if (!at) return '';
  const mins = Math.floor((Date.now() - at) / 60000);
  return mins < 1 ? 'Draft saved just now' : `Draft saved ${mins} min ago`;
}

// ---------- read-only view (admin, and the customer after submitting) ----------

function showValue(v) {
  if (Array.isArray(v)) return v.join(', ');
  if (v === true) return 'Yes';
  return v;
}

function BriefSummary({ sections, values }) {
  const shown = new Set(sections.flatMap((s) => s.fields.map((f) => f.name)));
  const leftovers = Object.entries(values).filter(
    ([k, v]) => !shown.has(k) && filled(v) && !(Array.isArray(v) && typeof v[0] === 'object')
  );

  return (
    <div className="brief-summary">
      {sections.map((section) => {
        const rows = section.fields.filter((f) => filled(values[f.name]));
        if (!rows.length) return null;
        return (
          <div key={section.key} className="brief-summary-section">
            <h3 className="h-sub">{section.title}</h3>
            <dl>
              {rows.map((field) => {
                const value = values[field.name];
                if (field.type === 'images' || field.type === 'files') {
                  const images = value.filter(isImage);
                  const others = value.filter((f) => !isImage(f));
                  return (
                    <div key={field.name} className="brief-row brief-row--files">
                      {!field.hideLabel && <dt>{field.label}</dt>}
                      <dd>
                        {images.length > 0 && <ImageGrid files={images} />}
                        {others.map((f) => <FileChip key={f.id} file={f} />)}
                      </dd>
                    </div>
                  );
                }
                return (
                  <div key={field.name} className="brief-row">
                    <dt>{field.label}</dt>
                    <dd>{showValue(value)}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}
      {leftovers.length > 0 && (
        <div className="brief-summary-section">
          <h3 className="h-sub">Earlier questions</h3>
          <dl>
            {leftovers.map(([k, v]) => (
              <div key={k} className="brief-row">
                <dt>{LEGACY_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
                <dd>{showValue(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// ---------- one question ----------

function Field({ field, value, set, toggle, busy, onFiles, onRemoveFile }) {
  const id = `brief-${field.name}`;
  const head = !field.hideLabel && (
    <p className="ql" id={`${id}-label`}>
      {field.label}
      {field.tag && <span className="badge-line">{field.tag}</span>}
      {field.extra && !field.tag && <span className="badge-line">Add-on</span>}
      {field.optional && <span className="ql-hint">optional</span>}
      {field.hint && <span className="ql-hint">{field.hint}</span>}
    </p>
  );
  const help = field.help && <p className="ql-help">{field.help}</p>;

  if (field.type === 'check') {
    return (
      <div className="q">
        <label className="qcheck">
          <input type="checkbox" checked={value === true} onChange={(e) => set(field.name, e.target.checked)} />
          <span className="qcheck-box"><Icon name="check" size={13} /></span>
          <span>{field.label}{field.help && <small>{field.help}</small>}</span>
        </label>
      </div>
    );
  }

  return (
    <div className={`q${field.half ? ' q--half' : ''}`}>
      {head}
      {help}

      {field.type === 'text' && (
        <input id={id} className="qline" type="text" value={value || ''} placeholder={field.placeholder || ''} aria-labelledby={`${id}-label`} onChange={(e) => set(field.name, e.target.value)} />
      )}

      {field.type === 'textarea' && (
        <textarea id={id} className={`qarea${field.big ? ' qarea--big' : ''}`} value={value || ''} placeholder={field.placeholder || ''} aria-labelledby={`${id}-label`} onChange={(e) => set(field.name, e.target.value)} />
      )}

      {field.type === 'pills' && (
        <div className="pills" role={field.multi ? 'group' : 'radiogroup'} aria-labelledby={`${id}-label`}>
          {field.options.map((o) => {
            const on = field.multi ? (Array.isArray(value) ? value : []).includes(o) : value === o;
            return (
              <button
                key={o}
                type="button"
                role={field.multi ? 'checkbox' : 'radio'}
                aria-checked={on}
                className={`pill-opt${on ? ' pill-opt--on' : ''}`}
                onClick={() => (field.multi ? toggle(field.name, o) : set(field.name, on ? '' : o))}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}

      {field.type === 'cards' && (
        <div className="qcards" role="radiogroup" aria-labelledby={`${id}-label`}>
          {field.options.map((o) => {
            const on = value === optionValue(o);
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} className={`qcard${on ? ' qcard--on' : ''}`} onClick={() => set(field.name, o.value)}>
                {o.tag && <span className="qcard-tag">{o.tag}</span>}
                <b>{o.value}</b>
                <span>{o.detail}</span>
                <i className="qcard-ring" />
              </button>
            );
          })}
        </div>
      )}

      {field.type === 'month' && (
        <select id={id} className="qselect" value={value || ''} aria-labelledby={`${id}-label`} onChange={(e) => set(field.name, e.target.value)}>
          <option value="">Choose a month</option>
          {[...new Set([...(value ? [value] : []), ...monthOptions()])].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}

      {(field.type === 'images' || field.type === 'files') && (
        <div className="qfiles">
          {field.type === 'images' ? (
            <div className="inspo">
              {(value || []).length > 0 && <ImageGrid files={value} onRemove={(fid) => onRemoveFile(field.name, fid)} />}
              {(value || []).length < (field.max || 99) && (
                <label className={`inspo-add${busy === field.name ? ' is-busy' : ''}`}>
                  <b>+</b>
                  <span>{busy === field.name ? 'Uploading' : 'Add images'}</span>
                  <input type="file" accept="image/*" multiple disabled={Boolean(busy)} onChange={(e) => { if (e.target.files?.length) onFiles(field, e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
          ) : (
            <div className="qfile-list">
              {(value || []).map((f) => (
                <span key={f.id} className="qfile">
                  <FileChip file={f} />
                  <button type="button" className="link-btn" onClick={() => onRemoveFile(field.name, f.id)}>Remove</button>
                </span>
              ))}
              <label className="btn btn--ghost btn--sm file-pick">
                {busy === field.name ? 'Uploading' : 'Add files'}
                <input type="file" multiple disabled={Boolean(busy)} onChange={(e) => { if (e.target.files?.length) onFiles(field, e.target.files); e.target.value = ''; }} />
              </label>
            </div>
          )}
          {field.max && <p className="ql-count">{(value || []).length} of {field.max}</p>}
        </div>
      )}
    </div>
  );
}

// ---------- the form ----------

export default function BriefForm({ order, orderAddons = [], readOnly = false, onSubmitted }) {
  const [values, setValues] = useState(order.brief || {});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const [, tick] = useState(0);
  const dirty = useRef(false);
  const addons = useMemo(() => orderAddons.map((a) => a.addon_key), [orderAddons]);

  const sections = useMemo(
    () => visibleSections({ tier: order.tier, license: order.license, values, addons }),
    [order.tier, order.license, values, addons]
  );

  // Autosave a draft a moment after each change
  useEffect(() => {
    if (readOnly || !dirty.current) return undefined;
    const t = setTimeout(async () => {
      const { error: e } = await supabase.rpc('save_brief', { p_order: order.id, p_brief: values });
      if (!e) setSavedAt(Date.now());
    }, 1200);
    return () => clearTimeout(t);
  }, [values, order.id, readOnly]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (readOnly) return <BriefSummary sections={sections} values={order.brief || {}} />;

  const update = (fn) => {
    dirty.current = true;
    setValues(fn);
  };
  const set = (name, value) => update((v) => ({ ...v, [name]: value }));
  const toggle = (name, option) =>
    update((v) => {
      const cur = Array.isArray(v[name]) ? v[name] : [];
      return { ...v, [name]: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option] };
    });

  async function onFiles(field, fileList) {
    setBusy(field.name);
    setError('');
    try {
      const room = (field.max || 99) - (values[field.name] || []).length;
      const picked = Array.from(fileList).slice(0, room);
      if (fileList.length > room) setError(`Only ${field.max} images fit. The first ${room} were added.`);
      const uploaded = [];
      for (const file of picked) {
        const row = await uploadOrderFile(order.id, 'brief', file, 'customer');
        uploaded.push({ id: row.id, name: row.name, path: row.path });
      }
      update((v) => ({ ...v, [field.name]: [...(v[field.name] || []), ...uploaded] }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  }

  const removeFile = (name, id) => update((v) => ({ ...v, [name]: (v[name] || []).filter((f) => f.id !== id) }));

  const doneCount = sections.filter((s) => sectionDone(s, values)).length;
  const currentKey = sections.find((s) => !sectionDone(s, values) && !s.optional)?.key;

  async function saveDraft() {
    setBusy('save');
    setError('');
    const { error: e } = await supabase.rpc('save_brief', { p_order: order.id, p_brief: values });
    setBusy('');
    if (e) setError(errorText(e));
    else setSavedAt(Date.now());
  }

  async function submit(event) {
    event.preventDefault();
    const missing = sections.flatMap((s) => s.fields.filter((f) => f.required && !filled(values[f.name])).map((f) => ({ s, f })));
    if (missing.length) {
      setError(`Still needed: ${missing.map((m) => m.f.label).join(', ')}.`);
      document.getElementById(`sec-${missing[0].s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!window.confirm('Submit your brief? Your delivery countdown starts now. You can still send me details by message.')) return;
    setBusy('submit');
    setError('');
    const { error: e } = await supabase.rpc('submit_brief', { p_order: order.id, p_brief: values });
    setBusy('');
    if (e) setError(errorText(e));
    else {
      notify(order.id, 'brief_submitted');
      onSubmitted?.();
    }
  }

  const jump = (key) => document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <form className="bf" onSubmit={submit}>
      <aside className="bf-rail">
        <p className="label muted">Your brief</p>
        <ol>
          {sections.map((s) => (
            <li key={s.key} className={sectionDone(s, values) ? 'done' : s.key === currentKey ? 'now' : ''}>
              <button type="button" onClick={() => jump(s.key)}>{s.title}</button>
              {s.optional && <span className="opt">optional</span>}
            </li>
          ))}
        </ol>
        <p className="bf-saved">{savedText(savedAt)}</p>
      </aside>

      <div className="bf-main">
        <div className="bf-step"><span>{savedText(savedAt) || 'Your brief'}</span><span>{doneCount} of {sections.length}</span></div>
        <p className="label ox">Order {order.shopify_order_name} · {plannerLabel(order)}</p>
        <h1 className="h-page bf-title">Tell me about your planner</h1>
        <p className="bf-intro">Just the essentials. Anything you'd rather explain yourself goes in the last section. Your delivery countdown starts when you submit.</p>

        {sections.map((section, i) => {
          const main = section.fields.filter((f) => !f.extra);
          const extras = section.fields.filter((f) => f.extra);
          const props = { values, set, toggle, busy, onFiles, onRemoveFile: removeFile };
          return (
            <section key={section.key} id={`sec-${section.key}`} className="bf-sec">
              <div className="bf-sec-head">
                <span className="bf-n">{String(i + 1).padStart(2, '0')}</span>
                <h2>{section.title}</h2>
                {section.optional && <span className="ql-hint">optional, but it helps me most</span>}
              </div>
              {section.note && <p className="ql-help">{section.note}</p>}
              <div className="bf-qs">
                {main.map((f) => <Field key={f.name} field={f} value={values[f.name]} {...props} />)}
              </div>
              {extras.length > 0 && (
                <div className="bf-extra">
                  {extras.map((f) => <Field key={f.name} field={f} value={values[f.name]} {...props} />)}
                </div>
              )}
            </section>
          );
        })}

        {error && <p className="error bf-error">{error}</p>}
      </div>

      <div className="bf-bar">
        <div className="bf-prog">
          <span>{doneCount} of {sections.length} sections done</span>
          <span className="bf-track"><i style={{ width: `${(doneCount / sections.length) * 100}%` }} /></span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={saveDraft} disabled={Boolean(busy)}>
          {busy === 'save' ? 'Saving' : 'Save draft'}
        </button>
        <button type="submit" className="btn" disabled={Boolean(busy)}>
          {busy === 'submit' ? 'Submitting' : 'Submit brief'}
        </button>
      </div>
    </form>
  );
}
