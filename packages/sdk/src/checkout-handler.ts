/**
 * A ready-made server endpoint for carts built with `commerceforai/react` (or any client):
 * it takes `{ items, discount_code? }`, creates the checkout with your secret key, and returns `{ url }`.
 *
 * ```ts
 * // app/api/checkout/route.ts (Next.js) — also works in Hono, Remix, Astro, SvelteKit, Bun, Deno
 * import { createCheckoutHandler } from "commerceforai";
 * export const POST = createCheckoutHandler();
 * ```
 *
 * The browser only sends variant ids and quantities. Prices, stock and discounts are checked by the API.
 */
import { Commerce } from "./index.js";
import { parseLines } from "./cart-core.js";

export interface CheckoutHandlerOptions {
  /** A client to use (default: `new Commerce()` from COMMERCEFORAI_API_KEY). */
  commerce?: Commerce;
  /** Where Stripe sends shoppers after paying (default `<origin>/checkout/success`). `cfa_checkout` is appended. */
  successUrl?: string | ((origin: string) => string);
  /** Where "back" on Stripe's page goes (default the page that started checkout, else `<origin>/`). */
  cancelUrl?: string | ((origin: string) => string);
  /** Sites allowed to start checkouts (default: same origin as the request only). */
  allowedOrigins?: string[];
  /** Add metadata to every checkout (e.g. `{ channel: "web" }`). */
  metadata?: Record<string, string>;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, type: string, message: string, extra: Record<string, unknown> = {}) => json({ error: { type, message, ...extra } }, status);

export function createCheckoutHandler(opts: CheckoutHandlerOptions = {}) {
  let client = opts.commerce;
  return async function handler(request: Request): Promise<Response> {
    if (request.method !== "POST") return fail(405, "invalid_request", "Use POST");
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
    const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const self = `${proto}://${host}`;
    // Only your own pages may start checkouts (stops other sites holding your stock).
    const allowed = new Set([self, ...(opts.allowedOrigins ?? [])].map((o) => o.replace(/\/$/, "")));
    if (origin && !allowed.has(origin.replace(/\/$/, ""))) return fail(403, "permission_error", "Checkout can only be started from this site");

    let body: any;
    try { body = await request.json(); } catch { return fail(400, "invalid_request", "Body must be JSON: { items: [{ variant_id, quantity }] }"); }
    const items = parseLines(body?.items);
    if (!items.length) return fail(400, "invalid_request", "Your cart is empty.", { param: "items" });

    const base = origin && allowed.has(origin.replace(/\/$/, "")) ? origin.replace(/\/$/, "") : self;
    const resolveUrl = (u: CheckoutHandlerOptions["successUrl"], fallback: string) => (typeof u === "function" ? u(base) : u ?? fallback);
    const success = new URL(resolveUrl(opts.successUrl, `${base}/checkout/success`));
    // Stripe fills in {CHECKOUT_SESSION_ID}; useClearCartOnSuccess() looks for this parameter.
    const successUrl = `${success.toString()}${success.search ? "&" : "?"}cfa_checkout={CHECKOUT_SESSION_ID}`;
    const referer = request.headers.get("referer");
    const cancelUrl = resolveUrl(opts.cancelUrl, referer && referer.startsWith(base) ? referer : `${base}/`);

    client ??= new Commerce();
    const { data, error } = await client.checkouts.create({
      items, success_url: successUrl, cancel_url: cancelUrl,
      ...(typeof body.discount_code === "string" && body.discount_code.trim() ? { discount_code: body.discount_code.trim().slice(0, 40) } : {}),
      ...(opts.metadata ? { metadata: opts.metadata } : {}),
    });
    if (error || !data?.url) {
      const e = (error ?? { type: "api_error", message: "Checkout isn't available right now." }) as { type: string; message: string; [k: string]: unknown };
      const status = e.type === "out_of_stock" ? 409 : e.type === "invalid_request" ? 400 : e.type === "rate_limited" ? 429 : 502;
      // Pass through what a shopper can act on; keep internals (keys, Stripe details) server-side.
      const safe = e.type === "out_of_stock" || e.type === "invalid_request" || e.type === "rate_limited";
      return fail(status, e.type, safe ? e.message : "Checkout isn't available right now. Please try again.",
        safe ? Object.fromEntries(Object.entries(e).filter(([k]) => ["param", "variant_id", "available"].includes(k))) : {});
    }
    return json({ id: data.id, url: data.url }, 201);
  };
}
