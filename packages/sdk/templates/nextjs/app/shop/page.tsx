import Link from "next/link";
import { Suspense } from "react";
import { commerce, money } from "../../lib/commerce";

export const metadata = { title: "Shop" };

export default function ShopPage() {
  return <Suspense fallback={<p className="cfa-muted">Loading…</p>}><Products /></Suspense>;
}

async function Products() {
  const { data, error } = await commerce.products.list({ active: true, limit: 100 });
  if (error) return <p className="cfa-alert">Couldn&apos;t load products: {error.message}</p>;
  const products = data.data.filter((p) => p.variants.some((v) => v.active));
  if (!products.length) return <p className="cfa-empty">No products yet. Add some with the SDK, the MCP server, or by connecting Printify/Printful.</p>;
  return (
    <div className="cfa-grid">
      {products.map((p) => {
        const prices = p.variants.filter((v) => v.active).map((v) => v.price);
        const from = Math.min(...prices);
        return (
          <Link key={p.id} href={`/shop/${p.id}`} className="cfa-card">
            {p.images[0] ? <img src={p.images[0]} alt={p.name} className="cfa-image" /> : <div className="cfa-placeholder" />}
            <p className="cfa-title">{p.name}</p>
            <p className="cfa-price">{prices.length > 1 && Math.max(...prices) !== from ? "From " : ""}{money(from, p.variants[0]?.currency)}</p>
          </Link>
        );
      })}
    </div>
  );
}
