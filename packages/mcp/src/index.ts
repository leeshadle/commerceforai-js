#!/usr/bin/env node
/**
 * CommerceForAI MCP server — lets an AI agent run a store, inside limits you set.
 *
 * Env:
 *   COMMERCEFORAI_API_KEY        required
 *   COMMERCEFORAI_BASE_URL       default https://api.commerceforai.com
 *   COMMERCEFORAI_MAX_REFUND     max refund per call, in cents (default 5000 = $50; 0 disables refunds)
 *   COMMERCEFORAI_MAX_LABEL_COST max shipping label cost, in cents (default 5000 = $50)
 *   COMMERCEFORAI_READ_ONLY      "true" exposes only read tools
 *   COMMERCEFORAI_TOOLS          optional comma-separated allowlist of tool names
 */
import { Commerce, type Result } from "commerceforai";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export interface GuardrailConfig {
  maxRefund: number;
  maxLabelCost?: number;
  readOnly: boolean;
  allow: Set<string> | null;
}

export const VERSION = "0.1.8";

/** Tool groups. Loading only what a task needs keeps the agent's context small ("core" is ~20 tools). */
export const TOOLSETS: Record<string, string[]> = {
  core: ["get_store", "setup_status", "simulate_order", "list_products", "get_product", "create_product", "create_products", "update_product", "update_variant",
    "list_inventory", "adjust_inventory", "create_checkout", "list_orders", "get_order", "fulfill_order", "refund_order", "add_order_note", "list_events",
    "configure_checkout_shipping", "create_go_live_link"],
  catalog: ["list_collections", "save_collection", "delete_collection", "upload_image", "copy_product_images", "import_from_shopify", "import_catalog"],
  print_on_demand: ["printify_catalog", "create_in_printify", "publish_in_printify", "submit_fulfillment", "import_catalog"],
  shipping: ["get_shipping_rates", "buy_shipping_label", "list_returns", "create_return", "approve_return", "reject_return", "receive_return"],
  marketing: ["list_discounts", "save_discount", "delete_discount", "issue_gift_card", "list_gift_cards", "update_gift_card", "brand_emails", "send_test_emails", "chatgpt_channel", "update_chatgpt_channel", "check_product_feed"],
  insights: ["list_customers", "get_customer", "set_customer_tax_exempt", "sales_report", "sales_tax_status", "configure_sales_tax", "sales_by_state", "tax_orders"],
  sync: ["preview_store_sync", "apply_store_sync"],
  billing: ["edit_order", "save_draft_order", "send_invoice", "list_draft_orders", "list_subscriptions", "cancel_subscription"],
};

/** "core,shipping" → the set of tool names; unknown names are ignored; empty/"all" → null (every tool). */
export function toolsFor(toolsets: string | null | undefined): Set<string> | null {
  const names = (toolsets ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length || names.includes("all")) return null;
  const tools = names.flatMap((n) => TOOLSETS[n] ?? []);
  return tools.length ? new Set(tools) : null;
}

const INSTRUCTIONS = `CommerceForAI runs a store on the owner's own Stripe account: products, stock, checkout, orders, shipping, returns and print-on-demand.
Start with setup_status: it lists what's left before the store can take orders, each with the exact fix.
All money is an integer in cents (2500 = $25.00). Keys starting cfa_test_ are a test store: nothing is charged, and simulate_order proves the flow end to end.
Tools that move money or reach customers (refund_order, buy_shipping_label, apply_store_sync into a live store, publish_in_printify, configure_sales_tax) need the owner's OK first.
Errors say what to change; a "warnings" list in a result means a field you sent was ignored.
Fewer tools: connect with ?toolsets=core (or core,shipping,…; groups: ${Object.keys(TOOLSETS).join(", ")}), or set COMMERCEFORAI_TOOLSETS for the local server.
Full guide: https://commerceforai.com/llms.txt`;

export function configFromEnv(env = process.env): GuardrailConfig {
  return {
    maxRefund: env.COMMERCEFORAI_MAX_REFUND !== undefined ? Number(env.COMMERCEFORAI_MAX_REFUND) : 5000,
    maxLabelCost: env.COMMERCEFORAI_MAX_LABEL_COST !== undefined ? Number(env.COMMERCEFORAI_MAX_LABEL_COST) : 5000,
    readOnly: env.COMMERCEFORAI_READ_ONLY === "true",
    allow: env.COMMERCEFORAI_TOOLS ? new Set(env.COMMERCEFORAI_TOOLS.split(",").map((s) => s.trim())) : toolsFor(env.COMMERCEFORAI_TOOLSETS),
  };
}

const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

function out<T>(r: Result<T>) {
  return r.error ? text(`Error (${r.error.type}): ${r.error.message}${r.error.param ? ` [param: ${r.error.param}]` : ""}\n${JSON.stringify(r.error)}`, true) : text(r.data);
}

