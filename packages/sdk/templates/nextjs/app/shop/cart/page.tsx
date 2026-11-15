import Link from "next/link";
import { Suspense } from "react";
import { commerce, money } from "../../../lib/commerce";
import { checkout, setQuantity } from "../actions";
import { readCart } from "../cart-cookie";

export const metadata = { title: "Cart" };

export default function CartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={<p className="cfa-muted">Loading…</p>}><Cart searchParams={searchParams} /></Suspense>;
}

async function Cart({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, cart] = await Promise.all([searchParams, readCart()]);
  if (!cart.length) return <div className="cfa-empty"><p>Your cart is empty.</p><Link href="/shop" className="cfa-button">Keep shopping</Link></div>;

  // Look up current names and prices (the cart cookie only holds variant ids and quantities).
  const { data } = await commerce.products.list({ limit: 100 });
  const variants = new Map((data?.data ?? []).flatMap((p) => p.variants.map((v) => [v.id, { ...v, product: p.name }] as const)));
  const lines = cart.map((l) => ({ ...l, v: variants.get(l.variant_id) })).filter((l) => l.v);
  const currency = lines[0]?.v?.currency ?? "usd";
  const subtotal = lines.reduce((sum, l) => sum + l.v!.price * l.quantity, 0);

  return (
    <div>
      <h1 className="cfa-h1">Cart</h1>
      {error ? <p className="cfa-alert">{error}</p> : null}
      <table className="cfa-table">
        <tbody>
          {lines.map((l) => (
            <tr key={l.variant_id}>
              <td>{l.v!.product}{l.v!.name !== "Default" ? <span className="cfa-price"> · {l.v!.name}</span> : null}</td>
              <td>
                <form action={setQuantity} style={{ display: "flex", gap: 8 }}>
                  <input type="hidden" name="variant_id" value={l.variant_id} />
                  <input type="number" name="quantity" min={0} max={99} defaultValue={l.quantity} className="cfa-qty" aria-label="Quantity" />
                  <button className="cfa-button cfa-secondary" style={{ height: 36 }}>Update</button>
                </form>
              </td>
              <td style={{ textAlign: "right" }}>{money(l.v!.price * l.quantity, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cfa-row">
        <p>Subtotal <strong>{money(subtotal, currency)}</strong> <span className="cfa-price">· shipping and tax at checkout</span></p>
        <form action={checkout}><button className="cfa-button">Checkout</button></form>
      </div>
    </div>
  );
}
