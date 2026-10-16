import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { DESIGNER_NAME } from '../portal-config';
import { errorText, formatDate, keepFresh, onConnected, refreshAll } from '../lib/orderApi';
import { Avatar } from '../components/Bits';
import Icon from '../components/Icons';

// Messages sent from the Contact page on lilacdesk.com

const notifyContact = (contactId) =>
  supabase.functions.invoke('portal-contact', { body: { action: 'notify', contact_id: contactId } }).catch(() => {});

function useContact(id) {
  const [state, setState] = useState({ loading: true, contact: null, messages: [], error: '' });
  const reload = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', id).maybeSingle(),
      supabase.from('contact_messages').select('*').eq('contact_id', id).order('created_at', { ascending: true }),
    ]);
    setState({ loading: false, contact: c.data, messages: m.data ?? [], error: c.error ? errorText(c.error) : c.data ? '' : 'This conversation could not be found.' });
  }, [id]);
  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`contact-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `id=eq.${id}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages', filter: `contact_id=eq.${id}` }, reload)
      .subscribe(onConnected(reload));
    const stop = keepFresh(reload);
    return () => {
      stop();
      supabase.removeChannel(channel);
    };
  }, [id, reload]);
  return { ...state, reload };
}

const QUICK = ['Thanks for reaching out!', 'Could you send me your order number?', 'I’ve sent you a custom planner request so we can talk details.'];

export function ContactThread({ admin = false, contactId, embedded = false }) {
  const params = useParams();
  const id = contactId || params.id;
  const navigate = useNavigate();
  const { loading, error, contact, messages, reload } = useContact(id);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const unread = messages.some((m) => (admin ? m.sender === 'customer' : m.sender !== 'customer') && !m.read_at);

  useEffect(() => {
    if (unread) supabase.rpc('mark_contact_read', { p_contact: id }).then(() => refreshAll());
  }, [unread, id]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  if (loading) return <p className="muted page-pad">Loading</p>;
  if (error) return <main className="page"><p className="error">{error}</p><Link to="/"><u>Home</u></Link></main>;

  const name = contact.name || contact.email;
  const first = (contact.name || '').split(' ')[0] || 'them';
  const Wrapper = embedded ? 'div' : 'main';

  async function send(e, text = body) {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const { error: err } = await supabase.from('contact_messages').insert({ contact_id: id, sender: admin ? 'admin' : 'customer', body: text.trim() });
    if (!err && admin && contact.status === 'closed' && !contact.quote_id) {
      await supabase.from('contacts').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', id);
    }
    setSending(false);
    if (err) return window.alert(errorText(err));
    setBody('');
    notifyContact(id);
    reload();
    refreshAll();
  }

  async function setStatus(status) {
    await supabase.from('contacts').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    reload();
    refreshAll();
  }

  async function makeQuote() {
    if (!window.confirm(`Turn this into a custom planner request? ${first === 'them' ? 'They' : first} will see it in their portal, and you can send a quote from there.`)) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('contact_to_quote', { p_contact: id });
    setBusy(false);
    if (err) return window.alert(errorText(err));
    refreshAll();
    navigate(`/messages/q/${data}`);
  }

  return (
    <Wrapper className={embedded ? 'convo quote-page' : 'page page--chat quote-page'}>
      <div className={embedded ? 'convo-head' : 'chat-head'}>
        <Link to={admin ? '/messages' : '/'} className="convo-back quote-back" aria-label="Back"><Icon name="back" size={18} /></Link>
        {admin ? <Avatar name={name} kind="avatar--plain" /> : <span className="avatar avatar--ox">{DESIGNER_NAME.charAt(0)}</span>}
        <div className="convo-who">
          <p className="chat-name">{admin ? name : DESIGNER_NAME}</p>
          <p className="muted small">
            {admin ? <a href={`mailto:${contact.email}`}><u>{contact.email}</u></a> : 'Your message'} · <span className="ox">{contact.topic}</span>
            {contact.order_ref ? ` · ${contact.order_ref}` : ''}
          </p>
        </div>
        {admin && (
          <div className="contact-actions">
            {contact.quote_id ? (
              <Link to={`/messages/q/${contact.quote_id}`} className="btn btn--ghost btn--sm">Open request</Link>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={makeQuote} disabled={busy}>Make it a quote</button>
            )}
            {!contact.quote_id && (contact.status === 'open'
              ? <button type="button" className="btn btn--ghost btn--sm hide-phone" onClick={() => setStatus('closed')}>Mark done</button>
              : <button type="button" className="btn btn--ghost btn--sm hide-phone" onClick={() => setStatus('open')}>Reopen</button>)}
          </div>
        )}
      </div>

      <div className="chat">
        <div className="chat-list" ref={listRef}>
          {messages.map((m) => {
            if (m.sender === 'system') {
              return (
                <div key={m.id} className="msg-sys-wrap">
                  <p className="msg-sys">{m.body}</p>
                  {contact.quote_id && m.body?.startsWith('Moved') && (
                    <Link to={admin ? `/messages/q/${contact.quote_id}` : `/quotes/${contact.quote_id}`} className="btn btn--ghost btn--sm">Open the request</Link>
                  )}
                </div>
              );
            }
            const mine = admin ? m.sender === 'admin' : m.sender === 'customer';
            const who = mine ? 'You' : admin ? name : DESIGNER_NAME;
            return (
              <div key={m.id} className={`msg ${mine ? 'msg--mine' : 'msg--theirs'}`}>
                <p className="msg-meta">{who} · {formatDate(m.created_at, true)}</p>
                <p className="msg-body">{m.body}</p>
              </div>
            );
          })}
          {!admin && messages.every((m) => m.sender === 'customer') && (
            <p className="msg-sys">Thanks! I’ll reply here, usually within a day.</p>
          )}
        </div>

        {!contact.quote_id && admin && messages.filter((m) => m.sender === 'admin').length === 0 && (
          <div className="quick">
            {QUICK.map((q) => <button key={q} type="button" onClick={() => setBody(q)}>{q}</button>)}
          </div>
        )}
        {!contact.quote_id && (
          <form className="compose" onSubmit={send}>
            <span />
            <div className="compose-box">
              <label className="sr-only" htmlFor="contact-msg">Message</label>
              <textarea
                id="contact-msg"
                rows={1}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={admin ? `Reply to ${first === 'them' ? name : first}… they’ll get it by email` : `Message ${DESIGNER_NAME}…`}
              />
            </div>
            <button type="submit" className="compose-send" disabled={sending || !body.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
          </form>
        )}
      </div>
    </Wrapper>
  );
}

// Small list of someone's contact conversations, for their Home
export function ContactRows({ contacts = [], unreadContact }) {
  if (!contacts.length) return null;
  return (
    <div className="home-list">
      <p className="label muted">Your messages</p>
      {contacts.slice(0, 3).map((c) => {
        const n = unreadContact?.(c.id) || 0;
        return (
          <Link key={c.id} to={c.quote_id ? `/quotes/${c.quote_id}` : `/contact/${c.id}`} className="mini-row">
            <span>{c.topic}<small>{n ? `${DESIGNER_NAME} replied` : formatDate(c.updated_at || c.created_at)}</small></span>
            <span className="small">{n ? <span className="dot" /> : null} <u>Open</u></span>
          </Link>
        );
      })}
    </div>
  );
}
