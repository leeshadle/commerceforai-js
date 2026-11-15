import Link from "next/link";
import { Suspense } from "react";
import { readCart } from "./cart-cookie";
import "./shop.css";

// Pages read cookies and live data, so each wraps its content in <Suspense> (works with or without cacheComponents).
async function CartCount() {
  const count = (await readCart()).reduce((n, l) => n + l.quantity, 0);
  return <>{count ? ` (${count})` : ""}</>;
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cfa-page"><div className="cfa-shell">
      <nav className="cfa-nav">
        <Link href="/shop" className="cfa-brand">Shop</Link>
        <div className="cfa-links">
          <Link href="/shop/orders">Find an order</Link>
          <Link href="/shop/cart">Cart<Suspense fallback={null}><CartCount /></Suspense></Link>
        </div>
      </nav>
      {children}
    </div></div>
  );
}
