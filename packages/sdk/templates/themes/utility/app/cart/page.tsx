import Link from "next/link";
import { Suspense } from "react";
import { listProducts, money } from "@/lib/commerce";
import { checkout, setQuantity } from "@/lib/actions";
import { readCart } from "@/lib/cart-cookie";

export const metadata = { title: "Cart" };

export default function CartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <Cart searchParams={searchParams} />
    </Suspense>
  );
}

async function Cart({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, cart, products] = await Promise.all([searchParams, readCart(), listProducts()]);
  const variants = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { v, p }] as const)));
  const lines = cart.map((l) => ({ ...l, ...variants.get(l.variant_id)! })).filter((l) => l.v);
  const currency = lines[0]?.v.currency ?? "usd";
  const subtotal = lines.reduce((sum, l) => sum + l.v.price * l.quantity, 0);

  return (
    <div className="px-gutter pt-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[40px] max-md:text-[30px]">Your cart</h1>
        <Link href="/collection" className="label text-[14px] normal-case tracking-[0.12em] text-ink underline underline-offset-4">Continue shopping</Link>
      </div>

      {error ? <p className="label mt-6 border border-ink p-3 text-[12px] text-ink">{error}</p> : null}

      {!lines.length ? (
        <p className="label py-24 text-center">Your cart is empty.</p>
      ) : (
        <>
          <div className="label mt-8 grid grid-cols-[1fr_auto] border-b border-line pb-3 text-[10px] md:grid-cols-[1fr_220px_160px]">
            <span>Product</span>
            <span className="max-md:hidden">Quantity</span>
            <span className="text-right">Total</span>
          </div>
          {lines.map((l) => (
            <div key={l.variant_id} className="grid grid-cols-[1fr_auto] items-start gap-y-4 border-b border-line py-10 md:grid-cols-[1fr_220px_160px]">
              <div className="flex gap-10 max-md:gap-4">
                <div className="relative h-[176px] w-[141px] shrink-0 border border-line bg-surface max-md:h-[110px] max-md:w-[88px]">
                  {l.p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.p.images[0]} alt="" className="absolute inset-0 h-full w-full object-contain p-3" />
                  ) : null}
                </div>
                <div className="label text-[13px] normal-case leading-[1.9] tracking-[0.08em]">
                  <p className="uppercase text-ink">{l.p.name}</p>
                  <p>{money(l.v.price, currency)}</p>
                  {Object.entries(l.v.options).map(([k, v]) => (
                    <p key={k}>{k}: {v}</p>
                  ))}
                </div>
              </div>
              <form action={setQuantity} className="flex items-center gap-4 max-md:col-start-1">
                <input type="hidden" name="variant_id" value={l.variant_id} />
                <div className="flex h-[46px] items-center border border-ink">
                  <button name="quantity" value={l.quantity - 1} className="h-full w-11 text-ink" aria-label="Decrease">−</button>
                  <span className="w-8 text-center text-[14px] text-ink">{l.quantity}</span>
                  <button name="quantity" value={l.quantity + 1} className="h-full w-11 text-ink" aria-label="Increase">+</button>
                </div>
                <button name="quantity" value={0} className="label text-[11px] underline underline-offset-4">Remove</button>
              </form>
              <p className="text-right text-[17px] tracking-[0.08em] text-ink max-md:row-start-1 max-md:col-start-2">{money(l.v.price * l.quantity, currency)}</p>
            </div>
          ))}
          <div className="ml-auto mt-14 text-right md:max-w-[350px]">
            <p className="flex items-baseline justify-end gap-5 text-ink">
              <span className="font-display text-[17px] uppercase tracking-[0.12em]">Estimated total</span>
              <span className="text-[17px] tracking-[0.08em]">{money(subtotal, currency)} {currency.toUpperCase()}</span>
            </p>
            <p className="mt-3 text-[13px] leading-snug tracking-[0.1em]">Taxes, discounts and shipping calculated at checkout.</p>
            <form action={checkout} className="mt-6">
              <button className="btn btn-solid w-full">Check out</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
