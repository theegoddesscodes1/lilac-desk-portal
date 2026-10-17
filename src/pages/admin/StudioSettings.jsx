import { useEffect, useState } from 'react';
import { useAdmin } from '../../lib/portalData';
import { errorText } from '../../lib/orderApi';
import { FIX_WINDOW_DAYS, NO_RESPONSE_DAYS } from '../../portal-config';
import AutoGrow from '../../components/AutoGrow';
import Icon from '../../components/Icons';

function Switch({ on, onChange, label }) {
  return (
    <button type="button" className={`switch${on ? ' switch--on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Days({ value, onChange, min = 1, max = 60 }) {
  return (
    <span className="days-ctl">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Fewer days"><Icon name="minus" size={12} /></button>
      <b>{value}</b>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="More days"><Icon name="plus" size={12} /></button>
    </span>
  );
}

const HOURS = [6, 7, 8, 9, 10, 11];
const hourLabel = (h) => `${h}:00 AM`;

// Kerry's tools: saved replies, quote templates, reminders, morning summary, review requests
export default function StudioSettings() {
  const { settings, saveSettings } = useAdmin();
  const [draft, setDraft] = useState(settings);
  const [newReply, setNewReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [JSON.stringify(settings)]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMsg('');
  };
  const setIn = (key, patch) => set({ [key]: { ...draft[key], ...patch } });
  const setTemplate = (i, patch) => set({ quoteTemplates: draft.quoteTemplates.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await saveSettings({
        ...draft,
        quickReplies: draft.quickReplies.map((r) => r.trim()).filter(Boolean),
        quoteTemplates: draft.quoteTemplates.filter((t) => t.name.trim() || t.scope.trim()),
      });
      setMsg('Saved.');
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const r = draft.reminders;
  return (
    <div className="studio">
      <p className="label muted section-gap">Saved replies</p>
      <p className="muted small studio-help">The quick replies above the message box. Tap one to drop it in, then edit before sending.</p>
      <ul className="reply-list">
        {draft.quickReplies.map((text, i) => (
          <li key={i}>
            <input value={text} onChange={(e) => set({ quickReplies: draft.quickReplies.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Saved reply ${i + 1}`} />
            <button type="button" className="ibtn" onClick={() => set({ quickReplies: draft.quickReplies.filter((_, j) => j !== i) })} aria-label="Remove"><Icon name="close" size={14} /></button>
          </li>
        ))}
      </ul>
      <form
        className="reply-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newReply.trim()) return;
          set({ quickReplies: [...draft.quickReplies, newReply.trim()] });
          setNewReply('');
        }}
      >
        <input value={newReply} onChange={(e) => setNewReply(e.target.value)} placeholder="Add a saved reply" />
        <button type="submit" className="btn btn--ghost btn--sm" disabled={!newReply.trim()}>Add</button>
      </form>

      <p className="label muted section-gap">Quote templates</p>
      <p className="muted small studio-help">Pick one in Send quote to fill in the license, price and what’s included, then adjust for that person.</p>
      <div className="tpl-list">
        {draft.quoteTemplates.map((t, i) => (
          <div key={i} className="tpl">
            <div className="tpl-top">
              <input className="tpl-name" value={t.name} onChange={(e) => setTemplate(i, { name: e.target.value })} placeholder="Template name" />
              <button type="button" className="ibtn" onClick={() => set({ quoteTemplates: draft.quoteTemplates.filter((_, j) => j !== i) })} aria-label="Delete template"><Icon name="close" size={14} /></button>
            </div>
            <div className="tpl-row">
              <div className="pills">
                {['personal', 'commercial'].map((l) => (
                  <button key={l} type="button" className={`pill-opt pill-opt--sm${t.license === l ? ' pill-opt--on' : ''}`} onClick={() => setTemplate(i, { license: l })}>
                    {l === 'personal' ? 'Personal' : 'Commercial'}
                  </button>
                ))}
              </div>
              <label className="tpl-price">
                <span>$</span>
                <input inputMode="decimal" value={t.price} onChange={(e) => setTemplate(i, { price: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Price (optional)" />
              </label>
            </div>
            <AutoGrow className="tpl-scope" value={t.scope} onChange={(e) => setTemplate(i, { scope: e.target.value })} placeholder="What’s included" maxHeight={240} />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ quoteTemplates: [...draft.quoteTemplates, { name: '', license: 'personal', price: '', scope: '' }] })}>
        <Icon name="plus" size={13} /> Add a template
      </button>

      <p className="label muted section-gap">Reminders to customers</p>
      <div className="setting">
        <div>
          <p className="setting-name">Send reminders for me</p>
          <p className="muted small">Friendly emails and phone notifications, each sent once. Customers who turned off email updates only get the phone notification.</p>
        </div>
        <Switch on={r.on} onChange={(on) => setIn('reminders', { on })} label="Reminders" />
      </div>
      {r.on && (
        <div className="rem-rules">
          <div className="rem-rule"><span>Brief not submitted after</span><Days value={r.briefDays} onChange={(v) => setIn('reminders', { briefDays: v })} max={14} /><span>days</span></div>
          <div className="rem-rule"><span>Proof not reviewed after</span><Days value={r.proofDays} onChange={(v) => setIn('reminders', { proofDays: v })} max={14} /><span>days</span></div>
          <div className="rem-rule">
            <span>Last reminder after</span><Days value={r.lastCallDays} onChange={(v) => setIn('reminders', { lastCallDays: v })} min={5} max={NO_RESPONSE_DAYS - 1} /><span>days with no reply</span>
            <small>Your policy closes an order after {NO_RESPONSE_DAYS} days, so this one says so.</small>
          </div>
        </div>
      )}

      <p className="label muted section-gap">Morning summary</p>
      <div className="setting">
        <div>
          <p className="setting-name">A phone notification each morning</p>
          <p className="muted small">What’s due this week, briefs to start, proofs to make, and messages waiting. Skipped on days with nothing to report.</p>
          {draft.digest.on && (
            <div className="pills studio-hours">
              {HOURS.map((h) => (
                <button key={h} type="button" className={`pill-opt pill-opt--sm${draft.digest.hour === h ? ' pill-opt--on' : ''}`} onClick={() => setIn('digest', { hour: h })}>{hourLabel(h)}</button>
              ))}
            </div>
          )}
        </div>
        <Switch on={draft.digest.on} onChange={(on) => setIn('digest', { on })} label="Morning summary" />
      </div>

      <p className="label muted section-gap">Review requests</p>
      <div className="setting">
        <div>
          <p className="setting-name">Ask for a review after delivery</p>
          <p className="muted small">One short email, sent once, inside the {FIX_WINDOW_DAYS}-day fix window. It asks for a review and a photo of the planner in use.</p>
          {draft.review.on && (
            <div className="rem-rules">
              <div className="rem-rule"><span>Send it</span><Days value={draft.review.days} onChange={(v) => setIn('review', { days: v })} max={FIX_WINDOW_DAYS - 1} /><span>days after delivery</span></div>
              <label className="field-label" htmlFor="review-url">Review link <span className="muted">(optional)</span></label>
              <input id="review-url" className="studio-input" value={draft.review.url} onChange={(e) => setIn('review', { url: e.target.value.trim() })} placeholder="https://lilacdesk.com/pages/reviews" />
              <p className="muted small">Without a link, the email links to the review button in their portal.</p>
              <label className="field-label" htmlFor="thanks-code">Thank-you code <span className="muted">(optional)</span></label>
              <input id="thanks-code" className="studio-input" value={draft.review.thanksCode} onChange={(e) => setIn('review', { thanksCode: e.target.value.trim().toUpperCase() })} placeholder="THANKYOU10" />
              <input className="studio-input" value={draft.review.thanksOffer} onChange={(e) => setIn('review', { thanksOffer: e.target.value })} placeholder="10% off your next planner" aria-label="What the code gives them" />
              <p className="muted small">Shown right after someone leaves a review. Create the code first in Shopify under Discounts.</p>
            </div>
          )}
        </div>
        <Switch on={draft.review.on} onChange={(on) => setIn('review', { on })} label="Review requests" />
      </div>

      <div className={`studio-save${dirty ? ' studio-save--on' : ''}`}>
        <button type="button" className="btn btn--sm" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
        {dirty && <button type="button" className="link-btn small" onClick={() => setDraft(settings)}>Undo</button>}
        {msg && <span className={msg === 'Saved.' ? 'small muted' : 'error small'}>{msg}</span>}
      </div>
    </div>
  );
}
