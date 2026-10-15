import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { visibleSections } from '../portal-config';
import { errorText, notify, openFile, uploadOrderFile } from '../lib/orderApi';

function displayValue(field, value) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  if (field.type === 'checkboxes') return value.join(', ');
  return value;
}

function BriefSummary({ sections, values }) {
  return (
    <div className="brief-summary">
      {sections.map((section) => (
        <div key={section.title} className="brief-summary-section">
          <h3 className="h-sub">{section.title}</h3>
          <dl>
            {section.fields.map((field) => {
              const value = values[field.name];
              if (field.type === 'files') {
                if (!value?.length) return null;
                return (
                  <div key={field.name} className="brief-row">
                    <dt>{field.label}</dt>
                    <dd>
                      {value.map((f) => (
                        <button key={f.id} type="button" className="link-btn" onClick={() => openFile(f)}>
                          {f.name}
                        </button>
                      ))}
                    </dd>
                  </div>
                );
              }
              const shown = displayValue(field, value);
              if (!shown) return null;
              return (
                <div key={field.name} className="brief-row">
                  <dt>{field.label}</dt>
                  <dd>{shown}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

export default function BriefForm({ order, readOnly = false }) {
  const [values, setValues] = useState(order.brief || {});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const sections = useMemo(
    () => visibleSections({ tier: order.tier, license: order.license, values }),
    [order.tier, order.license, values]
  );

  if (readOnly) return <BriefSummary sections={sections} values={order.brief || {}} />;

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  function toggle(name, option) {
    const current = values[name] || [];
    set(name, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
  }

  async function addFiles(name, fileList) {
    setBusy('upload');
    setError('');
    try {
      const uploaded = [];
      for (const file of Array.from(fileList)) {
        const row = await uploadOrderFile(order.id, 'brief', file, 'customer');
        uploaded.push({ id: row.id, name: row.name, path: row.path });
      }
      const next = { ...values, [name]: [...(values[name] || []), ...uploaded] };
      setValues(next);
      await supabase.rpc('save_brief', { p_order: order.id, p_brief: next });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  }

  function removeFile(name, id) {
    set(name, (values[name] || []).filter((f) => f.id !== id));
  }

  function missingFields() {
    const missing = [];
    for (const section of sections) {
      for (const field of section.fields) {
        if (!field.required) continue;
        const v = values[field.name];
        if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) missing.push(field.label);
      }
    }
    return missing;
  }

  async function saveDraft() {
    setBusy('save');
    setError('');
    setMessage('');
    const { error: rpcError } = await supabase.rpc('save_brief', { p_order: order.id, p_brief: values });
    setBusy('');
    if (rpcError) setError(errorText(rpcError));
    else setMessage('Draft saved. You can come back and finish it any time.');
  }

  async function submit(event) {
    event.preventDefault();
    const missing = missingFields();
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}.`);
      return;
    }
    if (!window.confirm('Submit your brief? Your delivery countdown starts now, and the brief can no longer be edited. You can still send details by message.')) return;
    setBusy('submit');
    setError('');
    const { error: rpcError } = await supabase.rpc('submit_brief', { p_order: order.id, p_brief: values });
    setBusy('');
    if (rpcError) setError(errorText(rpcError));
    else notify(order.id, 'brief_submitted');
  }

  return (
    <form className="brief" onSubmit={submit}>
      <div className="brief-intro">
        <h2 className="h-section">Your brief</h2>
        <p className="muted">
          Everything I need to design your planner. Save a draft any time. Your delivery countdown starts when you submit.
        </p>
      </div>

      {sections.map((section) => (
        <fieldset key={section.title} className="brief-section">
          <legend className="h-sub">{section.title}</legend>
          {section.fields.map((field) => {
            const id = `brief-${field.name}`;
            const value = values[field.name];
            return (
              <div key={field.name} className="field">
                <label htmlFor={field.type === 'radio' || field.type === 'checkboxes' ? undefined : id} className="field-label">
                  {field.label}
                  {field.required && <span className="req"> required</span>}
                </label>
                {field.help && <p className="field-help">{field.help}</p>}

                {field.type === 'text' && (
                  <input id={id} type="text" value={value || ''} onChange={(e) => set(field.name, e.target.value)} />
                )}
                {field.type === 'textarea' && (
                  <textarea id={id} rows={3} value={value || ''} onChange={(e) => set(field.name, e.target.value)} />
                )}
                {field.type === 'select' && (
                  <select id={id} value={value || ''} onChange={(e) => set(field.name, e.target.value)}>
                    <option value="">Choose one</option>
                    {field.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
                {field.type === 'radio' && (
                  <div className="choices" role="radiogroup" aria-label={field.label}>
                    {field.options.map((o) => (
                      <label key={o} className={`choice${value === o ? ' choice--on' : ''}`}>
                        <input type="radio" name={id} checked={value === o} onChange={() => set(field.name, o)} />
                        {o}
                      </label>
                    ))}
                  </div>
                )}
                {field.type === 'checkboxes' && (
                  <div className="choices" role="group" aria-label={field.label}>
                    {field.options.map((o) => (
                      <label key={o} className={`choice${(value || []).includes(o) ? ' choice--on' : ''}`}>
                        <input type="checkbox" checked={(value || []).includes(o)} onChange={() => toggle(field.name, o)} />
                        {o}
                      </label>
                    ))}
                  </div>
                )}
                {field.type === 'files' && (
                  <div className="brief-files">
                    {(value || []).map((f) => (
                      <p key={f.id} className="brief-file">
                        <span>{f.name}</span>
                        <button type="button" className="link-btn" onClick={() => removeFile(field.name, f.id)}>
                          Remove
                        </button>
                      </p>
                    ))}
                    <label className="btn btn--ghost file-pick">
                      {busy === 'upload' ? 'Uploading' : 'Add files'}
                      <input
                        id={id}
                        type="file"
                        multiple
                        disabled={busy === 'upload'}
                        onChange={(e) => {
                          if (e.target.files?.length) addFiles(field.name, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="brief-actions">
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
