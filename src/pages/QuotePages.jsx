import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { DESIGNER_NAME } from '../portal-config';
import { errorText, formatDate, keepFresh, onConnected, refreshAll } from '../lib/orderApi';
import { money } from '../lib/portalData';
import { Avatar } from '../components/Bits';
import Icon from '../components/Icons';
import AutoGrow from '../components/AutoGrow';

const STATUS = { open: 'Talking it through', quoted: 'Quote sent', paid: 'Paid', closed: 'Closed' };
const statusText = (q, admin) => (q.status === 'closed' && q.closed_by === 'customer' ? (admin ? 'Declined' : 'You declined') : STATUS[q.status]);
const notifyQuote = (quoteId, event) =>
  supabase.functions.invoke('portal-quote', { body: { action: 'notify', quote_id: quoteId, event } }).catch(() => {});

// One quote and its conversation, live
function useQuote(id) {
  const [state, setState] = useState({ loading: true, quote: null, messages: [], error: '' });
  const reload = useCallback(async () => {
    const [q, m] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', id).maybeSingle(),
      supabase.from('quote_messages').select('*').eq('quote_id', id).order('created_at', { ascending: true }),
    ]);
    setState({ loading: false, quote: q.data, messages: m.data ?? [], error: q.error ? errorText(q.error) : q.data ? '' : 'This request could not be found.' });
  }, [id]);
  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`quote-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `id=eq.${id}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_messages', filter: `quote_id=eq.${id}` }, reload)
      .subscribe(onConnected(reload));
    const stop = keepFresh(reload);
    return () => {
      stop();
      supabase.removeChannel(channel);
    };
  }, [id, reload]);
  return { ...state, reload };
}

// ---------- the request form (customer) ----------

const LICENSES = [
  { value: 'personal', label: 'For me or a gift' },
  { value: 'commercial', label: 'To sell or share with clients' },
];
const APPS = ['GoodNotes', 'Notability', 'Noteshelf', 'Samsung Notes', 'Other'];
const NAV = ['Tabless', 'With tabs', 'Not sure'];
const BUDGETS = ['Under $200', '$200–$400', '$400–$700', '$700+', 'Not sure yet'];

