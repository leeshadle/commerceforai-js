import { Suspense } from "react";
import { listProducts } from "@/lib/commerce";
import { ProductCard } from "../product-card";

export const metadata = { title: "Shop all" };

// No title block: straight into an edge-to-edge 4-column grid (2 on mobile).
export default function Collection() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <Grid />
    </Suspense>
  );
}

async function Grid() {
  const products = await listProducts();
  if (!products.length) return <p className="label px-gutter py-24 text-center">No products yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-gap gap-y-10 px-gutter pt-12 md:grid-cols-4 max-md:px-5 max-md:pt-16">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} sizes="(min-width: 768px) 25vw, 50vw" />
      ))}
    </div>
  );
}
