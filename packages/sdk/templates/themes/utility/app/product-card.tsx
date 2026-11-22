import Link from "next/link";
import type { Product } from "commerceforai";
import { fromPrice, money } from "@/lib/commerce";

// Grey tile, centred product; one line underneath: bold sans name left, tracked mono price right.
export function ProductCard({ product, sizes }: { product: Product; sizes?: string }) {
  const { min, varies, currency } = fromPrice(product);
  return (
    <Link href={`/products/${product.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-card bg-surface">
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[0]}
            alt={product.name}
            sizes={sizes}
            className="absolute inset-0 h-full w-full object-contain p-[12%] transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 max-md:flex-col max-md:gap-1">
        <p className="font-display text-[15px] font-semibold leading-tight text-ink">{product.name}</p>
        <p className="label shrink-0 text-[12px] text-ink">
          {varies ? "From " : ""}
          {money(min, currency)}
        </p>
      </div>
    </Link>
  );
}
