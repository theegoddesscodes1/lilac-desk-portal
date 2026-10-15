import { useState } from 'react';
import { LOCKED_STAGES, REPEATABLE_ADDONS, SHOP_URL } from '../portal-config';
import Icon from './Icons';

const GROUPS = [
  { title: 'Speed and changes', keys: ['rush', 'extra_revision'] },
  { title: 'Pages and versions', keys: ['extra_pages', 'extra_template', 'link_pack', 'calendar_links', 'important_dates', 'both_orientations', 'colorway', 'undated_version', 'additional_year'] },
  { title: 'Matching extras', keys: ['sticker_set', 'sticker_both', 'notebook', 'journal'] },
  { title: 'For selling', keys: ['source_files_basic', 'source_files_standard', 'source_files_premium', 'mockups', 'listing_copy', 'cover_variations', 'freebie', 'personalized_copies'] },
];

function availableAddons(order, addons, orderAddons) {
  const dated = order.tier !== 'basic' && order.brief?.dated !== 'Undated';
  const owned = new Set(orderAddons.map((a) => a.addon_key));
  const hasStickers = order.tier === 'premium' || owned.has('sticker_set');
  return addons.filter((a) => {
    const variant = order.license === 'personal' ? a.personal_variant_id : a.commercial_variant_id;
    if (!variant) return false;
    if (a.commercial_only && order.license !== 'commercial') return false;
    if (a.tiers && !a.tiers.includes(order.tier)) return false;
    if (a.dated_only && !dated) return false;
    if (owned.has(a.key) && !REPEATABLE_ADDONS.includes(a.key)) return false;
    if (a.key === 'sticker_both' && !hasStickers) return false;
    return true;
  });
}

// Posts to Shopify's cart with a hidden property linking the add-on to this order
function buy(order, addon) {
  const variant = order.license === 'personal' ? addon.personal_variant_id : addon.commercial_variant_id;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${SHOP_URL}/cart/add`;
  const fields = {
    id: String(variant),
    quantity: '1',
    'properties[_portal_order]': order.id,
    'properties[Planner order]': order.shopify_order_name || '',
    return_to: '/checkout',
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function AddExtras({ order, addons, orderAddons }) {
  const [open, setOpen] = useState(false);
  if (LOCKED_STAGES.includes(order.stage)) return null;
  const list = availableAddons(order, addons, orderAddons);
  if (list.length === 0 && orderAddons.length === 0) return null;
  const price = (a) => (order.license === 'personal' ? a.personal_price : a.commercial_price);

  return (
    <section className={`extras${open ? ' extras--open' : ''}`} aria-label="Add extras">
      <button type="button" className="extras-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          <span className="extras-title">Add extras to this order</span>
          <span className="muted small">Rush delivery, extra pages, a matching journal, and more</span>
        </span>
        <Icon name={open ? 'minus' : 'plus'} className="ox" />
      </button>

      {open && (
        <div className="extras-body">
          {orderAddons.length > 0 && (
            <div className="extras-owned">
              <p className="label muted">Already on this order</p>
              <p className="small">
                {orderAddons.map((a) => `${a.name}${a.quantity > 1 ? ` (x${a.quantity})` : ''}`).join(' · ')}
              </p>
            </div>
          )}
          {GROUPS.map((group) => {
            const rows = list.filter((a) => group.keys.includes(a.key));
            if (!rows.length) return null;
            return (
              <div key={group.title} className="extras-group">
                <p className="label muted">{group.title}</p>
                {rows.map((addon) => (
                  <div key={addon.key} className="extras-row">
                    <div>
                      <p className="extras-name">{addon.name}</p>
                      {addon.description && <p className="muted small">{addon.description}</p>}
                    </div>
                    <span className="extras-price">{price(addon)}</span>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => buy(order, addon)}>
                      Add
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          <p className="muted small extras-foot">You'll check out on lilacdesk.com. Extras appear here once payment goes through.</p>
        </div>
      )}
    </section>
  );
}
