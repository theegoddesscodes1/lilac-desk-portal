import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { plannerLabel } from '../../portal-config';
import { errorText, formatDate } from '../../lib/orderApi';
import { useAdmin } from '../../lib/portalData';
import { Avatar, avatarKind } from '../../components/Bits';
import { Lightbox } from '../../components/FilePreview';
import { Stars, reviewPhotoUrl } from '../../components/Reviews';
import Icon from '../../components/Icons';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'shop', label: 'On the shop' },
  { key: 'new', label: 'Not on the shop' },
];

export default function AdminReviews() {
  const { loading, reviews = [], orders, reload } = useAdmin();
  const [filter, setFilter] = useState('all');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const orderById = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);
  if (loading) return <p className="muted page-pad">Loading</p>;

  const avg = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0;
  const shown = reviews.filter((r) => (filter === 'shop' ? r.featured : filter === 'new' ? !r.featured : true));

  async function feature(r, on) {
    setError('');
    const { error: err } = await supabase.from('reviews').update({ featured: on }).eq('id', r.id);
    if (err) setError(errorText(err));
    reload();
  }
  async function remove(r) {
    if (!window.confirm('Delete this review? This can’t be undone.')) return;
    if (r.photo_path) await supabase.storage.from('review-photos').remove([r.photo_path]);
    await supabase.from('reviews').delete().eq('id', r.id);
    reload();
  }

  return (
    <main className="page page--wide reviews-page">
      <Link to="/" className="back-link"><Icon name="back" size={16} /> Home</Link>
      <div className="rv-head">
        <div>
          <p className="label ox">Reviews</p>
          <h1 className="h-page">{reviews.length ? `${avg.toFixed(1)} out of 5` : 'No reviews yet'}</h1>
          {reviews.length > 0 && <p className="muted small"><Stars value={Math.round(avg)} /> from {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'} · {reviews.filter((r) => r.featured).length} on the shop</p>}
        </div>
        <div className="seg">{FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>)}</div>
      </div>
      {error && <p className="error">{error}</p>}
      {reviews.length === 0 && <p className="muted">Customers can leave a review once their planner is delivered. They’ll show up here.</p>}

      <div className="rv-list">
        {shown.map((r) => {
          const o = orderById[r.order_id];
          const name = r.name || r.email;
          return (
            <article key={r.id} className="rv">
              <div className="rv-top">
                <Avatar name={name} kind={avatarKind(o)} />
                <div className="rv-who">
                  <b>{name}</b>
                  <span className="muted small">
                    {o ? <Link to={`/orders/${o.id}`}><u>{o.shopify_order_name}</u></Link> : null}{o ? ` · ${plannerLabel(o)}` : ''} · {formatDate(r.created_at)}
                  </span>
                </div>
                <Stars value={r.rating} size={17} />
              </div>
              {r.body && <p className="rv-body">“{r.body}”</p>}
              {r.photo_path && (
                <button type="button" className="rv-photo" onClick={() => setPhoto(r)}>
                  <img src={reviewPhotoUrl(r.photo_path)} alt="Customer photo" loading="lazy" />
                </button>
              )}
              <div className="rv-foot">
                {r.ok_to_share ? (
                  <label className="rv-switch">
                    <button type="button" className={`switch${r.featured ? ' switch--on' : ''}`} role="switch" aria-checked={r.featured} onClick={() => feature(r, !r.featured)}><span /></button>
                    <span>Show on the shop</span>
                  </label>
                ) : (
                  <span className="small muted">They asked not to share this one.</span>
                )}
                <button type="button" className="link-btn small" onClick={() => remove(r)}>Delete</button>
              </div>
            </article>
          );
        })}
      </div>
      {photo && <Lightbox file={{ name: `Photo from ${photo.name || 'a customer'}`, path: photo.photo_path }} url={reviewPhotoUrl(photo.photo_path)} onDownload={() => window.open(reviewPhotoUrl(photo.photo_path), '_blank')} onClose={() => setPhoto(null)} />}
    </main>
  );
}
