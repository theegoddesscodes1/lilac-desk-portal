import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { DESIGNER_NAME } from '../portal-config';
import { errorText, formatDate, notify, openFile, uploadOrderFile } from '../lib/orderApi';

const KIND_LABELS = { revision_request: 'Revision request', approval: 'Approval' };

function senderName(sender, viewer, customerName) {
  if (sender === 'system') return 'Lilac Desk';
  if (sender === viewer) return 'You';
  return sender === 'admin' ? DESIGNER_NAME : customerName || 'Customer';
}

export default function ChatPanel({ orderId, messages, files, viewer, customerName, disabled }) {
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const filesById = useMemo(() => Object.fromEntries(files.map((f) => [f.id, f])), [files]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  async function send(event) {
    event.preventDefault();
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
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel chat" aria-label="Messages">
      <h2 className="h-section">Messages</h2>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="muted">No messages yet. Ask anything about your planner here.</p>}
        {messages.map((m) => {
          const file = m.file_id ? filesById[m.file_id] : null;
          const mine = m.sender === viewer;
          return (
            <div key={m.id} className={`msg msg--${m.sender}${mine ? ' msg--mine' : ''}${m.kind !== 'message' ? ` msg--${m.kind}` : ''}`}>
              <p className="msg-meta">
                {senderName(m.sender, viewer, customerName)}
                {KIND_LABELS[m.kind] ? `, ${KIND_LABELS[m.kind].toLowerCase()}` : ''}
                <span>{formatDate(m.created_at, true)}</span>
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
        <p className="muted">Messaging is closed for this order.</p>
      ) : (
        <form className="chat-form" onSubmit={send}>
          <label className="sr-only" htmlFor={`chat-${orderId}`}>Message</label>
          <textarea
            id={`chat-${orderId}`}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message"
          />
          <div className="chat-actions">
            <label className="btn btn--ghost file-pick">
              {attachment ? attachment.name : 'Attach a file'}
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" className="btn" disabled={sending || (!body.trim() && !attachment)}>
              {sending ? 'Sending' : 'Send message'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </section>
  );
}
