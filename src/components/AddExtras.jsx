import { LOCKED_STAGES, SHOP_URL } from '../portal-config';

function availableAddons(order, addons) {
  const dated = order.tier !== 'basic' && order.brief?.dated !== 'Undated';
  return addons.filter((a) => {
    const variant = order.license === 'personal' ? a.personal_variant_id : a.commercial_variant_id;
    if (!variant) return false;
    if (a.commercial_only && order.license !== 'commercial') return false;
    if (a.tiers && !a.tiers.includes(order.tier)) return false;
    if (a.dated_only && !dated) return false;
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
  if (LOCKED_STAGES.includes(order.stage)) return null;
  const list = availableAddons(order, addons);

  return (
    <section className="panel" aria-label="Add extras">
      <h2 className="h-section">Add extras</h2>
      <p className="muted">
        You'll check out on lilacdesk.com. Extras show up here once payment goes through.
      </p>

      {orderAddons.length > 0 && (
        <div className="owned">
          <p className="label">On this order</p>
          <ul className="plain-list">
            {orderAddons.map((a) => (
              <li key={a.id}>{a.name}{a.quantity > 1 ? ` (x${a.quantity})` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {list.length === 0 ? (
        <p className="muted">No extras are available for this order right now.</p>
      ) : (
        <ul className="addon-list">
          {list.map((addon) => (
            <li key={addon.key} className="addon-row">
              <div>
                <p className="addon-name">{addon.name}</p>
                {addon.description && <p className="muted small">{addon.description}</p>}
              </div>
              <p className="addon-price">{order.license === 'personal' ? addon.personal_price : addon.commercial_price}</p>
              <button type="button" className="btn btn--ghost" onClick={() => buy(order, addon)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
