import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { commerce, money } from "../../../lib/commerce";
import { CHECKOUT_COOKIE } from "../cart-cookie";
import { ClearCart } from "./clear-cart";

export const metadata = { title: "Thank you" };

export default function ThanksPage() {
  return <Suspense fallback={<p className="cfa-muted">Loading…</p>}><Thanks /></Suspense>;
}

async function Thanks() {
  const checkoutId = (await cookies()).get(CHECKOUT_COOKIE)?.value;
  const { data: co } = checkoutId ? await commerce.checkouts.get(checkoutId) : { data: null };
  // Stripe tells us about the payment by webhook, usually within a second or two.
  const { data: order } = co?.order_id ? await commerce.orders.get(co.order_id) : { data: null };
  return (
    <div>
      <ClearCart />
      <h1 className="cfa-h1">Thank you!</h1>
      {order ? (
        <>
          <p className="cfa-muted">Order #{order.number} is confirmed{order.email ? `. A receipt is on its way to ${order.email}` : ""}.</p>
          <table className="cfa-table">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.variant_id + i.product_name}>
                  <td>{i.product_name}{i.variant_name !== "Default" ? ` · ${i.variant_name}` : ""} × {i.quantity}</td>
                  <td style={{ textAlign: "right" }}>{money(i.unit_price * i.quantity, order.currency)}</td>
                </tr>
              ))}
              <tr><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>{money(order.total, order.currency)}</strong></td></tr>
            </tbody>
          </table>
        </>
      ) : (
        <>
          <p className="cfa-notice">We&apos;re confirming your payment. This page refreshes in a moment.</p>
          <meta httpEquiv="refresh" content="3" />
        </>
      )}
      <div className="cfa-row"><Link href="/shop" className="cfa-button cfa-secondary">Keep shopping</Link></div>
    </div>
  );
}