function Pills({ options, value, onChange }) {
  return (
    <div className="pills">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <button key={v} type="button" className={`pill-opt${value === v ? ' pill-opt--on' : ''}`} onClick={() => onChange(value === v ? '' : v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function QuoteRequestPage({ defaultName = '' }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ name: defaultName, license: 'personal', idea: '', app: '', navigation: '', inspiration: '', budget: '', neededBy: '', business: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { name, ...request } = f;
    const { data, error: err } = await supabase.rpc('request_quote', { p_request: request, p_name: name });
    setBusy(false);
    if (err) return setError(errorText(err));
    notifyQuote(data, 'request');
    refreshAll();
    navigate(`/quotes/${data}`);
  }

  return (
    <main className="page page--narrow">
      <Link to="/" className="back-link"><Icon name="back" size={16} /> Home</Link>
      <p className="label ox">Custom planners</p>
      <h1 className="h-page bf-title">Request a custom planner</h1>
      <p className="bf-intro">Tell me what you’re picturing. I’ll reply here with questions or a quote, and once you pay, your brief opens right away.</p>

      <form onSubmit={submit} className="quote-form">
        <section className="bf-sec">
          <div className="bf-qs">
            <div className="q q--half"><p className="ql">Your name</p><input className="qline" value={f.name} onChange={(e) => set('name')(e.target.value)} autoComplete="name" /></div>
            <div className="q q--half"><p className="ql">Business <span className="ql-hint">if it’s for your business</span></p><input className="qline" value={f.business} onChange={(e) => set('business')(e.target.value)} /></div>
            <div className="q"><p className="ql">What’s it for?</p><Pills options={LICENSES} value={f.license} onChange={(v) => set('license')(v || 'personal')} /></div>
            <div className="q">
              <p className="ql">What do you have in mind?</p>
              <p className="ql-help">How you’d use it, the sections or pages you want, anything you’ve seen that’s close.</p>
              <textarea className="qarea qarea--big" required value={f.idea} onChange={(e) => set('idea')(e.target.value)} />
            </div>
            <div className="q q--half"><p className="ql">The app you use</p><Pills options={APPS} value={f.app} onChange={set('app')} /></div>
            <div className="q q--half"><p className="ql">Navigation</p><Pills options={NAV} value={f.navigation} onChange={set('navigation')} /></div>
            <div className="q"><p className="ql">Inspiration links <span className="ql-hint">optional</span></p><input className="qline" value={f.inspiration} onChange={(e) => set('inspiration')(e.target.value)} placeholder="Pinterest boards, shops, or images" /></div>
            <div className="q"><p className="ql">Budget</p><Pills options={BUDGETS} value={f.budget} onChange={set('budget')} /></div>
            <div className="q"><p className="ql">Need it by a certain date? <span className="ql-hint">optional</span></p><input className="qline" value={f.neededBy} onChange={(e) => set('neededBy')(e.target.value)} placeholder="e.g. before January 1" /></div>
          </div>
        </section>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn quote-submit" disabled={busy || !f.idea.trim()}>{busy ? 'Sending…' : 'Send my request'}</button>
        <p className="muted small">Asking is free, with no obligation.</p>
      </form>
    </main>
  );
}

// ---------- the conversation (both sides) ----------

const REQUEST_LABELS = { license: 'For', business: 'Business', app: 'App', navigation: 'Navigation', inspiration: 'Inspiration', budget: 'Budget', neededBy: 'Needed by' };

function RequestSummary({ quote }) {
  const r = quote.request || {};
  const rows = Object.entries(REQUEST_LABELS).filter(([k]) => r[k]);
  if (!rows.length) return null;
  return (
    <dl className="qsum">
      {rows.map(([k, label]) => (
        <div key={k}>
          <dt>{label}</dt>
          <dd>{k === 'license' ? (r[k] === 'commercial' ? 'Selling or clients' : 'Personal or a gift') : r[k]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function QuoteCard({ quote, admin, compact = false, onDecline }) {
  const lic = quote.license === 'commercial' ? 'Commercial' : 'Personal';
  const payable = quote.status === 'quoted' && !admin && quote.invoice_url;
  return (
    <div className={`qcard-quote${compact ? ' qcard-quote--compact' : ''}`}>
      <div className="qcard-top">
        <p className="label ox">{admin ? 'Quote sent' : 'Your quote'}</p>
        <span className="ntag">{lic} license</span>
      </div>
      <p className="qcard-price num">{money(quote.price)}</p>
      <p className="muted small">Custom planner{quote.quoted_at ? ` · quoted ${formatDate(quote.quoted_at)}` : ''}</p>
      <div className="qcard-sec">
        <p className="label muted">What’s included</p>
        <p className="qcard-scope">{quote.scope}</p>
      </div>
      {payable && !compact && (
        <div className="qcard-sec">
          <p className="label muted">What happens next</p>
          <ol className="qcard-steps">
            <li>Pay securely through the Lilac Desk checkout.</li>
            <li>Your brief opens here right away.</li>
            <li>I design, you review proofs, then download.</li>
          </ol>
        </div>
      )}
      {payable && (
        <div className="qcard-pay">
          <a href={quote.invoice_url} className="btn btn--ox">Pay {money(quote.price)} and start</a>
          {onDecline && <button type="button" className="btn btn--ghost" onClick={onDecline}>No thanks</button>}
        </div>
      )}
      {payable && !compact && <p className="small muted qcard-note">Questions first? Message me below.</p>}
      {quote.status === 'quoted' && admin && <p className="small muted qcard-note">Waiting for payment.</p>}
      {quote.status === 'paid' && <p className="small ox qcard-note"><Icon name="check" size={14} /> Paid {formatDate(quote.paid_at)}</p>}
    </div>
  );
}

const DECLINE_REASONS = ['Over my budget', 'Timing doesn’t work', 'Not quite what I wanted', 'Went with something else', 'Just exploring'];

// The customer says no (to a quote) or withdraws (a request still being discussed)
export function DeclinePanel({ quote, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isQuote = quote.status === 'quoted';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('portal-quote', { body: { action: 'close', quote_id: quote.id, reason, note } });
    setBusy(false);
    if (err || data?.error) return setError(data?.error || errorText(err));
    refreshAll();
    onDone?.();
  }

  return (
    <form className="decline" onSubmit={submit}>
      <p className="decline-title">{isQuote ? 'Decline this quote?' : 'Withdraw your request?'}</p>
      <p className="small muted">No hard feelings. A quick reason helps me, but it’s optional.</p>
      <div className="pills">
        {DECLINE_REASONS.map((r) => (
          <button key={r} type="button" className={`pill-opt pill-opt--sm${reason === r ? ' pill-opt--on' : ''}`} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>
        ))}
      </div>
      <textarea className="qarea decline-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else you’d like me to know (optional)" />
      {error && <p className="error">{error}</p>}
      <div className="decline-foot">
        <button type="submit" className="btn btn--sm" disabled={busy}>{busy ? 'Sending…' : isQuote ? 'Decline quote' : 'Withdraw request'}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>Keep it open</button>
      </div>
    </form>
  );
}

function SendQuote({ quote, onDone }) {
  const [license, setLicense] = useState(quote.license || 'personal');
  const [price, setPrice] = useState(quote.price ? String(quote.price) : '');
  const [scope, setScope] = useState(quote.scope || '');
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const missing = [
    !(Number(price) > 0) && 'a price',
    !scope.trim() && 'what’s included',
    manual && !url.trim() && 'the checkout link',
  ].filter(Boolean);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('portal-quote', {
      body: { action: 'send', quote_id: quote.id, license, price: Number(price), scope, manual_url: manual ? url : undefined },
    });
    setBusy(false);
    let msg = err ? errorText(err) : data?.error;
    if (err?.context?.json) {
      try {
        msg = (await err.context.json()).error || msg;
      } catch {
        /* keep msg */
      }
    }
    if (msg) return setError(msg);
    refreshAll();
    onDone();
  }

  return (
    <form className="send-quote" onSubmit={send}>
      <p className="tool-label">License</p>
      <div className="pills">
        {['personal', 'commercial'].map((l) => (
          <button key={l} type="button" className={`pill-opt pill-opt--sm${license === l ? ' pill-opt--on' : ''}`} onClick={() => setLicense(l)}>
            {l === 'personal' ? 'Personal' : 'Commercial'}
          </button>
        ))}
      </div>
      <label className="tool-field"><span className="tool-label">Price (USD)</span>
        <input className="tool-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 350" />
      </label>
      <label className="tool-field"><span className="tool-label">What’s included</span>
        <textarea className="qarea" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. 120 pages: dated 2027 calendar, weekly + budget + meal planner, landscape, tabless. 3 change rounds. Delivery in about 3 weeks." />
      </label>
      <label className="qcheck qcheck--ctl">
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        <span className="qcheck-box"><Icon name="check" size={13} /></span>
        <span>I’ll paste my own Shopify checkout link</span>
      </label>
      {manual && <input className="tool-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://lilacdesk.com/…/invoices/…" />}
      {error && <p className="error">{error}</p>}
      <div className="send-quote-foot">
        <button type="submit" className="btn btn--ox btn--sm" disabled={busy || missing.length > 0}>
          {busy ? 'Creating invoice…' : `${quote.status === 'quoted' ? 'Send updated quote' : 'Send quote'}${Number(price) > 0 ? ` · ${money(Number(price))}` : ''}`}
        </button>
        {missing.length > 0 && !busy && <span className="small muted">Add {missing.join(' and ')}</span>}
      </div>
    </form>
  );
}

export function QuoteThread({ admin = false, quoteId, embedded = false }) {
  const params = useParams();
  const id = quoteId || params.id;
  const { loading, error, quote, messages, reload } = useQuote(id);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState(false);
  const [declining, setDeclining] = useState(false);
  const listRef = useRef(null);
  const unread = messages.some((m) => (admin ? m.sender === 'customer' : m.sender !== 'customer') && !m.read_at);

  useEffect(() => {
    if (unread) supabase.rpc('mark_quote_read', { p_quote: id }).then(() => refreshAll());
  }, [unread, id]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, panel]);

  if (loading) return <p className="muted page-pad">Loading</p>;
  if (error) return <main className="page"><p className="error">{error}</p><Link to="/"><u>Home</u></Link></main>;

  const name = quote.name || quote.email;
  const lastQuoteId = [...messages].reverse().find((m) => m.kind === 'quote')?.id;
  const Wrapper = embedded ? 'div' : 'main';

  async function send(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const { error: err } = await supabase.from('quote_messages').insert({ quote_id: id, sender: admin ? 'admin' : 'customer', body: body.trim() });
    setSending(false);
    if (!err) {
      setBody('');
      notifyQuote(id, 'message');
      reload();
      refreshAll();
    }
  }

  async function close() {
    if (!window.confirm('Close this request? The customer can still read the chat, and any unpaid invoice is removed.')) return;
    const { data, error: err } = await supabase.functions.invoke('portal-quote', { body: { action: 'close', quote_id: id } });
    if (err || data?.error) window.alert(data?.error || errorText(err));
    setPanel(false);
    reload();
    refreshAll();
  }

  return (
    <Wrapper className={embedded ? 'convo quote-page' : 'page page--chat quote-page'}>
      <div className={embedded ? 'convo-head' : 'chat-head'}>
        <Link to={admin ? '/messages' : '/'} className="convo-back quote-back" aria-label="Back"><Icon name="back" size={18} /></Link>
        {admin ? <Avatar name={name} kind="avatar--dark" /> : <span className="avatar avatar--ox">{DESIGNER_NAME.charAt(0)}</span>}
        <div className="convo-who">
          <p className="chat-name">{admin ? name : DESIGNER_NAME}</p>
          <p className="muted small">Custom planner request · <span className="ox">{statusText(quote, admin)}</span></p>
        </div>
        {admin && quote.status !== 'paid' && quote.status !== 'closed' && (
          <button type="button" className={`btn btn--sm ${panel ? 'btn--ghost btn--active' : ''}`} onClick={() => setPanel((v) => !v)}>
            {quote.status === 'quoted' ? 'Update quote' : 'Send quote'}
          </button>
        )}
        {quote.status === 'paid' && quote.order_id && (
          <Link to={`/orders/${quote.order_id}`} className="btn btn--sm">{admin ? 'Open order' : 'Go to your order'}</Link>
        )}
      </div>

      <div className="chat">
        <div className="chat-list" ref={listRef}>
          {admin && <RequestSummary quote={quote} />}
          {messages.map((m) => {
            if (m.sender === 'system' || m.kind === 'paid') {
              return (
                <div key={m.id} className="msg-sys-wrap">
                  <p className="msg-sys">{m.body}</p>
                  {m.kind === 'paid' && quote.order_id && !admin && <Link to={`/orders/${quote.order_id}`} className="btn btn--ox btn--sm">Fill in your brief</Link>}
                </div>
              );
            }
            if (m.kind === 'quote' && m.id !== lastQuoteId) return <p key={m.id} className="msg-sys">Earlier quote, replaced by the updated one below.</p>;
            if (m.kind === 'quote') return <QuoteCard key={m.id} quote={quote} admin={admin} onDecline={admin ? undefined : () => setDeclining(true)} />;
            const mine = admin ? m.sender === 'admin' : m.sender === 'customer';
            const who = mine ? 'You' : admin ? name : DESIGNER_NAME;
            return (
              <div key={m.id} className={`msg ${mine ? 'msg--mine' : 'msg--theirs'}`}>
                <p className="msg-meta">{who}{m.kind === 'request' ? ' · Request' : ''} · {formatDate(m.created_at, true)}</p>
                <p className="msg-body">{m.body}</p>
              </div>
            );
          })}
          {!admin && quote.status === 'open' && messages.length <= 1 && (
            <p className="msg-sys">Thanks! I’ll reply here, usually within a day.</p>
          )}
          {!admin && quote.status === 'open' && !declining && (
            <button type="button" className="link-btn small quote-withdraw" onClick={() => setDeclining(true)}>Changed your mind? Withdraw this request</button>
          )}
        </div>

        {admin && panel && (
          <div className="panel-box quote-panel">
            <SendQuote quote={quote} onDone={() => { setPanel(false); reload(); }} />
            <button type="button" className="link-btn small quote-close" onClick={close}>Close this request instead</button>
          </div>
        )}

        {!admin && declining && ['open', 'quoted'].includes(quote.status) && (
          <div className="panel-box quote-panel">
            <DeclinePanel quote={quote} onDone={() => { setDeclining(false); reload(); }} onCancel={() => setDeclining(false)} />
          </div>
        )}

        {quote.status !== 'closed' && !(admin && panel) && !declining && (
          <form className="compose" onSubmit={send}>
            <span />
            <div className="compose-box">
              <label className="sr-only" htmlFor="quote-msg">Message</label>
              <AutoGrow
                id="quote-msg"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={admin ? `Reply to ${name.split(' ')[0]}…` : `Message ${DESIGNER_NAME}…`}
              />
            </div>
            <button type="submit" className="compose-send" disabled={sending || !body.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
          </form>
        )}
      </div>
    </Wrapper>
  );
}
