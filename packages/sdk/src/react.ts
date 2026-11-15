/**
 * `commerceforai/react`: cart and variant-picker hooks that draw nothing, so they fit any design.
 *
 * ```tsx
 * <CartProvider>…</CartProvider>                    // once, near the root (a client component)
 * const cart = useCart(products);                     // lines, count, subtotal, add, setQuantity, checkout
 * const picker = useVariantPicker(product);           // options, select, variant, inStock
 * ```
 *
 * The cart lives in localStorage (synced across tabs). Checkout posts the lines to your own server
 * endpoint (see `createCheckoutHandler` in `commerceforai`), which holds the API key and creates the
 * Stripe checkout. Prices are never sent from the browser.
 */
"use client";

import * as React from "react";
import {
  addLine, initialSelection, parseLines, pickVariant, removeLine, resolveCart, setLineQuantity,
  type CartLine, type CatalogProduct,
} from "./cart-core.js";

export * from "./cart-core.js";

type Listener = () => void;
const EMPTY: CartLine[] = [];

/** A tiny external store: one per storage key, shared by every hook on the page. */
function createCartStore(key: string) {
  let lines: CartLine[] = EMPTY;
  let loaded = false;
  const listeners = new Set<Listener>();
  const read = () => {
    try { return parseLines(JSON.parse(globalThis.localStorage?.getItem(key) ?? "[]")); } catch { return EMPTY; }
  };
  const load = () => { if (!loaded && typeof window !== "undefined") { lines = read(); loaded = true; } };
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => { load(); return lines; },
    set(next: CartLine[]) {
      load();
      lines = next;
      try { globalThis.localStorage?.setItem(key, JSON.stringify(next)); } catch { /* private mode: in-memory only */ }
      emit();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => { if (e.key === key) { lines = read(); emit(); } };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => { listeners.delete(l); if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); };
    },
  };
}
type CartStore = ReturnType<typeof createCartStore>;
const stores = new Map<string, CartStore>();
const storeFor = (key: string) => { let s = stores.get(key); if (!s) { s = createCartStore(key); stores.set(key, s); } return s; };

const CartContext = React.createContext<{ store: CartStore; endpoint: string } | null>(null);

export interface CartProviderProps {
  children?: React.ReactNode;
  /** localStorage key (default "cfa_cart"). Use one per store if a site sells for several. */
  storageKey?: string;
  /** Your server route that creates the checkout (default "/api/checkout"). */
  checkoutEndpoint?: string;
}

export function CartProvider({ children, storageKey = "cfa_cart", checkoutEndpoint = "/api/checkout" }: CartProviderProps) {
  const value = React.useMemo(() => ({ store: storeFor(storageKey), endpoint: checkoutEndpoint }), [storageKey, checkoutEndpoint]);
  return React.createElement(CartContext.Provider, { value }, children);
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: { type: string; message: string; variant_id?: string; available?: number } };

/**
 * The cart. Pass the catalog (`products`) to get names, current prices, a subtotal and stock checks;
 * without it you still get lines and a count.
 */
export function useCart(products?: CatalogProduct[]) {
  const ctx = React.useContext(CartContext);
  const store = ctx?.store ?? storeFor("cfa_cart");
  const endpoint = ctx?.endpoint ?? "/api/checkout";
  const lines = React.useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<Extract<CheckoutResult, { ok: false }>["error"] | null>(null);
  const resolved = React.useMemo(() => (products ? resolveCart(lines, products) : null), [lines, products]);

  const add = React.useCallback((variantId: string, quantity = 1, properties?: Record<string, string>) => store.set(addLine(store.get(), variantId, quantity, properties)), [store]);
  const setQuantity = React.useCallback((index: number, quantity: number) => store.set(setLineQuantity(store.get(), index, quantity)), [store]);
  const remove = React.useCallback((index: number) => store.set(removeLine(store.get(), index)), [store]);
  const clear = React.useCallback(() => store.set([]), [store]);
  /** Drop lines whose product is gone, and cap quantities at what's in stock. Needs `products`. */
  const fix = React.useCallback(() => {
    if (!products) return;
    const r = resolveCart(store.get(), products);
    store.set(r.lines.map((l) => ({ variant_id: l.variant_id, quantity: l.available === null ? l.quantity : Math.min(l.quantity, l.available), ...(l.properties ? { properties: l.properties } : {}) })).filter((l) => l.quantity > 0));
  }, [products, store]);

  /** Create the checkout on your server and go to Stripe. Resolves with an error instead of throwing. */
  const checkout = React.useCallback(async (opts: { discount_code?: string; redirect?: boolean } = {}): Promise<CheckoutResult> => {
    const items = store.get();
    if (!items.length) return { ok: false, error: { type: "invalid_request", message: "Your cart is empty." } };
    setPending(true); setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, ...(opts.discount_code ? { discount_code: opts.discount_code } : {}) }),
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.url) {
        const err = body?.error ?? { type: "api_error", message: "Checkout isn't available right now. Please try again." };
        setError(err); setPending(false);
        return { ok: false, error: err };
      }
      if (opts.redirect !== false) window.location.assign(body.url);
      else setPending(false);
      return { ok: true, url: body.url };
    } catch {
      const err = { type: "network_error", message: "Couldn't reach checkout. Check your connection and try again." };
      setError(err); setPending(false);
      return { ok: false, error: err };
    }
  }, [endpoint, store]);

  return {
    /** Raw lines (ids + quantities). */
    items: lines,
    /** Lines joined to the catalog (when `products` is passed). */
    lines: resolved?.lines ?? [],
    missing: resolved?.missing ?? [],
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: resolved?.subtotal ?? 0,
    currency: resolved?.currency ?? "usd",
    ready: resolved ? resolved.ready : lines.length > 0,
    add, setQuantity, remove, clear, fix, checkout,
    /** True while creating the checkout / redirecting. */
    pending,
    /** The last checkout error (e.g. out_of_stock with variant_id and available). */
    error,
  };
}

/** Selected options → variant, with which choices are still buyable. */
export function useVariantPicker(product: CatalogProduct, initial?: Record<string, string>) {
  const [selected, setSelected] = React.useState<Record<string, string>>(() => initial ?? initialSelection(product));
  React.useEffect(() => { setSelected(initial ?? initialSelection(product)); }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = React.useMemo(() => pickVariant(product, selected), [product, selected]);
  const select = React.useCallback((name: string, value: string) => setSelected((s) => ({ ...s, [name]: value })), []);
  return { ...picked, selected, select };
}

/**
 * Empty the cart after a successful payment. Call on your success page; it clears only when the URL
 * has the `cfa_checkout` parameter that `createCheckoutHandler` adds to the success URL.
 */
export function useClearCartOnSuccess(param = "cfa_checkout") {
  const { clear } = useCart();
  React.useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has(param)) clear();
  }, [clear, param]);
}

export const formatMoney = (cents: number, currency = "usd", locale = "en-US") =>
  new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
