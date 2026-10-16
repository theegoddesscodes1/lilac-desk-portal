import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { errorText, formatDate, refreshAll } from '../lib/orderApi';
import AutoGrow from './AutoGrow';
import Icon from './Icons';

// Your own to-do tags on an order. Only the admin side ever shows these.
export const PRESET_TAGS = ['Message', 'Need info', 'Update', 'Follow up', 'Waiting on files', 'Priority'];
const LOUD = ['Priority', 'Need info'];

export const tagClass = (t) => `otag${LOUD.includes(t) ? ' otag--ox' : ''}`;

export function TagChips({ tags = [], max = 3 }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  return (
    <span className="otags">
      {shown.map((t) => <span key={t} className={tagClass(t)}>{t}</span>)}
      {tags.length > max && <span className="otag otag--more">+{tags.length - max}</span>}
    </span>
  );
}

async function saveTags(orderId, tags) {
  const { error } = await supabase.from('order_tags').upsert({ order_id: orderId, tags, updated_at: new Date().toISOString() });
  if (error) throw error;
  refreshAll();
}

export function TagEditor({ orderId, tags = [] }) {
  const [list, setList] = useState(tags);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const ref = useRef(null);
  const key = tags.join('|');

  useEffect(() => setList(tags), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  async function apply(next) {
    const before = list;
    setList(next);
    setError('');
    try {
      await saveTags(orderId, next);
    } catch (err) {
      setList(before);
      setError(errorText(err));
    }
  }
  const toggle = (t) => apply(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  const addCustom = (e) => {
    e.preventDefault();
    const t = custom.trim().slice(0, 24);
    if (t && !list.some((x) => x.toLowerCase() === t.toLowerCase())) apply([...list, t]);
    setCustom('');
  };
  const options = [...PRESET_TAGS, ...list.filter((t) => !PRESET_TAGS.includes(t))];

  return (
    <div className="tag-edit" ref={ref}>
      {list.map((t) => (
        <button key={t} type="button" className={`${tagClass(t)} otag--x`} onClick={() => toggle(t)} aria-label={`Remove ${t}`} title="Done? Tap to remove">
          {t}<Icon name="close" size={11} />
        </button>
      ))}
      <button type="button" className="otag-add" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="plus" size={12} /> {list.length ? 'Tag' : 'Add a to-do tag'}
      </button>
      {open && (
        <div className="tag-pop" role="dialog" aria-label="Tags">
          <p className="label muted">Only you see these</p>
          <div className="tag-pop-list">
            {options.map((t) => (
              <button key={t} type="button" className={`tag-opt${list.includes(t) ? ' tag-opt--on' : ''}`} onClick={() => toggle(t)}>
                <span className="tag-opt-box">{list.includes(t) && <Icon name="check" size={12} />}</span>{t}
              </button>
            ))}
          </div>
          <form className="tag-pop-new" onSubmit={addCustom}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="New tag" maxLength={24} />
            <button type="submit" className="btn btn--ghost btn--sm" disabled={!custom.trim()}>Add</button>
          </form>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

// Private running notes on one order, newest first
export function OrderNotes({ orderId }) {
  const [notes, setNotes] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { data, error: err } = await supabase.from('order_notes').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
    if (err) setError(errorText(err));
    setNotes(data ?? []);
  }
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`notes-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_notes', filter: `order_id=eq.${orderId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const { error: err } = await supabase.from('order_notes').insert({ order_id: orderId, body: body.trim() });
    setBusy(false);
    if (err) return setError(errorText(err));
    setBody('');
    load();
  }
  async function remove(id) {
    if (!window.confirm('Delete this note?')) return;
    await supabase.from('order_notes').delete().eq('id', id);
    load();
  }

  return (
    <div className="onotes">
      <form className="onote-new" onSubmit={add}>
        <AutoGrow value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note for yourself: what’s next, what they said, anything to remember" maxHeight={220} />
        <button type="submit" className="btn btn--sm" disabled={busy || !body.trim()}>{busy ? 'Saving…' : 'Add note'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notes === null ? <p className="muted">Loading</p> : notes.length === 0 ? (
        <p className="muted onote-empty">No notes yet. Only you can see these.</p>
      ) : (
        <ul className="onote-list">
          {notes.map((n) => (
            <li key={n.id} className="onote">
              <p className="onote-body">{n.body}</p>
              <p className="onote-meta">
                <span>{formatDate(n.created_at, true)}</span>
                <button type="button" className="link-btn small" onClick={() => remove(n.id)}>Delete</button>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