const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export function buildServer(commerce: Commerce, cfg: GuardrailConfig) {
  const server = new McpServer({ name: "commerceforai", version: VERSION }, { instructions: INSTRUCTIONS });

  const tool = <S extends z.ZodRawShape>(
    name: string,
    def: { description: string; input: S; write?: boolean; destructive?: boolean },
    run: (args: z.infer<z.ZodObject<S>>) => Promise<ReturnType<typeof text>>,
  ) => {
    if (cfg.allow && !cfg.allow.has(name)) return;
    if (def.write && cfg.readOnly) return;
    server.registerTool(
      name,
      {
        description: def.description,
        inputSchema: def.input,
        annotations: { readOnlyHint: !def.write, destructiveHint: !!def.destructive, openWorldHint: false },
      },
      (async (args: any) => {
        try { return await run(args); } catch (e) { return text(`Unexpected error: ${e instanceof Error ? e.message : e}`, true); }
      }) as any,
    );
  };

  // ---------- read ----------
  tool("get_store", { description: "Store settings: name, currency, test/live mode, whether Stripe events are connected. If stripe_branding.matches is false, tell the owner what customers see and the suggested values; only they can change it in Stripe (fix_url).", input: {} },
    async () => out(await commerce.store.get()));

  tool("chatgpt_channel", {
    description: "Sell in ChatGPT: readiness steps (live store, products, storefront links, feed passes OpenAI's rules), the answers to give on OpenAI's merchant application, and the application status. The owner submits the application themselves at chatgpt.com/merchants (it asks for their personal details).",
    input: {},
  }, async () => out(await commerce.store.chatgpt()));

  tool("update_chatgpt_channel", {
    description: "Record ChatGPT application progress after the owner tells you (status: applied, approved, not_approved), or set the product category to apply with.",
    input: { status: z.enum(["not_applied", "applied", "approved", "not_approved"]).optional(), category: z.string().optional(), note: z.string().optional() },
    write: true,
  }, async (a) => out(await commerce.store.updateChatgpt(a)));

  tool("check_product_feed", {
    description: "Would ChatGPT shopping (OpenAI's product feed spec) accept this store's catalog? Returns per-item errors (would be rejected: e.g. missing JPEG/PNG image, no product URL) and warnings (weaker listings), so you can fix them before the owner applies at chatgpt.com/merchants.",
    input: {},
  }, async () => out(await commerce.store.checkFeed()));

  tool("setup_status", {
    description: "Start here. Everything between this store and real orders, each with status (done/todo/warning/optional) and the exact fix; plus ready_for_real_orders and next_step.",
    input: {},
  }, async () => out(await commerce.store.setupStatus()));

  tool("simulate_order", {
    description: "Test stores only: run a purchase end to end without a browser to prove the integration works. Reserves and commits stock, creates a paid order, fires events and the app's webhooks; fulfill: true also marks it shipped. Returns the events, webhook deliveries and the emails a real order would send. Never charges a card, reaches Printify/Printful, emails anyone, or counts toward usage.",
    input: {
      items: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().min(1), properties: z.record(z.string(), z.string()).optional() })).min(1),
      customer_email: z.string().email().optional(),
      discount_code: z.string().optional().describe("Apply a discount code, as a shopper would"),
      fulfill: z.boolean().optional(),
      shipping_rate: z.object({ name: z.string(), amount: z.number().int().min(0) }).optional(),
    },
    write: true,
  }, async (a) => out(await commerce.store.simulateOrder(a)));

  tool("configure_checkout_shipping", {
    description: "Set the shipping every checkout offers (unless a checkout passes its own): up to 5 flat rates in cents with optional delivery days, the countries the store ships to, and an optional free-shipping threshold on the item subtotal in cents. Without this, checkouts charge $0 shipping.",
    input: {
      countries: z.array(z.string().length(2)).min(1),
      rates: z.array(z.object({ name: z.string(), amount: z.number().int().min(0), min_days: z.number().int().positive().optional(), max_days: z.number().int().positive().optional() })).min(1).max(5),
      free_over: z.number().int().min(0).nullable().optional(),
    },
    write: true,
  }, async (a) => out(await commerce.store.configureCheckoutShipping(a)));

  tool("import_from_shopify", {
    description: "Move products from Shopify: pass shop (your-store.myshopify.com) and a custom app access_token with read_products and read_inventory, or csv with the contents of Shopify's product export (Products → Export). Imports products, variants (options, SKUs, prices), stock, images and descriptions. Safe to re-run: matches by Shopify id or SKU and keeps existing prices and stock.",
    input: {
      shop: z.string().optional(), access_token: z.string().optional(), csv: z.string().optional(),
      orders_csv: z.string().optional().describe("Contents of Shopify's order export (Orders → Export). Past orders come over as history: never charged, emailed, fulfilled or counted toward fees."),
      customers_csv: z.string().optional().describe("Contents of Shopify's customer export (Customers → Export). Carries over who is tax-exempt."),
    },
    write: true,
  }, async (a) => out(await commerce.store.importFromShopify({
    ...(a.csv ? { csv: a.csv } : a.shop ? { shop: a.shop, access_token: a.access_token ?? "" } : {}),
    ...(a.orders_csv ? { orders_csv: a.orders_csv } : {}), ...(a.customers_csv ? { customers_csv: a.customers_csv } : {}),
  } as any)));

  tool("import_catalog", {
    description: "Import the products already set up in the connected Printify shop or Printful store (both if provider is omitted). Happens automatically when a provider is connected; safe to re-run. Runs in the background: check get_store → fulfillment[].catalog_import for progress.",
    input: { provider: z.enum(["printful", "printify"]).optional() },
    write: true,
  }, async (a) => out(await commerce.store.importCatalog(a)));

  tool("create_go_live_link", {
    description: "When the store is ready for real orders, create a one-time link to give the person. Opening it signs them in, claims the store if needed, creates a live copy with the same products and settings, and takes them to Connect Stripe. Test stores only; the link lasts 7 days.",
    input: {},
    write: true,
  }, async () => out(await commerce.store.goLiveLink()));

  tool("list_products", {
    description: "List products with their variants, prices (in cents) and stock. Pass collection (id or handle) to list one collection's products.",
    input: { limit: z.number().int().min(1).max(100).optional(), starting_after: z.string().optional(), active: z.boolean().optional(), collection: z.string().optional(), q: z.string().optional() },
  }, async (a) => out(await commerce.products.list(a)));

  tool("get_product", { description: "Get one product by id.", input: { product_id: z.string() } },
    async (a) => out(await commerce.products.get(a.product_id)));

  tool("list_inventory", {
    description: "Tracked variants sorted by available stock (lowest first). Use low_stock_threshold to only see items at or below it.",
    input: { low_stock_threshold: z.number().int().optional() },
  }, async (a) => out(await commerce.inventory.list(a)));

  tool("list_orders", {
    description: "List orders, newest first. Filter by status: pending_payment, paid (ready to ship), fulfilled, cancelled, refunded.",
    input: {
      status: z.array(z.enum(["pending_payment", "paid", "fulfilled", "cancelled", "refunded"])).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      starting_after: z.string().optional(),
    },
  }, async (a) => out(await commerce.orders.list(a)));

  tool("get_order", { description: "Get an order by id (ord_...) or number (e.g. 1001).", input: { order: z.string() } },
    async (a) => out(await commerce.orders.get(a.order)));

  tool("list_events", {
    description: "Read the store's event log in order (order.created, order.paid, inventory.updated, ...). Pass the last seen event id as `after` to get only new events.",
    input: { after: z.string().optional(), type: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
  }, async (a) => out(await commerce.events.list(a as any)));

  // ---------- write ----------
  tool("create_product", {
    description: "Create a product. Prices are in cents. For sizes/colors pass `variants`; otherwise pass `price` (and optionally `inventory`). Omit inventory for unlimited stock.",
    write: true,
    input: {
      name: z.string(),
      description: z.string().optional(),
      images: z.array(z.string().url()).optional(),
      price: z.number().int().nonnegative().optional(),
      inventory: z.number().int().nonnegative().optional(),
      sku: z.string().optional(),
      variants: z.array(z.object({
        name: z.string(), price: z.number().int().nonnegative(), sku: z.string().optional(),
        inventory: z.number().int().nonnegative().optional(), options: z.record(z.string(), z.string()).optional(),
        recurring: z.object({ interval: z.enum(["day", "week", "month", "year"]), interval_count: z.number().int().min(1).max(12).optional() }).optional()
          .describe("Sell this variant as a subscription; each renewal becomes a new order"),
      })).optional(),
    },
  }, async (a) => out(await commerce.products.create(a as any)));

  tool("create_products", {
    description: "Create up to 100 products in one call (much faster than create_product in a loop). Same fields as create_product, plus optional metadata and print-on-demand `fulfillment` per variant. Each product succeeds or fails on its own; the result lists failures by index so you can fix and resend just those.",
    write: true,
    input: {
      products: z.array(z.object({
        name: z.string(), description: z.string().optional(), images: z.array(z.string().url()).optional(),
        metadata: z.record(z.string(), z.string()).optional(),
        price: z.number().int().nonnegative().optional(), inventory: z.number().int().nonnegative().optional(), sku: z.string().optional(),
        print_files: z.array(z.object({ placement: z.string(), url: z.string().url() })).optional(),
        variants: z.array(z.object({
          name: z.string(), price: z.number().int().nonnegative(), sku: z.string().optional(),
          inventory: z.number().int().nonnegative().optional(), options: z.record(z.string(), z.string()).optional(),
          fulfillment: z.record(z.string(), z.unknown()).optional(),
        })).optional(),
      })).min(1).max(100),
    },
  }, async (a) => out(await commerce.products.createMany(a.products as any)));

  tool("printify_catalog", {
    description: "Look up Printify's catalog through the store's connected Printify shop (no token needed). Step 1: pass q (e.g. \"heavy cotton tee\") to find blueprint ids. Step 2: pass blueprint_id to list print providers. Step 3: pass blueprint_id + print_provider_id to get variant ids, option values (color, size) and placements (front, back…).",
    input: { q: z.string().optional(), blueprint_id: z.number().int().optional(), print_provider_id: z.number().int().optional() },
  }, async (a) => {
    if (a.blueprint_id && a.print_provider_id) return out(await commerce.printify.variants(a.blueprint_id, a.print_provider_id));
    if (a.blueprint_id) return out(await commerce.printify.providers(a.blueprint_id));
    return out(await commerce.printify.blueprints({ q: a.q }));
  });

  tool("create_in_printify", {
    description: "Create one of the store's products in its Printify shop: uploads the artwork, enables and prices each variant, generates mockups, and maps the variants so paid orders go straight to Printify. Variants are matched by option values; use fixed_options for options the product doesn't have (e.g. { color: \"Black\" } for a size-only tee) or variant_map ({ our_variant_id: printify_variant_id }). Prices must cover Printify's cost. Run once per product.",
    write: true,
    input: {
      product_id: z.string(), blueprint_id: z.number().int(), print_provider_id: z.number().int(),
      print_files: z.array(z.object({ placement: z.string(), url: z.string().url() })).optional(),
      fixed_options: z.record(z.string(), z.string()).optional(),
      variant_map: z.record(z.string(), z.number().int()).optional(),
      use_mockups: z.boolean().optional(),
      publish: z.boolean().optional().describe("Also publish to the Printify store's sales channel (e.g. Etsy). Only works when that store is connected to one."),
    },
  }, async ({ product_id, ...rest }) => out(await commerce.printify.createProduct(product_id, rest)));

  tool("publish_in_printify", {
    description: "Publish a product (already created with create_in_printify) to the connected Printify store's sales channel, such as Etsy. Printify creates the listing; Etsy may show it as a draft first. Refuses if the Printify store isn't linked to a channel. Puts the product in front of real buyers, so confirm with the owner first.",
    write: true,
    input: { product_id: z.string() },
  }, async ({ product_id }) => out(await commerce.printify.publish(product_id)));

  tool("upload_image", {
    description: "Host an image on cdn.commerceforai.com (PNG, JPEG or WebP, up to 25 MB) and get a permanent URL to use for product images, print_files or the email logo. Pass url to copy from a link, or base64 data for a local file. Photo metadata is removed; the same image is stored once.",
    write: true,
    input: { url: z.string().url().optional(), data: z.string().optional().describe("base64 file contents (for local files)"), filename: z.string().optional() },
  }, async (a) => {
    if (!a.url && !a.data) return text("Pass url or data.", true);
    return out(a.url ? await commerce.files.upload({ url: a.url }) : await commerce.files.upload(Uint8Array.from(Buffer.from(a.data!, "base64")), { filename: a.filename }));
  });

  tool("copy_product_images", {
    description: "Copy products' images and print files from outside links onto cdn.commerceforai.com and point the products at the copies, so a moved or deleted source can't break the store. Pass product_id for one product; otherwise it does the next batch (repeat until remaining is 0).",
    write: true,
    input: { product_id: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
  }, async (a) => a.product_id
    ? out(await commerce.files.copyProductImages(a.product_id))
    : out(await commerce.files.copyAllProductImages({ limit: a.limit })));

  tool("preview_store_sync", {
    description: "Preview syncing this store's other version (test or live) into this store: products to add or change, price changes, collections, discounts, settings. Changes nothing. Syncs never touch orders, keys, Stripe, site URLs or stock counts, and leave anything only in this store alone. Show the owner the plan before applying into a live store.",
    input: {},
  }, async () => out(await commerce.store.syncPreview()));
  tool("apply_store_sync", {
    description: "Apply a sync into the store this connection belongs to. Into a live store it needs plan_id from preview_store_sync and changes what real customers see and pay, so get the owner's OK on the plan first.",
    write: true,
    input: { plan_id: z.string().optional() },
  }, async (a) => out(await commerce.store.sync({ plan_id: a.plan_id })));

  tool("sales_tax_status", {
    description: "Sales tax readiness: whether collection is on, Stripe Tax setup status, registered states, the next step, and the tax categories. Stripe collects only where the merchant has added a registration; the merchant registers and files. Don't tell the owner what they legally owe; suggest an accountant.",
    input: {},
  }, async () => out(await commerce.store.tax()));
  tool("configure_sales_tax", {
    description: "Turn Stripe Tax collection on or off, and set the default tax category for products without their own (e.g. txcd_30011000 for clothing; see sales_tax_status for categories). Changes what customers pay, so get the owner's OK. Set one product's category with update_product tax_code.",
    write: true,
    input: { enabled: z.boolean().optional(), default_tax_code: z.string().nullable().optional(), prices_include_tax: z.boolean().optional().describe("True if listed prices already include tax (common outside the US)") },
  }, async (a) => out(await commerce.store.update({ ...(a.enabled !== undefined ? { tax_enabled: a.enabled } : {}), ...(a.default_tax_code !== undefined ? { default_tax_code: a.default_tax_code } : {}), ...(a.prices_include_tax !== undefined ? { prices_include_tax: a.prices_include_tax } : {}) })));
  tool("tax_orders", {
    description: "Every real order in a period with its destination and tax, for an accountant or a filing. Dates are YYYY-MM-DD; default the last 365 days.",
    input: { from: z.string().optional(), to: z.string().optional() },
  }, async (a) => out(await commerce.reports.taxOrders(a)));
  tool("sales_by_state", {
    description: "Sales, orders and tax collected by state over the last N days (default 365), with which states are registered. `watch` marks US states near common registration thresholds, worth checking with an accountant; it isn't a legal determination.",
    input: { days: z.number().int().min(1).max(366).optional() },
  }, async (a) => out(await commerce.reports.tax(a)));

  tool("update_product", {
    description: "Update a product's name, description, images, or set active=false to stop selling it.",
    write: true,
    input: { product_id: z.string(), name: z.string().optional(), description: z.string().optional(), images: z.array(z.string().url()).optional(), active: z.boolean().optional(), tax_code: z.string().nullable().optional() },
  }, async ({ product_id, ...rest }) => out(await commerce.products.update(product_id, rest)));

  tool("update_variant", {
    description: "Change a variant's price (cents), name, SKU, or set active=false to stop selling it.",
    write: true,
    input: { variant_id: z.string(), price: z.number().int().nonnegative().optional(), name: z.string().optional(), sku: z.string().optional(), active: z.boolean().optional() },
  }, async ({ variant_id, ...rest }) => out(await commerce.variants.update(variant_id, rest)));

  tool("adjust_inventory", {
    description: "Change stock for a variant. Use `adjust` for a relative change (+24 after a delivery, -1 for a damaged unit) or `set` for an absolute count after a stocktake. Always give a reason.",
    write: true,
    input: { variant_id: z.string(), adjust: z.number().int().optional(), set: z.number().int().nonnegative().optional(), reason: z.string() },
  }, async (a) => {
    if ((a.adjust === undefined) === (a.set === undefined)) return text("Provide exactly one of `adjust` or `set`.", true);
    return out(a.set !== undefined ? await commerce.inventory.set(a.variant_id, a.set, a.reason) : await commerce.inventory.adjust(a.variant_id, a.adjust!, a.reason));
  });

  tool("create_checkout", {
    description: "Create a Stripe-hosted checkout link for a customer. Stock is held until it expires. Returns `url` to send to the customer.",
    write: true,
    input: {
      items: z.array(z.object({
        variant_id: z.string(), quantity: z.number().int().min(1),
        properties: z.record(z.string(), z.string()).optional().describe("Custom data for this line, e.g. { name: 'Riley' }"),
        print_files: z.array(z.object({ placement: z.string(), url: z.string().url() })).optional(),
      })).min(1),
      customer_email: z.string().email().optional(),
      success_url: z.string().url().optional(),
      discount_code: z.string().optional().describe("Apply this code up front. Otherwise the customer can enter any live code on Stripe's page."),
    },
  }, async (a) => out(await commerce.checkouts.create(a)));

  tool("fulfill_order", {
    description: "Mark a paid order as shipped, with optional carrier and tracking. Only do this once the package has actually been handed to a carrier. On an order that already shipped, a new tracking number adds another package and emails the customer about it; set replace: true to correct the tracking instead.",
    write: true,
    input: {
      order: z.string(), carrier: z.string().optional(), tracking_number: z.string().optional(), tracking_url: z.string().url().optional(), replace: z.boolean().optional(),
      items: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().min(1) })).optional()
        .describe("Ship only these (one box of a split order; needs tracking_number). The order's unshipped_items says what's left."),
    },
  }, async ({ order, ...rest }) => out(await commerce.orders.fulfill(order, rest)));

  tool("save_draft_order", {
    description: "Build an order for a customer without them going through the store (a phone order, a wholesale buyer, a quote), or update one by id/number. Each item can have its own unit_price in cents (default: the variant's price). Optional customer, note shown on the invoice, discount_code and a single shipping charge. Returns invoice_url, the customer's page to pay; it becomes a normal order when paid. Holds no stock until the customer pays. Confirm items and prices with the owner first.",
    write: true,
    input: {
      draft: z.string().optional().describe("Id or number of a draft to update; omit to create"),
      items: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().min(1), unit_price: z.number().int().min(0).optional() })).optional(),
      customer_email: z.string().optional(), customer_name: z.string().optional(), note: z.string().optional(), discount_code: z.string().optional(),
      shipping: z.object({ name: z.string(), amount: z.number().int().min(0) }).optional(), expires_in_days: z.number().int().min(1).max(365).optional(),
    },
  }, async ({ draft, ...p }) => out(draft ? await commerce.draftOrders.update(draft, p) : await commerce.draftOrders.create(p as any)));
  tool("send_invoice", {
    description: "Email a draft order's invoice to its customer (or to `to`), with an optional message. The email has a Pay now link. Sends a real email: confirm with the owner.",
    write: true,
    input: { draft: z.string(), to: z.string().optional(), message: z.string().optional() },
  }, async ({ draft, ...p }) => out(await commerce.draftOrders.sendInvoice(draft, p)));
  tool("list_draft_orders", { description: "Draft orders and invoices: open, invoice_sent, completed (paid; see order_id), cancelled or expired.", input: { status: z.enum(["open", "invoice_sent", "completed", "cancelled"]).optional() } },
    async ({ status }) => out(await commerce.draftOrders.list(status ? { status } : {})));

  tool("list_subscriptions", { description: "Subscriptions (variants sold with `recurring`): status, schedule, customer, and what each renewal contains. Each paid renewal creates a normal order.", input: { status: z.string().optional(), email: z.string().optional() } },
    async (p) => out(await commerce.subscriptions.list(p)));
  tool("cancel_subscription", {
    description: "Cancel a customer's subscription: at the end of the period they've paid for (default), or now with at_period_end false. Confirm with the owner first.",
    write: true, destructive: true,
    input: { subscription: z.string(), at_period_end: z.boolean().optional() },
  }, async ({ subscription, ...p }) => out(await commerce.subscriptions.cancel(subscription, p)));

  tool("edit_order", {
    description: "Change a paid order before it ships: swap an item for another variant (replace, e.g. a different size), remove or add items, or fix the shipping address or email. Removing something refunds its share of what was charged. A change that costs more is refused unless waive_difference is true (to charge for extras, use save_draft_order instead). Print-on-demand orders affected are cancelled at the provider and sent again; if the provider refuses (already in production), nothing changes. Call with dry_run: true first to see the refund and what will be resent, and confirm with the owner before applying.",
    write: true,
    input: {
      order: z.string(),
      remove: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().min(1) })).optional(),
      replace: z.array(z.object({ variant_id: z.string(), with_variant_id: z.string(), quantity: z.number().int().min(1).optional() })).optional(),
      add: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().min(1) })).optional(),
      shipping_address: z.object({ name: z.string().optional(), line1: z.string(), line2: z.string().optional(), city: z.string(), state: z.string().optional(), postal_code: z.string(), country: z.string().length(2) }).optional(),
      email: z.string().optional(), waive_difference: z.boolean().optional(), notify_customer: z.boolean().optional(), reason: z.string().optional(), dry_run: z.boolean().optional(),
    },
  }, async ({ order, ...p }) => out(await commerce.orders.edit(order, p as any)));

  tool("submit_fulfillment", {
    description: "Send a paid order to the print-on-demand provider (Printful or Printify) now — e.g. after fixing a missing print file. Orders are normally sent automatically when paid.",
    write: true,
    input: { order: z.string() },
  }, async (a) => out(await commerce.orders.submitFulfillment(a.order)));

  tool("add_order_note", {
    description: "Attach an internal note to an order (not shown to the customer).",
    write: true,
    input: { order: z.string(), note: z.string() },
  }, async (a) => {
    const o = await commerce.orders.get(a.order);
    if (o.error) return out(o);
    return out(await commerce.orders.update(o.data.id, { note: a.note }));
  });

  tool("refund_order", {
    description: `Refund an order through Stripe. Omit amount for the full remaining amount. This tool is limited to ${money(cfg.maxRefund)} per refund; larger refunds must be done by a human. Set restock=true if the items came back sellable.`,
    write: true,
    destructive: true,
    input: {
      order: z.string(),
      amount: z.number().int().positive().optional(),
      restock: z.boolean().optional(),
      reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
    },
  }, async (a) => {
    const o = await commerce.orders.get(a.order);
    if (o.error) return out(o);
    const amount = a.amount ?? o.data.total - o.data.refunded;
    if (amount > cfg.maxRefund) {
      return text(
        `Refused by guardrail: refunding ${money(amount, o.data.currency)} on order #${o.data.number} exceeds this agent's limit of ` +
          `${money(cfg.maxRefund, o.data.currency)} (COMMERCEFORAI_MAX_REFUND). Ask a human to approve it, or refund a smaller amount.`,
        true,
      );
    }
    return out(await commerce.orders.refund(o.data.id, { amount, restock: a.restock, reason: a.reason }));
  });

  // ---------- shipping & returns ----------
  const maxLabel = cfg.maxLabelCost ?? 5000;

  // ---------- collections ----------
  tool("list_collections", { description: "Collections (product groups like 'Mugs' or 'Yosemite') in display order, with their product ids. Filter products by one with list_products collection.", input: {} },
    async () => out(await commerce.collections.list()));
  tool("save_collection", {
    description: "Create a collection, or update one by id/handle. product_ids replaces its membership in display order; omit it to leave products as they are. The handle defaults from the name.",
    write: true,
    input: {
      collection: z.string().optional().describe("Id or handle of an existing collection to update; omit to create"),
      name: z.string().optional(), handle: z.string().optional(), description: z.string().optional(), image: z.string().url().optional(),
      product_ids: z.array(z.string()).optional(), position: z.number().int().optional(),
    },
  }, async ({ collection, ...p }) => out(collection ? await commerce.collections.update(collection, p) : await commerce.collections.create({ ...p, name: p.name ?? "" })));
  tool("delete_collection", { description: "Delete a collection. The products themselves are kept.", write: true, destructive: true, input: { collection: z.string() } },
    async ({ collection }) => out(await commerce.collections.delete(collection)));

  // ---------- customers & reports ----------
  tool("list_customers", {
    description: "Customers who've paid, matched by email, with order count and total spent (after refunds). Search by email or name; sort recent, spent or orders.",
    input: { q: z.string().optional(), sort: z.enum(["recent", "spent", "orders"]).optional(), limit: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() },
  }, async (a) => out(await commerce.customers.list(a)));
  tool("get_customer", { description: "One customer by email: totals, last shipping address and order history.", input: { email: z.string() } },
    async ({ email }) => out(await commerce.customers.get(email)));
  tool("set_customer_tax_exempt", {
    description: "Mark a customer tax-exempt (wholesale, nonprofit) or remove the exemption. Checkouts created with their customer_email then skip sales tax. Works before their first order. Only do this when the store owner has the customer's exemption certificate.",
    write: true,
    input: { email: z.string(), tax_exempt: z.boolean(), note: z.string().optional().describe("For the store's records, e.g. the exemption certificate number") },
  }, async ({ email, tax_exempt, note }) => out(await commerce.customers.update(email, { tax_exempt, ...(note !== undefined ? { tax_exempt_note: note } : {}) })));
  tool("sales_report", {
    description: "Sales over the last N days (default 30): orders, gross, net after refunds, discounts, average order, new vs returning customers, change vs the previous period, a time series and top products. Amounts are cents. Simulated orders are excluded.",
    input: { days: z.number().int().min(1).max(366).optional() },
  }, async (a) => out(await commerce.reports.sales(a)));

  // ---------- discounts ----------
  tool("list_discounts", { description: "Discount codes with status (live, scheduled, expired, used_up, off) and times used.", input: {} },
    async () => out(await commerce.discounts.list()));
  tool("save_discount", {
    description: "Create a discount code, or update one by id/code. kind percent (value 1–100) or amount (value in cents). Optional minimum order (cents), usage limit and start/end dates. Live codes work at checkout right away: customers enter them on Stripe's page, or pass discount_code to create_checkout. automatic: true applies it to every qualifying checkout with no code (e.g. 10% off orders over $50; code is then optional and only names it on the receipt). One discount per checkout: a code the shopper or checkout supplies replaces the automatic one. Confirm the terms with the owner before creating a discount.",
    write: true,
    input: {
      discount: z.string().optional().describe("Id or code of an existing discount to update; omit to create"),
      code: z.string().optional(), kind: z.enum(["percent", "amount"]).optional(), value: z.number().int().positive().optional(),
      min_subtotal: z.number().int().min(0).nullable().optional(), max_redemptions: z.number().int().min(1).nullable().optional(),
      starts_at: z.string().nullable().optional(), ends_at: z.string().nullable().optional(), active: z.boolean().optional(),
      automatic: z.boolean().optional().describe("Apply without a code to every checkout that qualifies"),
    },
  }, async ({ discount, ...p }) => out(discount ? await commerce.discounts.update(discount, p) : await commerce.discounts.create(p as any)));
  tool("issue_gift_card", {
    description: "Issue a gift card worth `value` cents (store credit, a prize, a replacement). With send: true and recipient_email, the code is emailed with your optional message. Customers enter the code like a discount code; unspent balance stays on the card. To sell gift cards instead, create a product with metadata { gift_card: \"true\" }. Confirm the value with the owner first.",
    write: true,
    input: { value: z.number().int().positive(), recipient_email: z.string().optional(), send: z.boolean().optional(), message: z.string().optional(), note: z.string().optional(), expires_at: z.string().optional() },
  }, async (p) => out(await commerce.giftCards.create(p)));
  tool("list_gift_cards", { description: "Gift cards with their balances and status. To look one up by code or last 4, use update_gift_card with no changes, or get it via the API.", input: {} },
    async () => out(await commerce.giftCards.list()));
  tool("update_gift_card", {
    description: "Change a gift card by id, code or last 4: active false disables it, balance sets what's left (to add value), or resend the code with send_to.",
    write: true,
    input: { card: z.string(), active: z.boolean().optional(), balance: z.number().int().min(0).optional(), note: z.string().optional(), send_to: z.string().optional() },
  }, async ({ card, send_to, ...p }) => {
    if (Object.keys(p).length) { const r = await commerce.giftCards.update(card, p); if (r.error) return out(r); }
    if (send_to) return out(await commerce.giftCards.send(card, { to: send_to }));
    return out(await commerce.giftCards.get(card));
  });
  tool("delete_discount", { description: "Delete a discount code. It stops working at checkout immediately. To pause it instead, save_discount with active: false.", write: true, destructive: true, input: { discount: z.string() } },
    async ({ discount }) => out(await commerce.discounts.delete(discount)));

  // ---------- email branding ----------
  tool("brand_emails", {
    description: "Brand the customer emails (order confirmation, shipped, refund, return, cart reminder): an https logo URL, an accent hex color for buttons, and the address shown in the footer. Also sets team alerts: new_order (an email per sale) and low_stock_threshold (email when a variant's stock falls to it; null = off). Then use send_test_emails so the owner can see them.",
    write: true,
    input: {
      logo_url: z.string().url().nullable().optional(), accent_color: z.string().nullable().optional(), address: z.string().nullable().optional(),
      new_order_alerts: z.boolean().optional(), low_stock_threshold: z.number().int().min(0).nullable().optional(),
    },
  }, async (a) => out(await commerce.store.update({
    email_brand: { ...(a.logo_url !== undefined ? { logo_url: a.logo_url } : {}), ...(a.accent_color !== undefined ? { accent_color: a.accent_color } : {}), ...(a.address !== undefined ? { address: a.address } : {}) },
    owner_alerts: { ...(a.new_order_alerts !== undefined ? { new_order: a.new_order_alerts } : {}), ...(a.low_stock_threshold !== undefined ? { low_stock_threshold: a.low_stock_threshold } : {}) },
  })));
  tool("send_test_emails", {
    description: "Email the store owner a preview of every customer email (or one template) with the store's branding and sample data from its products. Only goes to the store's own members.",
    write: true,
    input: { template: z.enum(["all", "order_confirmation", "order_shipped", "order_refunded", "return_approved", "checkout_recovery"]).optional() },
  }, async (a) => out(await commerce.emails.sendTest({ template: a.template ?? "all" })));

  tool("list_returns", {
    description: "List returns, newest first. Status: requested (needs a decision), approved (waiting for items), rejected, completed.",
    input: { status: z.enum(["requested", "approved", "rejected", "completed"]).optional(), order: z.string().optional() },
  }, async (a) => out(await commerce.returns.list({ status: a.status, order_id: a.order })));

  tool("get_shipping_rates", {
    description: "Get live shipping label rates for a paid order (cheapest first). Parcel weight comes from variant weights unless you pass parcel. Pass return_id for return-label rates.",
    input: {
      order: z.string(),
      return_id: z.string().optional(),
      parcel: z.object({ length: z.number().optional(), width: z.number().optional(), height: z.number().optional(), weight_oz: z.number().optional() }).optional(),
    },
  }, async ({ order, ...rest }) => out(await commerce.orders.shippingRates(order, rest)));

  tool("buy_shipping_label", {
    description: `Buy a shipping label for a rate from get_shipping_rates. This charges the merchant's carrier account and marks the order shipped (the customer gets a tracking email). Limited to ${money(maxLabel)} per label.`,
    write: true,
    destructive: true,
    input: { order: z.string(), rate_id: z.string() },
  }, async (a) => {
    // The server checks the stored rate's real price against max_cost before buying.
    const res = await commerce.orders.buyLabel(a.order, a.rate_id, { max_cost: maxLabel });
    if (res.error?.param === "max_cost")
      return text(`Refused by guardrail: that label costs ${money(Number(res.error.amount))}, over this agent's ${money(maxLabel)} limit ` +
        `(COMMERCEFORAI_MAX_LABEL_COST). Choose a cheaper rate or ask a human.`, true);
    return out(res);
  });

  tool("create_return", {
    description: "Open a return for items on a shipped order.",
    write: true,
    input: { order: z.string(), items: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().min(1) })).min(1), reason: z.string().optional() },
  }, async ({ order, ...rest }) => out(await commerce.returns.create(order, rest)));

  tool("approve_return", {
    description: "Approve a requested return. Set prepaid_label=true to buy the cheapest return label and email it to the customer.",
    write: true,
    input: { return_id: z.string(), prepaid_label: z.boolean().optional(), note: z.string().optional() },
  }, async (a) => out(await commerce.returns.approve(a.return_id, { note: a.note, ...(a.prepaid_label ? { return_label: "cheapest" as const } : {}) })));

  tool("reject_return", {
    description: "Reject a return request, with a note explaining why.",
    write: true,
    input: { return_id: z.string(), note: z.string() },
  }, async (a) => out(await commerce.returns.reject(a.return_id, { note: a.note })));

  tool("receive_return", {
    description: `Record that returned items arrived. Restocks them (unless restock=false) and refunds their value through Stripe (unless refund=false). The refund is subject to the ${money(cfg.maxRefund)} per-refund limit.`,
    write: true,
    destructive: true,
    input: { return_id: z.string(), restock: z.boolean().optional(), refund: z.boolean().optional() },
  }, async (a) => {
    const r = await commerce.returns.get(a.return_id);
    if (r.error) return out(r);
    const value = r.data.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    if ((a.refund ?? true) && value > cfg.maxRefund)
      return text(`Refused by guardrail: this return would refund ${money(value, r.data.currency ?? "usd")}, over this agent's ${money(cfg.maxRefund)} limit. ` +
        `Ask a human, or call with refund=false to restock only.`, true);
    return out(await commerce.returns.receive(a.return_id, { restock: a.restock, refund: a.refund }));
  });

  return server;
}

// Run as a stdio server when executed directly.
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("commerceforai-mcp");
if (isMain) {
  const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY);
  const server = buildServer(commerce, configFromEnv());
  await server.connect(new StdioServerTransport());
}
