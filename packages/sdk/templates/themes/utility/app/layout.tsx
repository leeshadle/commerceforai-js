import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DM_Mono, Inter_Tight } from "next/font/google";
import { readCart } from "@/lib/cart-cookie";
import { site } from "@/lib/site";
import "./globals.css";

const mono = DM_Mono({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-dm-mono" });
const sans = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter-tight" });

export const metadata: Metadata = { title: { default: site.name, template: `%s · ${site.name}` } };

async function CartCount() {
  const n = (await readCart()).reduce((sum, l) => sum + l.quantity, 0);
  return <>{n}</>;
}

function Announcement() {
  const items = Array.from({ length: 8 }, (_, i) => (
    <span key={i} className="flex shrink-0 items-center gap-8 pr-8">
      {site.announcement}
      <span aria-hidden>•</span>
    </span>
  ));
  return (
    <div className="label overflow-hidden bg-announce py-3 text-[14px] text-announce-text" role="note" aria-label={site.announcement}>
      <div className="marquee flex w-max" aria-hidden>
        {items}
        {items}
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body className="min-h-dvh antialiased">
        <Announcement />
        <header className="label flex h-header items-center gap-8 px-gutter text-ink max-md:flex-wrap max-md:justify-between max-md:gap-y-2 max-md:py-3 max-md:h-auto">
          <Link href="/" className="font-display text-[22px] tracking-[0.06em] normal-case max-md:w-full max-md:text-center">
            {site.name.toUpperCase()}
          </Link>
          <nav className="flex gap-6">
            <Link href="/collection" className="hover:underline underline-offset-4">Shop all</Link>
            <Link href="/#about" className="hover:underline underline-offset-4">About</Link>
          </nav>
          <Link href="/cart" className="md:ml-auto hover:underline underline-offset-4">
            Cart(<Suspense fallback="0"><CartCount /></Suspense>)
          </Link>
        </header>
        <main>{children}</main>
        <footer className="mt-section border-t border-line px-gutter py-12">
          <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <h2 className="text-[34px] leading-tight max-md:text-[26px]">Subscribe to the field log</h2>
              <form className="mt-4 flex max-w-md border-b border-ink">
                <input type="email" placeholder="EMAIL" aria-label="Email" className="label flex-1 bg-transparent py-3 outline-none" />
                <button type="button" className="label text-ink">Join →</button>
              </form>
            </div>
            <ul className="label space-y-1 text-[12px]">
              <li><Link href="/collection">Shop all</Link></li>
              <li><Link href="/cart">Cart</Link></li>
            </ul>
            <ul className="label space-y-1 text-[12px]">
              <li>Shipping &amp; returns</li>
              <li>Contact</li>
            </ul>
          </div>
          <p className="label mt-12 text-[11px] text-faint">© {new Date().getFullYear()} {site.name}. Checkout by CommerceForAI + Stripe.</p>
        </footer>
      </body>
    </html>
  );
}
