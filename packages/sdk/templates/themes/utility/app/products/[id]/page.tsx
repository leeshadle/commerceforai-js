import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProduct, money } from "@/lib/commerce";
import { VariantPicker } from "./variant-picker";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProduct(id);
  if (!p) notFound();
  const variants = p.variants.filter((v) => v.active);
  const price = variants[0]?.price ?? 0;
  const currency = variants[0]?.currency ?? "usd";
  // The gallery is a strip of three equal tiles; pad with the first image so the rhythm holds.
  const images = p.images.length ? [...p.images, ...p.images, ...p.images].slice(0, Math.max(3, p.images.length)) : [];

  return (
    <article>
      <nav className="px-gutter pb-4 pt-3 font-display text-[16px] font-semibold">
        <Link href="/collection" className="text-faint/50 hover:text-ink">Shop all</Link>
        <span className="text-faint/50"> / </span>
        <span className="text-ink">{p.name}</span>
      </nav>

      <div className="flex snap-x snap-mandatory gap-[11px] overflow-x-auto [scrollbar-width:none]">
        {images.map((src, i) => (
          <div key={i} className="relative aspect-[4/5] w-1/3 shrink-0 snap-start bg-surface max-md:w-[88vw]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={i === 0 ? p.name : ""} className="absolute inset-0 h-full w-full object-contain p-[10%]" />
          </div>
        ))}
      </div>

      <div className="max-w-[460px] px-[15px] pt-6">
        <h1 className="text-[16px] tracking-[0.04em]">{p.name}</h1>
        <p className="mt-3 text-[17px] tracking-[0.08em] text-ink">{money(price, currency)} {currency.toUpperCase()}</p>
        {p.description ? <p className="label mt-6 text-[12px] leading-[1.45]">{p.description}</p> : null}
        <VariantPicker variants={variants} />
        <ul className="label mt-8 space-y-0 text-[12px] leading-[1.45]">
          <li>Material: 100% cotton</li>
          <li>Printed and shipped in 3–5 business days</li>
          <li className="pt-3">Free returns within 30 days</li>
        </ul>
      </div>
    </article>
  );
}
