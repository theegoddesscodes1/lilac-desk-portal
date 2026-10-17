import { Link, useParams } from 'react-router-dom';
import { plannerLabel } from '../../portal-config';
import { formatDate, useOrderData } from '../../lib/orderApi';
import { money, orderTotal } from '../../lib/portalData';
import Icon from '../../components/Icons';

// A simple Lilac Desk receipt for the customer's records. Print it or save it as a PDF from the print window.
export default function Receipt() {
  const { id } = useParams();
  const { loading, error, order, orderAddons } = useOrderData(id);
  if (loading) return <p className="muted page-pad">Loading</p>;
  if (error) return <main className="page"><p className="error">{error}</p></main>;

  const refund = Number(order.refunded_amount) || 0;
  const subtotal = orderTotal(order, orderAddons) + refund;
  const business = order.brief?.businessName;

  return (
    <main className="page page--narrow receipt-page">
      <div className="receipt-bar no-print">
        <Link to={`/orders/${order.id}/files`} className="back-link"><Icon name="back" size={16} /> Back</Link>
        <button type="button" className="btn btn--sm" onClick={() => window.print()}><Icon name="download" size={14} /> Print or save as PDF</button>
      </div>

      <article className="receipt">
        <header className="receipt-head">
          <div>
            <p className="receipt-wm">Lilac Desk</p>
            <p className="small muted">lilacdesk.com · support@lilacdesk.com</p>
          </div>
          <div className="receipt-meta">
            <p className="label">Receipt</p>
            <p>Order {order.shopify_order_name}</p>
            <p className="small muted">Paid {formatDate(order.created_at)}</p>
          </div>
        </header>

        <div className="receipt-to">
          <p className="label muted">Billed to</p>
          <p>{order.customer_name || order.customer_email}</p>
          {business && <p>{business}</p>}
          <p className="small muted">{order.customer_email}</p>
        </div>

        <table className="receipt-table">
          <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Amount</th></tr></thead>
          <tbody>
            <tr><td>{plannerLabel(order)}<small>Custom digital planner · {order.license === 'commercial' ? 'Commercial' : 'Personal'} license</small></td><td className="r">1</td><td className="r">{order.planner_price != null ? money(order.planner_price) : '—'}</td></tr>
            {orderAddons.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td className="r">{a.quantity || 1}</td><td className="r">{a.price != null ? money(a.price) : '—'}</td></tr>
            ))}
          </tbody>
          <tfoot>
            {refund > 0 && (
              <>
                <tr><td colSpan={2}>Subtotal</td><td className="r">{money(subtotal)}</td></tr>
                <tr><td colSpan={2}>Refunded {order.refunded_at ? formatDate(order.refunded_at) : ''}</td><td className="r">−{money(refund)}</td></tr>
              </>
            )}
            <tr className="receipt-total"><td colSpan={2}>Total paid</td><td className="r">{money(orderTotal(order, orderAddons))}</td></tr>
          </tfoot>
        </table>

        <p className="receipt-note">Paid securely through the Lilac Desk checkout (Shopify). Any sales tax is shown on your order confirmation email. Thank you for your order.</p>
      </article>
    </main>
  );
}
