import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { DESIGNER_NAME } from '../portal-config';
import { errorText, formatDate, notify, openFile, uploadOrderFile } from '../lib/orderApi';
import Icon from './Icons';

const KIND_LABELS = { revision_request: 'Changes requested', approval: 'Approved' };

function senderName(sender, viewer, customerName) {
  if (sender === viewer) return 'You';
  return sender === 'admin' ? DESIGNER_NAME : customerName || 'Customer';
}

export default function ChatPanel({ orderId, messages, files, viewer, customerName, disabled, quickReplies = [], onSent }) {
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const filesById = useMemo(() => Object.fromEntries((files ?? []).map((f) => [f.id, f])), [files]);
  const otherSide = viewer === 'admin' ? 'customer' : 'admin';
  const unread = messages.some((m) => m.sender === otherSide && !m.read_at);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, orderId]);

  // Opening the chat marks the other side's messages as read
  useEffect(() => {
    if (unread) supabase.rpc('mark_read', { p_order: orderId });
  }, [unread, orderId]);

  async function send(event) {
    event?.preventDefault();
    if (!body.trim() && !attachment) return;
    setSending(true);
    setError('');
    try {
      let fileId = null;
      if (attachment) {
        const file = await uploadOrderFile(orderId, 'chat', attachment, viewer);
        fileId = file.id;
      }
      const { error: insertError } = await supabase
        .from('messages')
        .insert({ order_id: orderId, sender: viewer, body: body.trim(), file_id: fileId });
      if (insertError) throw insertError;
      setBody('');
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      notify(orderId, 'message');
      onSent?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="muted chat-empty">No messages yet. Ask anything about your planner here.</p>}
        {messages.map((m) => {
          if (m.sender === 'system') {
            return <p key={m.id} className="msg-sys">{m.body}</p>;
          }
          const file = m.file_id ? filesById[m.file_id] : null;
          const mine = m.sender === viewer;
          return (
            <div key={m.id} className={`msg ${mine ? 'msg--mine' : 'msg--theirs'}${m.kind === 'revision_request' ? ' msg--req' : ''}`}>
              <p className="msg-meta">
                {senderName(m.sender, viewer, customerName)}
                {KIND_LABELS[m.kind] ? ` · ${KIND_LABELS[m.kind]}` : ''}
                <span> · {formatDate(m.created_at, true)}</span>
              </p>
              {m.body && <p className="msg-body">{m.body}</p>}
              {file && (
                <button type="button" className="msg-file" onClick={() => openFile(file)}>
                  {file.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {disabled ? (
        <p className="muted chat-closed">Messaging is closed for this order.</p>
      ) : (
        <>
          {quickReplies.length > 0 && (
            <div className="quick">
              {quickReplies.map((q) => (
                <button key={q} type="button" onClick={() => setBody(q)}>{q}</button>
              ))}
            </div>
          )}
          <form className="compose" onSubmit={send}>
            <label className="compose-attach" title="Attach a file">
              <Icon name="clip" />
              <span className="sr-only">Attach a file</span>
              <input ref={fileInputRef} type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
            </label>
            <div className="compose-box">
              {attachment && <span className="compose-file">{attachment.name}</span>}
              <label className="sr-only" htmlFor={`chat-${orderId}`}>Message</label>
              <textarea
                id={`chat-${orderId}`}
                rows={1}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={viewer === 'admin' ? `Reply to ${customerName?.split(' ')[0] || 'customer'}…` : `Message ${DESIGNER_NAME}…`}
              />
            </div>
            <button type="submit" className="btn btn--ox" disabled={sending || (!body.trim() && !attachment)}>
              {sending ? 'Sending' : 'Send'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  );
}
