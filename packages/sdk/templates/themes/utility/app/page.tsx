import Link from "next/link";
import { Suspense } from "react";
import { listProducts } from "@/lib/commerce";
import { site } from "@/lib/site";
import { ProductCard } from "./product-card";

export default function Home() {
  return (
    <>
      {/* Full-bleed hero; copy and an outline button sit low on the left. */}
      <section className="relative h-[calc(100dvh-108px)] min-h-[520px] overflow-hidden bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-gutter bottom-[32%] md:left-[50px]">
          <h1 className="text-[40px] uppercase leading-[1.05] !text-white max-md:text-[30px]">{site.hero.title}</h1>
          <p className="label mt-1 text-[14px] text-white/80">{site.hero.subline}</p>
          <Link href="/collection" className="btn btn-ghost-light mt-6">{site.hero.cta}</Link>
        </div>
      </section>

      <section id="about" className="px-gutter pt-12">
        <p className="max-w-[1400px] font-display text-[24px] leading-snug text-ink max-md:text-[19px]">{site.intro}</p>
      </section>

      <Suspense fallback={<div className="h-[60vh]" />}>
        <Featured />
      </Suspense>

      {/* Two full-bleed tiles: a split "category" band. */}
      <section className="mt-section grid md:grid-cols-2">
        {[
          { title: "Shirts", href: "/collection", tone: "#d8d4c8" },
          { title: "Layers", href: "/collection", tone: "#4c5a50" },
        ].map((t) => (
          <Link key={t.title} href={t.href} className="group relative flex aspect-[4/3] items-end p-6" style={{ background: t.tone }}>
            <span className={`label text-[14px] ${t.tone === "#4c5a50" ? "text-white" : "text-ink"} group-hover:underline underline-offset-4`}>
              {t.title} →
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}

async function Featured() {
  const products = (await listProducts()).slice(0, 2);
  return (
    <section className="mt-6 grid gap-gap px-gutter md:w-2/3 md:grid-cols-2">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} sizes="(min-width: 768px) 33vw, 100vw" />
      ))}
    </section>
  );
}
