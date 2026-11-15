/**
 * Cart and variant-picking logic with no framework attached. The React hooks in `commerceforai/react`
 * are thin wrappers around these; use them directly from Vue, Svelte or plain JS.
 */

/** What a cart stores: ids and quantities only. Names and prices are always read fresh from the catalog. */
export interface CartLine {
  variant_id: string;
  quantity: number;
  /** Custom data for this line (e.g. a name to print). Lines with properties never merge. */
  properties?: Record<string, string>;
}

export const MAX_QUANTITY = 20;
export const MAX_LINES = 30;

const clampQty = (n: number) => Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number.isFinite(n) ? n : 0)));
const sameProps = (a?: Record<string, string>, b?: Record<string, string>) =>
  JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());

/** Add, merging into an existing line for the same variant (unless either line has custom properties). */
export function addLine(lines: CartLine[], variantId: string, quantity = 1, properties?: Record<string, string>): CartLine[] {
  const hasProps = properties && Object.keys(properties).length > 0;
  const i = hasProps ? -1 : lines.findIndex((l) => l.variant_id === variantId && !Object.keys(l.properties ?? {}).length);
  if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, quantity: clampQty(l.quantity + quantity) } : l));
  if (lines.length >= MAX_LINES) return lines;
  const q = clampQty(quantity);
  return q ? [...lines, { variant_id: variantId, quantity: q, ...(hasProps ? { properties } : {}) }] : lines;
}

/** Set a line's quantity by index (0 removes it). */
export function setLineQuantity(lines: CartLine[], index: number, quantity: number): CartLine[] {
  const q = clampQty(quantity);
  return q ? lines.map((l, i) => (i === index ? { ...l, quantity: q } : l)) : lines.filter((_, i) => i !== index);
}

export const removeLine = (lines: CartLine[], index: number) => lines.filter((_, i) => i !== index);

/** Parse untrusted stored data (localStorage, a cookie) into valid lines. */
export function parseLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLine[] = [];
  for (const l of raw.slice(0, MAX_LINES)) {
    if (!l || typeof l.variant_id !== "string" || !l.variant_id) continue;
    const quantity = clampQty(Number(l.quantity));
    if (!quantity) continue;
    const props = l.properties && typeof l.properties === "object" && !Array.isArray(l.properties)
      ? Object.fromEntries(Object.entries(l.properties).filter(([, v]) => typeof v === "string").slice(0, 20)) as Record<string, string>
      : undefined;
    out.push({ variant_id: l.variant_id, quantity, ...(props && Object.keys(props).length ? { properties: props } : {}) });
  }
  return out;
}

// ---------- resolving lines against the catalog ----------

/** The parts of a product the cart and picker need. Works with SDK products and public store pages. */
export interface CatalogVariant {
  id: string;
  name: string;
  price: number;
  currency: string;
  options?: Record<string, string> | null;
  active?: boolean;
  /** SDK shape. */
  inventory?: { tracked?: boolean; available: number | null };
  /** Public store page shape. */
  in_stock?: boolean;
}
export interface CatalogProduct { id: string; name: string; images?: string[]; variants: CatalogVariant[] }

/** How many can be bought (null = unlimited). */
export function availableOf(v: CatalogVariant): number | null {
  if (v.active === false) return 0;
  if (v.inventory) return v.inventory.available ?? null;
  if (v.in_stock === false) return 0;
  return null;
}

export interface ResolvedLine extends CartLine {
  index: number;
  product: CatalogProduct;
  variant: CatalogVariant;
  unit_price: number;
  line_total: number;
  /** Stock left, or null for unlimited. */
  available: number | null;
  /** More in the cart than can be bought. */
  over_stock: boolean;
}

/**
 * Join cart lines to the catalog. Lines whose variant is gone or inactive go into `missing` (show a
 * notice and drop them); everything else gets a current price and a stock check.
 */
export function resolveCart(lines: CartLine[], products: CatalogProduct[]) {
  const byVariant = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const)));
  const resolved: ResolvedLine[] = [];
  const missing: CartLine[] = [];
  lines.forEach((l, index) => {
    const hit = byVariant.get(l.variant_id);
    if (!hit || hit.v.active === false) { missing.push(l); return; }
    const available = availableOf(hit.v);
    resolved.push({ ...l, index, product: hit.p, variant: hit.v, unit_price: hit.v.price, line_total: hit.v.price * l.quantity,
      available, over_stock: available !== null && l.quantity > available });
  });
  const currency = resolved[0]?.variant.currency ?? "usd";
  return {
    lines: resolved, missing, currency,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: resolved.reduce((n, l) => n + l.line_total, 0),
    /** Ready for checkout: something in it, nothing missing or over stock. */
    ready: resolved.length > 0 && !missing.length && resolved.every((l) => !l.over_stock),
  };
}

// ---------- variant picking ----------

/** Option names in the order they first appear (e.g. ["Size", "Color"]). */
export function optionNames(p: CatalogProduct): string[] {
  const names: string[] = [];
  for (const v of p.variants) for (const k of Object.keys(v.options ?? {})) if (!names.includes(k)) names.push(k);
  return names;
}

export interface OptionChoice { value: string; /** Some in-stock variant has this value with the other current selections. */ available: boolean; selected: boolean }

/**
 * Given the current selections, which values are offered for each option, which are buyable, and which
 * variant (if any) the selection resolves to.
 */
export function pickVariant(p: CatalogProduct, selected: Record<string, string>) {
  const live = p.variants.filter((v) => v.active !== false);
  const names = optionNames(p);
  const inStock = (v: CatalogVariant) => { const a = availableOf(v); return a === null || a > 0; };
  const matches = (v: CatalogVariant, sel: Record<string, string>) => Object.entries(sel).every(([k, val]) => (v.options ?? {})[k] === val);
  const options = names.map((name) => {
    const values = [...new Set(live.map((v) => (v.options ?? {})[name]).filter((x): x is string => !!x))];
    const others = Object.fromEntries(Object.entries(selected).filter(([k]) => k !== name));
    return {
      name,
      values: values.map((value): OptionChoice => ({
        value, selected: selected[name] === value,
        available: live.some((v) => (v.options ?? {})[name] === value && matches(v, others) && inStock(v)),
      })),
    };
  });
  // No options (a single "Default" variant, or variants named without options): match by the only one.
  const variant = names.length
    ? (names.every((n) => selected[n]) ? live.find((v) => matches(v, selected)) ?? null : null)
    : live.length === 1 ? live[0]! : null;
  return { options, variant, inStock: variant ? inStock(variant) : false, available: variant ? availableOf(variant) : null };
}

/** A sensible starting selection: the first in-stock variant's options (or the first variant's). */
export function initialSelection(p: CatalogProduct): Record<string, string> {
  const live = p.variants.filter((v) => v.active !== false);
  const first = live.find((v) => { const a = availableOf(v); return a === null || a > 0; }) ?? live[0];
  return { ...(first?.options ?? {}) };
}
