import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { errorText, notify, refreshAll } from '../lib/orderApi';
import { useCustomer } from '../lib/portalData';
import AutoGrow from './AutoGrow';
import Icon from './Icons';

export const REVIEWABLE = ['delivered', 'complete'];

// ★★★★☆
export function Stars({ value = 0, size = 15, label = true }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={label ? `${value} out of 5 stars` : undefined}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= value ? 'on' : ''}>★</i>)}
    </span>
  );
}

export const reviewPhotoUrl = (path) => (path ? supabase.storage.from('review-photos').getPublicUrl(path).data.publicUrl : null);

const WORDS = ['', 'Not for me', 'It’s okay', 'Good', 'Love it', 'Absolutely love it'];

// The review form, then a thank-you with your code
export function ReviewSheet({ order, onClose }) {
  const { profile, email } = useCustomer() || {};
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState(null);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(null);
  const [copied, setCopied] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function submit(e) {
    e.preventDefault();
    if (!rating) return setError('Tap the stars to choose a rating.');
    setBusy(true);
    setError('');
    try {
      let photo_path = null;
      if (photo) {
        const { data: u } = await supabase.auth.getUser();
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        photo_path = `${u.user.id}/${order.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('review-photos').upload(photo_path, photo, { contentType: photo.type || 'image/jpeg' });
        if (upErr) throw upErr;
      }
      const { error: insErr } = await supabase.from('reviews').insert({
        order_id: order.id,
        email: (email || order.customer_email).toLowerCase(),
        name: profile?.name || order.customer_name || null,
        rating,
        body: body.trim() || null,
        photo_path,
        ok_to_share: share,
      });
      if (insErr) throw insErr;
      notify(order.id, 'review');
      const { data: t } = await supabase.rpc('review_thanks');
      setThanks(t || {});
      refreshAll();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-label="Leave a review" onClick={onClose}>
      <div className="sheet-card review-sheet" onClick={(e) => e.stopPropagation()}>
        {thanks ? (
          <div className="review-thanks">
            <Stars value={rating} size={24} />
            <p className="sheet-title">Thank you so much.</p>
            <p className="muted">Your review means the world to a small studio like mine.</p>
            {thanks.code && (
              <div className="thanks-code">
                <p className="label ox">A thank-you from me</p>
                <p>{thanks.offer || 'A little something off your next order'}</p>
                <button
                  type="button"
                  className="code-chip"
                  onClick={() => {
                    navigator.clipboard?.writeText(thanks.code).then(() => setCopied(true)).catch(() => {});
                  }}
                >
                  <b>{thanks.code}</b><span>{copied ? 'Copied' : 'Tap to copy'}</span>
                </button>
                <p className="small muted">Use it at checkout on lilacdesk.com.</p>
              </div>
            )}
            <button type="button" className="btn btn--sm" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="review-form">
            <div className="sheet-head">
              <div>
                <p className="label ox">{order.shopify_order_name}</p>
                <p className="sheet-title">How’s your planner?</p>
              </div>
              <button type="button" className="ibtn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
            </div>
            <div className="star-pick" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={n <= (hover || rating) ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>
              ))}
              <span className="star-word">{WORDS[hover || rating]}</span>
            </div>
            <label className="field-label" htmlFor="review-body">What did you love? <span className="muted">(optional)</span></label>
            <AutoGrow id="review-body" className="review-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="How you use it, your favorite pages, what it’s like working with me" maxHeight={220} />
            <div className="review-photo">
              {preview ? (
                <span className="review-photo-prev">
                  <img src={preview} alt="" />
                  <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo"><Icon name="close" size={12} /></button>
                </span>
              ) : (
                <label className="review-photo-add">
                  <Icon name="plus" size={14} /> Add a photo of it in use <span className="muted">(optional)</span>
                  <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
            <label className="qcheck">
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span className="qcheck-box"><Icon name="check" size={13} /></span>
              <span>Lilac Desk can share my review on lilacdesk.com <small>First name and last initial only.</small></span>
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn btn--ox" disabled={busy || !rating}>{busy ? 'Sending…' : 'Send my review'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

// "Leave a review" for a delivered order, or the stars they gave
export function ReviewSlot({ order, variant = 'link', autoOpen = false }) {
  const ctx = useCustomer();
  const [open, setOpen] = useState(autoOpen);
  if (!ctx || !REVIEWABLE.includes(order.stage)) return null;
  const review = ctx.reviewFor?.(order.id);
  if (review) {
    return (
      <span className={`review-done review-done--${variant}`} title="Your review">
        <Stars value={review.rating} size={variant === 'card' ? 18 : 13} />
        {variant === 'card' && <span className="small muted">Thanks for your review</span>}
      </span>
    );
  }
  return (
    <>
      <button type="button" className={variant === 'card' ? 'btn btn--ghost btn--sm' : 'review-link'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>
        <span aria-hidden="true">★</span> Leave a review
      </button>
      {open && <ReviewSheet order={order} onClose={() => setOpen(false)} />}
    </>
  );
}
