import type {
  Collection, CollectionParams, Customer, CustomerDetail, Discount, DiscountParams, DraftOrder, DraftOrderParams, GiftCard, OrderEdit, OrderEditParams, SalesReport, Subscription,
  Checkout, CheckoutCreateParams, Dimensions, Email, ErrorResponse, Event, EventType, Label, List, Order, OrderStatus, Parcel,
  Product, ProductCreateParams, ProductUpdateParams, Result, Return, ShipFromAddress, ShippingRate, Store, StorefrontConfig,
  Variant, VariantInput, VariantUpdateParams, WebhookEndpoint,
} from "./types.js";

export type * from "./types.js";

export interface CommerceOptions {
  /** Defaults to COMMERCEFORAI_BASE_URL, then https://api.commerceforai.com. */
  baseUrl?: string;
  /** Retries for network errors, 429 and 5xx. POSTs are retried with the same Idempotency-Key. Default 2. */
  maxRetries?: number;
  /** Custom fetch (e.g. for testing or proxies). */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

type Query = Record<string, string | number | boolean | undefined>;

const env = (k: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[k] : undefined;

/**
 * ```ts
 * const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY);
 * const { data, error } = await commerce.checkouts.create({ items: [{ variant_id, quantity: 1 }], success_url });
 * ```
 */
export class Commerce {
  readonly products: Products;
  readonly variants: Variants;
  readonly inventory: InventoryResource;
  readonly checkouts: Checkouts;
  readonly orders: Orders;
  readonly events: Events;
  readonly webhooks: Webhooks;
  readonly store: StoreResource;
  readonly returns: Returns;
  readonly emails: Emails;
  readonly collections: Collections;
  readonly customers: Customers;
  readonly draftOrders: DraftOrders;
  readonly giftCards: GiftCards;
  readonly subscriptions: Subscriptions;
  readonly discounts: Discounts;
  readonly reports: Reports;
  readonly printify: PrintifyResource;
  readonly files: Files;

  private readonly key: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: NonNullable<CommerceOptions["fetch"]>;

  constructor(apiKey?: string, opts: CommerceOptions = {}) {
    const key = apiKey ?? env("COMMERCEFORAI_API_KEY");
    if (!key) throw new Error("Missing API key. Pass it to `new Commerce(key)` or set COMMERCEFORAI_API_KEY.");
    this.key = key;
    this.baseUrl = (opts.baseUrl ?? env("COMMERCEFORAI_BASE_URL") ?? "https://api.commerceforai.com").replace(/\/$/, "");
    this.maxRetries = opts.maxRetries ?? 2;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);

    this.products = new Products(this);
    this.variants = new Variants(this);
    this.inventory = new InventoryResource(this);
    this.checkouts = new Checkouts(this);
    this.orders = new Orders(this);
    this.events = new Events(this);
    this.webhooks = new Webhooks(this);
    this.store = new StoreResource(this);
    this.returns = new Returns(this);
    this.emails = new Emails(this);
    this.collections = new Collections(this);
    this.customers = new Customers(this);
    this.draftOrders = new DraftOrders(this);
    this.giftCards = new GiftCards(this);
    this.subscriptions = new Subscriptions(this);
    this.discounts = new Discounts(this);
    this.reports = new Reports(this);
    this.printify = new PrintifyResource(this);
    this.files = new Files(this);
  }

  /** @internal */
  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    opts: { body?: unknown; query?: Query; idempotencyKey?: string } = {},
  ): Promise<Result<T>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.key}`,
      "user-agent": "commerceforai-node/0.1.0",
    };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (method === "POST") headers["idempotency-key"] = opts.idempotencyKey ?? crypto.randomUUID();

    let lastError: ErrorResponse = { type: "network_error", message: "Request failed" };
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
      } catch (e) {
        lastError = { type: "network_error", message: e instanceof Error ? e.message : String(e) };
        continue;
      }
      const json: any = await res.json().catch(() => null);
      if (res.ok) return { data: json as T, error: null };
      lastError = json?.error ?? { type: "internal_error", message: `HTTP ${res.status}` };
      if (res.status !== 429 && res.status < 500) break;
    }
    return { data: null, error: lastError };
  }
}

abstract class Resource {
  constructor(protected readonly client: Commerce) {}
}

class Products extends Resource {
  /**
   * Create up to 100 products in one request. Each succeeds or fails on its own; retry only the failures.
   * Returns { created, failed, results: [{ index, product } | { index, error }] }.
   */
  createMany(products: ProductCreateParams[]) {
    return this.client.request<{ object: "bulk_result"; created: number; failed: number; results: ({ index: number; product: Product } | { index: number; error: { type: string; message: string; param?: string } })[] }>(
      "POST", "/v1/products/bulk", { body: { products } });
  }
  /** Create a product. Use `price` for a single-variant product, or `variants` for sizes/colors. */
  create(params: ProductCreateParams, opts?: { idempotencyKey?: string }) {
    return this.client.request<Product>("POST", "/v1/products", { body: params, ...opts });
  }
  get(id: string) {
    return this.client.request<Product>("GET", `/v1/products/${encodeURIComponent(id)}`);
  }
  /** `metadata` filters on exact matches, e.g. { collection: "yosemite" }. */
  /** `q` searches product names and SKUs. */
  list(params: { limit?: number; starting_after?: string; active?: boolean; q?: string; metadata?: Record<string, string>; /** Collection id or handle. */ collection?: string } = {}) {
    const { metadata, ...rest } = params;
    const query: Record<string, string | number | boolean | undefined> = { ...rest };
    for (const [k, v] of Object.entries(metadata ?? {})) query[`metadata[${k}]`] = v;
    return this.client.request<List<Product>>("GET", "/v1/products", { query });
  }
  update(id: string, params: ProductUpdateParams) {
    return this.client.request<Product>("PATCH", `/v1/products/${encodeURIComponent(id)}`, { body: params });
  }
  /** Archive: hides it from sale; existing orders are unaffected. */
  archive(id: string) {
    return this.client.request<Product>("DELETE", `/v1/products/${encodeURIComponent(id)}`);
  }
  addVariant(productId: string, params: VariantInput) {
    return this.client.request<Variant>("POST", `/v1/products/${encodeURIComponent(productId)}/variants`, { body: params });
  }
}

class Variants extends Resource {
  update(id: string, params: VariantUpdateParams) {
    return this.client.request<Variant>("PATCH", `/v1/variants/${encodeURIComponent(id)}`, { body: params });
  }
}

class InventoryResource extends Resource {
  /** Tracked variants, lowest stock first. */
  list(params: { low_stock_threshold?: number } = {}) {
    return this.client.request<List<Variant & { product_name: string }>>("GET", "/v1/inventory", { query: params });
  }
  /** Add/remove units, e.g. `{ adjust: 50 }` after a restock or `{ adjust: -1 }` for damage. */
  adjust(variantId: string, adjust: number, reason?: string) {
    return this.client.request<Variant>("POST", `/v1/variants/${encodeURIComponent(variantId)}/inventory`, { body: { adjust, reason } });
  }
  /** Set the absolute on-hand count, e.g. after a stock count. */
  set(variantId: string, onHand: number, reason?: string) {
    return this.client.request<Variant>("POST", `/v1/variants/${encodeURIComponent(variantId)}/inventory`, { body: { set: onHand, reason } });
  }
}

class Checkouts extends Resource {
  /** Reserve stock and create a Stripe-hosted checkout. Redirect the customer to `data.url`. */
  create(params: CheckoutCreateParams, opts?: { idempotencyKey?: string }) {
    return this.client.request<Checkout>("POST", "/v1/checkouts", { body: params, ...opts });
  }
  get(id: string) {
    return this.client.request<Checkout>("GET", `/v1/checkouts/${encodeURIComponent(id)}`);
  }
}

class Orders extends Resource {
  /** `q` matches an order number, customer email or name. */
  list(params: { limit?: number; starting_after?: string; status?: OrderStatus | OrderStatus[]; q?: string } = {}) {
    const status = Array.isArray(params.status) ? params.status.join(",") : params.status;
    return this.client.request<List<Order>>("GET", "/v1/orders", { query: { ...params, status } });
  }
  /** Accepts an order id (`ord_...`) or order number (`1001`). */
  get(idOrNumber: string | number) {
    return this.client.request<Order>("GET", `/v1/orders/${encodeURIComponent(String(idOrNumber))}`);
  }
  update(id: string | number, params: { note?: string | null; metadata?: Record<string, string> }) {
    return this.client.request<Order>("PATCH", `/v1/orders/${encodeURIComponent(String(id))}`, { body: params });
  }
  /** Mark shipped. Calling again updates tracking. */
  /**
   * Change a paid order before it ships: swap an item (replace), remove or add items, or fix the address or email.
   * Taking something off refunds its share of what was charged. A change that costs more is refused unless
   * waive_difference is true. Affected print-on-demand orders are cancelled at the provider and sent again; if the
   * provider won't cancel, nothing changes. dry_run returns what would happen.
   */
  edit(id: string | number, params: OrderEditParams) {
    return this.client.request<OrderEdit>("POST", `/v1/orders/${encodeURIComponent(String(id))}/edit`, { body: params });
  }
  /** On an order that already shipped, a new tracking number adds a package (the customer is emailed about it); `replace: true` corrects the tracking instead. */
  fulfill(id: string | number, params: {
    carrier?: string; tracking_number?: string; tracking_url?: string; replace?: boolean;
    /** Ship part of the order: what's in this box. The order stays "paid" (fulfillment_status "partial") until nothing is left. */
    items?: { variant_id: string; quantity: number }[];
  } = {}) {
    return this.client.request<Order>("POST", `/v1/orders/${encodeURIComponent(String(id))}/fulfill`, { body: params });
  }
  /**
   * Get live label rates from your EasyPost/Shippo account, cheapest first.
   * Parcel weight defaults to the sum of variant `weight_oz`. Pass `return_id` for return-label rates.
   */
  shippingRates(id: string | number, params: { parcel?: Parcel; return_id?: string } = {}) {
    return this.client.request<List<ShippingRate> & { parcel: Required<Parcel> }>("POST", `/v1/orders/${encodeURIComponent(String(id))}/shipping-rates`, { body: params });
  }
  /** Buy a label for a rate. Outbound labels also mark the order fulfilled with tracking (and email the customer). */
  buyLabel(id: string | number, rateId: string, opts: { max_cost?: number } = {}) {
    return this.client.request<Label>("POST", `/v1/orders/${encodeURIComponent(String(id))}/labels`, { body: { rate_id: rateId, ...opts } });
  }
  /** Send a paid order to the print-on-demand provider now (e.g. after fixing a missing print file). */
  submitFulfillment(id: string | number, params: { provider?: "printful" | "printify" } = {}) {
    return this.client.request<Order>("POST", `/v1/orders/${encodeURIComponent(String(id))}/submit-fulfillment`, { body: params });
  }
  labels(id: string | number) {
    return this.client.request<List<Label>>("GET", `/v1/orders/${encodeURIComponent(String(id))}/labels`);
  }
  /** Refund through Stripe. Omit `amount` for a full refund; `restock` returns items to inventory. */
  refund(id: string | number, params: { amount?: number; restock?: boolean; reason?: "duplicate" | "fraudulent" | "requested_by_customer" } = {}) {
    return this.client.request<Order>("POST", `/v1/orders/${encodeURIComponent(String(id))}/refund`, { body: params });
  }
}

class Collections extends Resource {
  /** Group products, e.g. { name: "Mugs", product_ids: [...] }. The handle defaults from the name. */
  create(params: CollectionParams & { name: string }) {
    return this.client.request<Collection>("POST", "/v1/collections", { body: params });
  }
  list() { return this.client.request<List<Collection>>("GET", "/v1/collections"); }
  /** By id or handle. */
  get(idOrHandle: string) { return this.client.request<Collection>("GET", `/v1/collections/${encodeURIComponent(idOrHandle)}`); }
  /** Passing product_ids replaces the membership (in that order). */
  update(idOrHandle: string, params: CollectionParams) {
    return this.client.request<Collection>("PATCH", `/v1/collections/${encodeURIComponent(idOrHandle)}`, { body: params });
  }
  addProducts(idOrHandle: string, productIds: string[]) {
    return this.client.request<Collection>("POST", `/v1/collections/${encodeURIComponent(idOrHandle)}/products`, { body: { product_ids: productIds } });
  }
  removeProduct(idOrHandle: string, productId: string) {
    return this.client.request<Collection>("DELETE", `/v1/collections/${encodeURIComponent(idOrHandle)}/products/${encodeURIComponent(productId)}`);
  }
  delete(idOrHandle: string) {
    return this.client.request<{ id: string; deleted: true }>("DELETE", `/v1/collections/${encodeURIComponent(idOrHandle)}`);
  }
}

class Customers extends Resource {
  /** Everyone who has paid, matched by email. Search by email or name; sort by recent (default), spent or orders. */
  list(params: { q?: string; sort?: "recent" | "spent" | "orders"; limit?: number; page?: number } = {}) {
    return this.client.request<List<Customer> & { page: number }>("GET", "/v1/customers", { query: params });
  }
  /** Totals, last address and full order history for one email. */
  get(email: string) { return this.client.request<CustomerDetail>("GET", `/v1/customers/${encodeURIComponent(email)}`); }
  /**
   * Mark a customer tax-exempt (wholesale, nonprofit). Checkouts you create with their `customer_email` then skip sales tax.
   * Works before their first order. `tax_exempt_note` is for your records, e.g. the certificate number.
   */
  update(email: string, params: { tax_exempt?: boolean; tax_exempt_note?: string | null }) {
    return this.client.request<CustomerDetail>("PATCH", `/v1/customers/${encodeURIComponent(email)}`, { body: params });
  }
}

/**
 * Build an order for a customer (phone orders, wholesale, quotes), optionally at your own prices, and email them an
 * invoice. The invoice link works for 30 days by default; paying it creates a normal order.
 */
class DraftOrders extends Resource {
  create(params: DraftOrderParams) { return this.client.request<DraftOrder>("POST", "/v1/draft_orders", { body: params }); }
  list(params: { status?: "open" | "invoice_sent" | "completed" | "cancelled"; limit?: number } = {}) {
    return this.client.request<List<DraftOrder>>("GET", "/v1/draft_orders", { query: params });
  }
  /** By id or number. */
  get(id: string | number) { return this.client.request<DraftOrder>("GET", `/v1/draft_orders/${encodeURIComponent(String(id))}`); }
  update(id: string | number, params: Partial<DraftOrderParams>) {
    return this.client.request<DraftOrder>("PATCH", `/v1/draft_orders/${encodeURIComponent(String(id))}`, { body: params });
  }
  /** Email the invoice to the draft's customer_email (or `to`), with an optional message. */
  sendInvoice(id: string | number, params: { to?: string; message?: string } = {}) {
    return this.client.request<DraftOrder & { invoice_sent_to: string }>("POST", `/v1/draft_orders/${encodeURIComponent(String(id))}/send_invoice`, { body: params });
  }
  cancel(id: string | number) { return this.client.request<DraftOrder>("POST", `/v1/draft_orders/${encodeURIComponent(String(id))}/cancel`); }
}

/**
 * Gift cards: a code with a balance, used like a discount code (typed on Stripe's page, or `discount_code` on a
 * checkout). Whatever isn't spent stays on the card. To sell them, mark a product with metadata { gift_card: "true" }:
 * paying issues one card per unit and emails it (to the line's properties.recipient_email, else the buyer).
 */
class GiftCards extends Resource {
  /** value in cents. With send: true, the code is emailed to recipient_email (with your optional message). */
  create(params: { value: number; recipient_email?: string | null; note?: string | null; expires_at?: string | null; send?: boolean; message?: string | null }) {
    return this.client.request<GiftCard>("POST", "/v1/gift_cards", { body: params });
  }
  list(params: { limit?: number } = {}) { return this.client.request<List<GiftCard>>("GET", "/v1/gift_cards", { query: params }); }
  /** By id, full code or last 4 characters; includes the orders that used it. */
  get(idOrCode: string) { return this.client.request<GiftCard & { uses: { order_id: string; order_number: number; amount: number; at: string }[] }>("GET", `/v1/gift_cards/${encodeURIComponent(idOrCode)}`); }
  /** active: false disables it; balance sets what's left (e.g. to add value). */
  update(idOrCode: string, params: { active?: boolean; balance?: number; note?: string | null; expires_at?: string | null }) {
    return this.client.request<GiftCard>("PATCH", `/v1/gift_cards/${encodeURIComponent(idOrCode)}`, { body: params });
  }
  send(idOrCode: string, params: { to?: string; message?: string } = {}) {
    return this.client.request<GiftCard & { sent_to: string }>("POST", `/v1/gift_cards/${encodeURIComponent(idOrCode)}/send`, { body: params });
  }
}

/**
 * Subscriptions: give a variant `recurring: { interval: "month" }` and checkouts that include it become subscriptions.
 * Every renewal Stripe charges becomes a new order (stock, emails and fulfillment as usual).
 */
class Subscriptions extends Resource {
  list(params: { status?: string; email?: string } = {}) { return this.client.request<List<Subscription>>("GET", "/v1/subscriptions", { query: params }); }
  /** With the orders it produced. */
  get(id: string) { return this.client.request<Subscription & { orders: { id: string; number: number; total: number; status: string; created_at: string }[] }>("GET", `/v1/subscriptions/${encodeURIComponent(id)}`); }
  /** Stops at the end of the period already paid for, or now with { at_period_end: false }. */
  cancel(id: string, params: { at_period_end?: boolean } = {}) { return this.client.request<Subscription>("POST", `/v1/subscriptions/${encodeURIComponent(id)}/cancel`, { body: params }); }
  /** Undo a cancellation that hasn't taken effect yet. */
  resume(id: string) { return this.client.request<Subscription>("POST", `/v1/subscriptions/${encodeURIComponent(id)}/resume`); }
  /** Test stores: run the next renewal now and get the order it creates. */
  simulateRenewal(id: string) { return this.client.request<Order>("POST", `/v1/subscriptions/${encodeURIComponent(id)}/simulate_renewal`); }
}

class Discounts extends Resource {
  /** e.g. { code: "SUMMER20", kind: "percent", value: 20 } or { code: "FIVEOFF", kind: "amount", value: 500 }. */
  create(params: DiscountParams) { return this.client.request<Discount>("POST", "/v1/discounts", { body: params }); }
  list() { return this.client.request<List<Discount>>("GET", "/v1/discounts"); }
  /** By id or code. */
  get(idOrCode: string) { return this.client.request<Discount>("GET", `/v1/discounts/${encodeURIComponent(idOrCode)}`); }
  update(idOrCode: string, params: Partial<DiscountParams>) {
    return this.client.request<Discount>("PATCH", `/v1/discounts/${encodeURIComponent(idOrCode)}`, { body: params });
  }
  delete(idOrCode: string) { return this.client.request<{ id: string; deleted: true }>("DELETE", `/v1/discounts/${encodeURIComponent(idOrCode)}`); }
}

class Reports extends Resource {
  /** Every order with its tax, for an accountant. Dates are YYYY-MM-DD (default: the last 365 days). */
  taxOrders(params: { from?: string; to?: string } = {}) {
    return this.client.request<{ object: "list"; truncated: boolean; data: { order_number: number; date: string; status: string; city: string | null; state: string | null; postal_code: string | null; country: string | null; subtotal: number; discount: number; shipping: number; tax: number; total: number; refunded: number; currency: string }[] }>("GET", "/v1/reports/tax/orders", { query: params });
  }
  /** Sales and tax by state over the last `days` (default 365). `watch` flags US states near common registration thresholds. */
  tax(params: { days?: number } = {}) {
    return this.client.request<{ object: "tax_report"; days: number; currency: string; note: string; totals: { sales: number; tax_collected: number; orders: number };
      data: { country: string; state: string | null; orders: number; sales: number; tax_collected: number; registered: boolean; watch: boolean }[] }>("GET", "/v1/reports/tax", { query: params });
  }
  /** Sales over the last `days` (default 30, max 366): totals vs the previous period, a time series and top products. */
  sales(params: { days?: number } = {}) { return this.client.request<SalesReport>("GET", "/v1/reports/sales", { query: params }); }
}

/**
 * Printify, through the shop the store connected (your agent never needs the Printify token).
 * Find a blueprint → a print provider → its variants, then create the product in Printify.
 */
class PrintifyResource extends Resource {
  /** Search Printify's catalog, e.g. blueprints({ q: "heavy cotton tee" }). */
  blueprints(params: { q?: string; limit?: number } = {}) {
    return this.client.request<{ object: "list"; data: { id: number; title: string; brand: string; model: string; images: string[] }[]; total: number }>("GET", "/v1/fulfillment/printify/blueprints", { query: params });
  }
  providers(blueprintId: number) {
    return this.client.request<{ object: "list"; data: { id: number; title: string; location: unknown }[] }>("GET", `/v1/fulfillment/printify/blueprints/${blueprintId}/providers`);
  }
  /** Variant ids per size/color, the option values, and the print placements ("front", "back"…). */
  variants(blueprintId: number, providerId: number) {
    return this.client.request<{ object: "printify_variants"; options: Record<string, string[]>; data: { id: number; title: string; options: Record<string, string>; placements: { position: string; width: number; height: number }[] }[] }>(
      "GET", `/v1/fulfillment/printify/blueprints/${blueprintId}/providers/${providerId}/variants`);
  }
  /**
   * Create a CommerceForAI product in your Printify shop (artwork uploaded, variants priced, mockups made) and map
   * its variants so paid orders go to production. Variants are matched by option values; pass fixed_options for
   * options yours don't have (e.g. { color: "Black" }), or variant_map to map explicitly.
   */
  /** The connected Printify store and its sales channel ("etsy", "shopify", … or "custom_integration"). */
  shop() { return this.client.request<{ shop_id: string; title: string | null; sales_channel: string }>("GET", "/v1/fulfillment/printify/shop"); }
  /** Publish a product already created in Printify to the store's sales channel, e.g. Etsy. */
  publish(productId: string) {
    return this.client.request<{ object: "printify_publish"; published: true; sales_channel: string; printify_product_id: string; note: string }>("POST", `/v1/products/${encodeURIComponent(productId)}/printify/publish`);
  }
  createProduct(productId: string, params: {
    blueprint_id: number; print_provider_id: number;
    print_files?: { placement: string; url: string }[];
    fixed_options?: Record<string, string>;
    variant_map?: Record<string, number>;
    use_mockups?: boolean;
    /** Also publish to the Printify store's sales channel (e.g. Etsy). */
    publish?: boolean;
  }) {
    return this.client.request<{ object: "printify_product"; printify_product_id: string; mockups: string[]; product: Product }>(
      "POST", `/v1/products/${encodeURIComponent(productId)}/printify`, { body: params });
  }
}

export interface HostedFile {
  object: "file"; id: string;
  /** Permanent public URL on cdn.commerceforai.com. */
  url: string;
  filename: string | null; content_type: "image/png" | "image/jpeg" | "image/webp"; bytes: number;
  width: number | null; height: number | null; source_url: string | null; created_at: string;
}

/**
 * Image hosting (product photos, logos, print files): PNG, JPEG or WebP up to 25 MB, 5 GB per store.
 * Photo metadata is removed; the same image is stored once; URLs never change.
 */
class Files extends Resource {
  /**
   * Upload bytes (Blob, File, Buffer, Uint8Array) or copy from a link.
   * ```ts
   * await commerce.files.upload(readFileSync("art/half-dome.png"), { filename: "half-dome.png" });
   * await commerce.files.upload({ url: "https://example.com/photo.jpg" });
   * ```
   */
  upload(input: Blob | ArrayBuffer | Uint8Array | { url: string }, opts: { filename?: string } = {}) {
    if (input && typeof input === "object" && "url" in input && typeof (input as { url: unknown }).url === "string")
      return this.client.request<HostedFile>("POST", "/v1/files", { body: { url: (input as { url: string }).url } });
    const bytes = input instanceof Blob ? input : new Blob([input as BlobPart]);
    return bytes.arrayBuffer().then((buf) => this.client.request<HostedFile>("POST", "/v1/files", {
      body: { data: base64(new Uint8Array(buf)), filename: opts.filename ?? (input instanceof File ? input.name : undefined) },
    }));
  }
  list(params: { limit?: number; starting_after?: string } = {}) {
    return this.client.request<List<HostedFile> & { usage: { bytes: number; files: number; quota_bytes: number } }>("GET", "/v1/files", { query: params });
  }
  delete(id: string) { return this.client.request<{ id: string; deleted: true }>("DELETE", `/v1/files/${encodeURIComponent(id)}`); }
  /**
   * Copy products' outside images (and print files) onto the CDN so a moved or deleted source can't break the store.
   */
  copyProductImages(productId: string) {
    return this.client.request<{ product_id: string; copied: number; errors: { url: string; message: string }[] }>("POST", `/v1/products/${encodeURIComponent(productId)}/copy-images`);
  }
  /** The same for every product with outside images, up to `limit` (≤50) per call. Repeat until `remaining` is 0. */
  copyAllProductImages(opts: { limit?: number } = {}) {
    return this.client.request<{ processed: number; copied: number; remaining: number; errors: { product_id: string; url: string; message: string }[] }>("POST", "/v1/products/copy-images", { body: opts });
  }
}

function base64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

class Returns extends Resource {
  /** Open a return for items on a shipped order. */
  create(orderId: string | number, params: { items: { variant_id: string; quantity: number }[]; reason?: string }) {
    return this.client.request<Return>("POST", `/v1/orders/${encodeURIComponent(String(orderId))}/returns`, { body: params });
  }
  list(params: { status?: Return["status"]; order_id?: string | number; limit?: number } = {}) {
    return this.client.request<List<Return>>("GET", "/v1/returns", { query: { ...params, order_id: params.order_id?.toString() } });
  }
  get(id: string) {
    return this.client.request<Return>("GET", `/v1/returns/${encodeURIComponent(id)}`);
  }
  /** Approve. `return_label: "cheapest"` buys a prepaid return label and includes it in the customer email. */
  approve(id: string, params: { return_label?: "cheapest" | { rate_id: string }; note?: string } = {}) {
    return this.client.request<Return>("POST", `/v1/returns/${encodeURIComponent(id)}/approve`, { body: params });
  }
  reject(id: string, params: { note?: string } = {}) {
    return this.client.request<Return>("POST", `/v1/returns/${encodeURIComponent(id)}/reject`, { body: params });
  }
  /** Items arrived: restock (default true) and refund their value (default true; shipping not included). */
  receive(id: string, params: { restock?: boolean; refund?: boolean; refund_amount?: number } = {}) {
    return this.client.request<Return>("POST", `/v1/returns/${encodeURIComponent(id)}/receive`, { body: params });
  }
}

class Emails extends Resource {
  /** Log of customer emails sent (or queued) for your store. */
  list(params: { order_id?: string | number } = {}) {
    return this.client.request<List<Email>>("GET", "/v1/emails", { query: { order_id: params.order_id?.toString() } });
  }
  /** Render a customer email with your branding and sample data. Templates: order_confirmation, order_shipped, order_refunded, return_approved, checkout_recovery. */
  preview(template: EmailTemplate) {
    return this.client.request<{ template: EmailTemplate; subject: string; html: string; text: string }>("GET", `/v1/emails/preview/${template}`);
  }
  /** Send previews to the store owner (or the signed-in member): one template, or "all". */
  sendTest(params: { template?: EmailTemplate | "all" } = {}) {
    return this.client.request<{ sent: number; to: string; templates: EmailTemplate[] }>("POST", "/v1/emails/test", { body: params });
  }
}
export interface StoreSyncPlan {
  object: "sync_plan"; plan_id: string; has_changes: boolean; direction: "test_to_live" | "live_to_test";
  source: { id: string; name: string; mode: string }; destination: { id: string; name: string; mode: string };
  products: {
    create: { source_id: string; name: string; variants: number }[];
    update: { id: string; name: string; fields: string[]; new_variants: number; updated_variants: number; prices: { variant: string; from: number; to: number }[] }[];
    unchanged: number; only_in_destination: { id: string; name: string }[];
  };
  collections: { create: string[]; update: string[] }; discounts: { create: string[]; update: string[] }; settings: string[];
}
export type EmailTemplate = "order_confirmation" | "order_shipped" | "package_shipped" | "package_delivered" | "invoice" | "order_refunded" | "return_approved" | "checkout_recovery";

class Events extends Resource {
  /** Poll events in order. Pass the last id you processed as `after`. `type` accepts wildcards like `order.*`. */
  list(params: { after?: string; type?: EventType | `${string}.*`; limit?: number } = {}) {
    return this.client.request<List<Event>>("GET", "/v1/events", { query: params });
  }
}

export interface ChatgptChannel {
  object: "chatgpt_channel";
  status: "not_applied" | "applied" | "approved" | "not_approved";
  applied_at: string | null;
  decided_at: string | null;
  ready_to_apply: boolean;
  steps: { key: string; status: "done" | "todo" | "warning"; message: string; fix?: string }[];
  feed: Pick<FeedCheck, "items" | "items_ok" | "errors" | "warnings" | "formats">;
  application: { url: string; answers: Record<string, string | boolean | null>; you_provide: string[] };
  categories: string[];
  next: string;
}
export interface FeedCheck {
  object: "feed_check";
  target: "openai";
  items: number;
  items_ok: number;
  ready: boolean;
  errors: { item_id: string | null; field: string; message: string }[];
  warnings: { item_id: string | null; field: string; message: string }[];
  formats: { json: string; jsonl_gz: string };
  delivery: string;
}
export interface SetupItem { key: string; status: "done" | "todo" | "warning" | "optional"; message: string; fix?: string }
export interface SetupStatus {
  object: "setup_status";
  store_id: string;
  mode: "test" | "live";
  ready_for_real_orders: boolean;
  ready_for_test_orders: boolean;
  next_step: SetupItem | null;
  items: SetupItem[];
  tip?: string;
}
export interface SimulatedOrder {
  object: "simulated_order";
  order: Order;
  checkout_id: string;
  events: string[];
  webhooks: { url: string; deliveries: number }[];
  emails_that_would_send: { event: string; to: string | null; subject: string }[];
  notes: string[];
}

export interface CatalogImport {
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at?: string;
  products_created: number;
  products_updated: number;
  variants_created: number;
  variants_updated: number;
  error?: string;
}

export interface GoLiveLink {
  object: "go_live_link";
  url: string;
  expires_at: string;
  steps: string[];
}

class StoreResource extends Resource {
  get() {
    return this.client.request<Store>("GET", "/v1/store");
  }
  /**
   * Note on `tax_enabled`: Stripe only collects tax in jurisdictions where you have an active
   * tax registration in Stripe Tax. Turning this on without registrations collects $0 tax.
   */
  /** Sales tax readiness: Stripe Tax status, registrations, what to do next, and the tax categories to choose from. */
  tax() {
    return this.client.request<{ object: "tax_overview"; enabled: boolean; default_tax_code: string | null; prices_include_tax: boolean; links: { registrations: string; thresholds: string; filing: string; transactions: string } | null; collecting: boolean; next_step: string | null; fix_url: string | null; note: string;
      stripe: { status: string; missing_fields: string[]; registrations: { country: string; state: string | null }[] };
      last_error: { message: string; at: string } | null; categories: { code: string; name: string }[] }>("GET", "/v1/store/tax");
  }
  /**
   * Preview a sync from this store's other version (test or live) into this store. Nothing changes.
   * Syncs cover products, prices, images, collections, discounts and shipping/email settings; never orders, keys, Stripe, site URLs or stock counts.
   */
  syncPreview() { return this.client.request<StoreSyncPlan>("GET", "/v1/store/sync"); }
  /** Apply a sync into this store. Into a live store, pass the `plan_id` from syncPreview(). */
  sync(params: { plan_id?: string } = {}) {
    return this.client.request<{ object: "sync_result"; products_created: number; products_updated: number; collections: number; discounts: number; settings: string[]; discount_errors: { code: string; message: string }[] }>("POST", "/v1/store/sync", { body: params });
  }
  update(params: {
    name?: string; tax_enabled?: boolean; /** Stripe tax code for products without their own, e.g. "txcd_30011000" (clothing). */ default_tax_code?: string | null;
    /** Your prices already include tax (common outside the US). */ prices_include_tax?: boolean;
    default_success_url?: string | null; default_cancel_url?: string | null;
    builtin_emails?: boolean; recovery_emails?: boolean; hosted_pages?: boolean;
    /** Test stores: also send test-card orders to Printify/Printful (default false: they'd be printed and billed for real). */
    send_test_orders_to_providers?: boolean;
    /** Customer email branding. Logo is an https image URL; accent is a hex color like "#2f6f4e". */
    email_brand?: { logo_url?: string | null; accent_color?: string | null; address?: string | null };
    /** Emails to your team: each new order, and when a variant's stock falls to the threshold (null turns it off). */
    owner_alerts?: { new_order?: boolean; low_stock_threshold?: number | null; delivery_problem?: boolean };
    /** Email the customer when a package is delivered (default true). */
    delivered_emails?: boolean;
    /** Days after delivery that customers can ask for a return from their account page (default 30). null: only you open returns. */
    returns_window_days?: number | null;
    /** Show shoppers abroad prices in their own currency at checkout (Stripe Adaptive Pricing); you're paid in the store's currency. */
    local_currencies?: boolean;
  }) {
    return this.client.request<Store>("PATCH", "/v1/store", { body: params });
  }
  /**
   * Would OpenAI's ChatGPT shopping accept this store's product feed? Per-item errors (rejected) and
   * warnings (weaker listings), plus where the feed lives (JSON and the jsonl.gz upload format).
   */
  checkFeed() {
    return this.client.request<FeedCheck>("GET", "/v1/feeds/openai/check");
  }
  /** Sell in ChatGPT: readiness steps, suggested answers for OpenAI's merchant application, and status. */
  chatgpt() {
    return this.client.request<ChatgptChannel>("GET", "/v1/channels/chatgpt");
  }
  /** Record the application's progress (after the owner submits it) or the product category to apply with. */
  updateChatgpt(params: { status?: ChatgptChannel["status"]; category?: string | null; note?: string }) {
    return this.client.request<ChatgptChannel>("PATCH", "/v1/channels/chatgpt", { body: params });
  }
  /** Everything between this store and real orders, each with the exact fix. Start here when setting up. */
  setupStatus() {
    return this.client.request<SetupStatus>("GET", "/v1/setup_status");
  }
  /**
   * Test stores only: run a purchase end to end without a browser. Stock is reserved and committed, the
   * order is created and paid, events and your webhooks fire; `fulfill: true` also marks it shipped.
   * Never charges a card, reaches Printify/Printful, emails anyone, or counts toward usage.
   */
  simulateOrder(params: {
    items: { variant_id: string; quantity: number; properties?: Record<string, string> }[];
    customer_email?: string; customer_name?: string;
    shipping_address?: { line1: string; line2?: string; city: string; state?: string; postal_code: string; country: string };
    discount_code?: string;
    shipping_rate?: { name: string; amount: number }; fulfill?: boolean; metadata?: Record<string, string>;
  }) {
    return this.client.request<SimulatedOrder>("POST", "/v1/simulate/order", { body: params });
  }
  /**
   * A one-time link (valid 7 days) to hand to a person when the store is ready for real orders. Opening it
   * signs them in, claims the store if it's an unclaimed sandbox, creates a live copy (products, prices,
   * inventory, settings and connections), and takes them to Connect Stripe. Test stores only.
   */
  goLiveLink() {
    return this.client.request<GoLiveLink>("POST", "/v1/go_live_links", { body: {} });
  }
  /**
   * Shipping every checkout offers unless it passes its own rates: up to 5 flat rates (cents), the
   * countries you ship to, and an optional free-shipping threshold on the item subtotal (cents).
   */
  configureCheckoutShipping(params: { countries: string[]; rates: { name: string; amount: number; min_days?: number; max_days?: number }[]; free_over?: number | null }) {
    return this.client.request<Store>("PUT", "/v1/store/checkout-shipping", { body: params });
  }
  /** Connect your EasyPost or Shippo account for label purchasing. */
  configureShipping(params: { provider: "easypost" | "shippo"; api_key: string; ship_from: ShipFromAddress; default_parcel?: Dimensions }) {
    return this.client.request<Store>("PUT", "/v1/store/shipping", { body: params });
  }
  /**
   * Connect Printful or Printify (call once per provider; both can be connected — each variant routes to the
   * provider it's mapped to). Paid orders with mapped variants are sent automatically — held for your
   * approval in the provider's dashboard unless `auto_confirm: true`. Shipments mark orders fulfilled.
   */
  configureFulfillment(params:
    | { provider: "printful"; api_key: string; printful_store_id?: string; auto_confirm?: boolean; import_catalog?: boolean }
    | { provider: "printify"; api_key: string; printify_shop_id: string; auto_confirm?: boolean; import_catalog?: boolean }) {
    return this.client.request<Store & { fulfillment_webhook: { url: string | null; registered: boolean; error?: string } }>("PUT", "/v1/store/fulfillment", { body: params });
  }
  /**
   * Import products from Shopify: pass Shopify's product export CSV (Products → Export) as `csv`, or
   * `shop` (your-store.myshopify.com) + a custom app `access_token` (read_products, read_inventory).
   * Safe to re-run: products match by Shopify id or SKU and existing prices and stock are kept.
   */
  importFromShopify(params: ({ csv: string } | { shop: string; access_token: string } | {}) & {
    /** Shopify's order export (Orders → Export): past orders come over as history, never charged, emailed or counted toward fees. */
    orders_csv?: string;
    /** Shopify's customer export (Customers → Export): carries over who is tax-exempt. */
    customers_csv?: string;
  }) {
    return this.client.request<Partial<CatalogImport> & { object: "import"; source: "shopify"; products_seen?: number; warnings: string[];
      orders_imported?: number; orders_already_imported?: number; line_items?: number; line_items_matched_to_products?: number; customers_seen?: number; tax_exempt_marked?: number }>(
      "POST", "/v1/import/shopify", { body: params });
  }
  /**
   * Import the products already set up in a connected Printify shop or Printful store (both when omitted).
   * Runs in the background and happens automatically on connect; safe to re-run. Progress: `store.get()` → fulfillment[].catalog_import.
   */
  importCatalog(params: { provider?: "printful" | "printify" } = {}) {
    return this.client.request<{ object: "list"; data: ({ provider: "printful" | "printify" } & CatalogImport)[] }>("POST", "/v1/catalog/import", { body: params });
  }
  /** Disconnect one provider, or all when omitted. */
  disableFulfillment(provider?: "printful" | "printify") {
    return this.client.request<Store>("DELETE", "/v1/store/fulfillment", { query: { provider } });
  }
  /** Send customer emails (confirmation, shipped, refunded, return approved) from your domain via Resend. */
  configureEmails(params: { resend_api_key: string; from: string; reply_to?: string; events?: ("order.paid" | "order.fulfilled" | "order.refunded" | "return.approved")[] }) {
    return this.client.request<Store>("PUT", "/v1/store/emails", { body: params });
  }
  disableEmails() {
    return this.client.request<Store>("DELETE", "/v1/store/emails");
  }
  /**
   * Publish product feeds for AI shopping surfaces (OpenAI/ACP JSON, Google Merchant XML) and,
   * with `agent_access: true`, a public API third-party shopping agents can use to create checkout links.
   */
  configureStorefront(params: StorefrontConfig & { agent_access?: boolean }) {
    return this.client.request<Store>("PUT", "/v1/store/storefront", { body: params });
  }
}

class Webhooks extends Resource {
  create(params: { url: string; events?: (EventType | "*" | `${string}.*`)[] }) {
    return this.client.request<WebhookEndpoint>("POST", "/v1/webhook-endpoints", { body: params });
  }
  list() {
    return this.client.request<List<WebhookEndpoint>>("GET", "/v1/webhook-endpoints");
  }
  remove(id: string) {
    return this.client.request<{ id: string; deleted: true }>("DELETE", `/v1/webhook-endpoints/${encodeURIComponent(id)}`);
  }
  /** Verify a webhook we sent you. Throws if the signature is invalid or too old. */
  verify(args: { payload: string; headers: Headers | Record<string, string | undefined>; secret: string; toleranceSeconds?: number }) {
    return verifyWebhook(args);
  }
}

/**
 * Verify a CommerceForAI webhook (Standard Webhooks format). Works in Node 18+, Bun, Deno and edge runtimes.
 * Pass the raw request body string, not parsed JSON.
 */
export async function verifyWebhook({
  payload, headers, secret, toleranceSeconds = 300,
}: {
  payload: string;
  headers: Headers | Record<string, string | undefined>;
  secret: string;
  toleranceSeconds?: number;
}): Promise<Event> {
  const get = (k: string) =>
    headers instanceof Headers ? headers.get(k) ?? undefined : headers[k] ?? headers[k.toLowerCase()];
  const msgId = get("webhook-id");
  const ts = get("webhook-timestamp");
  const sigHeader = get("webhook-signature");
  if (!msgId || !ts || !sigHeader) throw new Error("Missing webhook-id, webhook-timestamp or webhook-signature header");
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > toleranceSeconds) throw new Error("Webhook timestamp outside tolerance");

  const keyBytes = base64ToBytes(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${msgId}.${ts}.${payload}`)));
  const expected = bytesToBase64(mac);
  const ok = sigHeader.split(" ").some((part) => {
    const [ver, sig] = part.split(",");
    return ver === "v1" && sig !== undefined && timingSafeEqual(sig, expected);
  });
  if (!ok) throw new Error("Invalid webhook signature");
  return JSON.parse(payload) as Event;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function base64ToBytes(b64: string) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}
function bytesToBase64(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export default Commerce;

export { createCheckoutHandler, type CheckoutHandlerOptions } from "./checkout-handler.js";
export * from "./cart-core.js";
