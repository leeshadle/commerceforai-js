import { notFound } from "next/navigation";
import { Suspense } from "react";
import { commerce, money } from "../../../lib/commerce";
import { addToCart } from "../actions";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className="cfa-muted">Loading…</p>}><Product params={params} /></Suspense>;
}

async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: p } = await commerce.products.get(id);
  if (!p || !p.active) notFound();
  const variants = p.variants.filter((v) => v.active);
  const buyable = variants.filter((v) => v.inventory.available === null || v.inventory.available > 0);
  return (
    <div className="cfa-detail">
      {p.images[0] ? <img src={p.images[0]} alt={p.name} className="cfa-image" /> : <div className="cfa-placeholder" />}
      <div>
        <h1 className="cfa-h1">{p.name}</h1>
        <p className="cfa-price">{money(variants[0]?.price ?? 0, variants[0]?.currency)}</p>
        {p.description ? <p className="cfa-muted">{p.description}</p> : null}
        <form action={addToCart}>
          {variants.length > 1 ? (
            <label className="cfa-field">
              {Object.keys(variants[0]?.options ?? {}).join(" / ") || "Option"}
              <select name="variant_id" defaultValue={buyable[0]?.id}>
                {variants.map((v) => {
                  const soldOut = v.inventory.available !== null && v.inventory.available <= 0;
                  return <option key={v.id} value={v.id} disabled={soldOut}>{v.name} · {money(v.price, v.currency)}{soldOut ? " (sold out)" : ""}</option>;
                })}
              </select>
            </label>
          ) : <input type="hidden" name="variant_id" value={variants[0]?.id ?? ""} />}
          <label className="cfa-field">
            Quantity
            <input type="number" name="quantity" min={1} max={99} defaultValue={1} />
          </label>
          <button className="cfa-button" disabled={!buyable.length}>{buyable.length ? "Add to cart" : "Sold out"}</button>
        </form>
      </div>
    </div>
  );
}
