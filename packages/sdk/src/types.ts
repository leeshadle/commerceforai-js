/** All amounts are integers in the currency's minor unit (cents for USD). */
export type Money = number;

export interface Inventory {
  tracked: boolean;
  /** Units physically in stock (null when not tracked). */
  on_hand: number | null;
  /** Units held by open checkouts. */
  reserved: number;
  /** on_hand − reserved: what can be sold right now (null = unlimited). */
  available: number | null;
}

export interface Variant {
  object: "variant";
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  options: Record<string, string>;
  price: Money;
  currency: string;
  weight_oz: number | null;
  /** Print-on-demand mapping (null = you ship it yourself). */
  fulfillment: VariantFulfillment | null;
  /** Sold as a subscription; null for one-time purchases. */
  recurring: Required<Recurring> | null;
  inventory: Inventory;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  object: "product";
  id: string;
  name: string;
  description: string | null;
  images: string[];
  metadata: Record<string, string>;
  active: boolean;
  /** Default artwork for all variants (a variant's or checkout line's own print_files win). */
  print_files: PrintFile[] | null;
  variants: Variant[];
  created_at: string;
  updated_at: string;
}

export interface VariantInput {
  name?: string;
  sku?: string;
  price: Money;
  options?: Record<string, string>;
  /** Units on hand. Omit or `null` for unlimited (not tracked). */
  inventory?: number | null;
  /** Shipping weight in ounces, used to price labels. */
  weight_oz?: number;
  /** Map to a Printful catalog variant to have paid orders printed and shipped by Printful. */
  fulfillment?: VariantFulfillment;
  /** Sell it as a subscription: charged on this schedule, each renewal a new order. */
  recurring?: Recurring;
}

export interface Recurring { interval: "day" | "week" | "month" | "year"; /** Default 1. */ interval_count?: number }

export interface PrintFile {
  /** Provider placement, e.g. "front", "back", or Printful "embroidery_chest_left". */
  placement: string;
  /** Public https URL of the artwork (PNG recommended). */
  url: string;
  /** Provider file options, e.g. Printful [{ id: "thread_colors", value: ["#FFFFFF"] }]. */
  options?: { id: string; value: unknown }[];
}

/** Print-on-demand mapping: set exactly one of `printful_variant_id`, `printful_sync_variant_id` or `printify`. */
export interface VariantFulfillment {
  /** Printful catalog variant id (product + color + size), e.g. 4012. */
  printful_variant_id?: number;
  /** A product already set up in your Printful store (sync variant id): no print files needed. */
  printful_sync_variant_id?: number;
  /** Printful item options, e.g. [{ id: "thread_colors_chest_left", value: ["#000000"] }] for embroidery. */
  printful_options?: { id: string; value: unknown }[];
  /**
   * Printify: for per-order artwork give catalog `blueprint_id` + `print_provider_id` + `variant_id`;
   * to print an existing Printify product give `product_id` + `variant_id`.
   */
  printify?: { variant_id: number; blueprint_id?: number; print_provider_id?: number; product_id?: string };
  /** Default artwork; a checkout line's own print_files override it. */
  print_files?: PrintFile[];
}

export type ProductCreateParams = {
  name: string;
  /** Stripe Tax category, e.g. "txcd_30011000" (clothing). Defaults to the store's default_tax_code. */
  tax_code?: string | null;
  /** Default artwork for every variant — artwork is usually per design, not per size. */
  print_files?: PrintFile[];
  description?: string;
  images?: string[];
  metadata?: Record<string, string>;
} & (
  | { variants: VariantInput[]; price?: never; inventory?: never; sku?: never }
  | { price: Money; inventory?: number | null; sku?: string; weight_oz?: number; /** Sell it as a subscription. */ recurring?: Recurring; variants?: never }
);

export interface ProductUpdateParams {
  /** Stripe Tax category; null falls back to the store's default_tax_code. */
  tax_code?: string | null;
  name?: string;
  print_files?: PrintFile[] | null;
  description?: string | null;
  images?: string[];
  metadata?: Record<string, string>;
  active?: boolean;
}

export interface VariantUpdateParams {
  name?: string;
  sku?: string | null;
  price?: Money;
  options?: Record<string, string>;
  active?: boolean;
  weight_oz?: number | null;
  fulfillment?: VariantFulfillment | null;
}

export interface CheckoutItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string | null;
  quantity: number;
  unit_price: Money;
  properties?: Record<string, string>;
  print_files?: PrintFile[];
}

export interface Checkout {
  object: "checkout";
  id: string;
  status: "pending" | "open" | "completed" | "expired" | "failed";
  /** Stripe-hosted payment page. Redirect the customer here. */
  url: string | null;
  items: CheckoutItem[];
  currency: string;
  customer_email: string | null;
  metadata: Record<string, string>;
  order_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface CheckoutLine {
  variant_id: string;
  quantity: number;
  /** Custom data for this line, e.g. { parks: "Zion, Arches", name: "Riley" }. Up to 20 keys × 500 chars. Shown on Stripe's page. */
  properties?: Record<string, string>;
  /** Per-order artwork for print-on-demand (https URLs). */
  print_files?: PrintFile[];
}

export interface CheckoutCreateParams {
  items: CheckoutLine[];
  /** Where Stripe sends the customer after paying. Supports `{CHECKOUT_SESSION_ID}`. */
  success_url?: string;
  cancel_url?: string;
  customer_email?: string;
  /** Default true. */
  collect_shipping_address?: boolean;
  /** ISO country codes. Default ["US"]. */
  shipping_countries?: string[];
  shipping_rates?: { name: string; amount: Money; min_days?: number; max_days?: number }[];
  /** How long stock is held, 30–1440. Default 30. */
  expires_in_minutes?: number;
  metadata?: Record<string, string>;
  /** Apply a discount code up front. Without it, shoppers can enter any live code on Stripe's page. */
  discount_code?: string;
}

export type OrderStatus = "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded";

export interface Address {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/** One package. `status` stays "shipped" until the carrier or print provider reports more. */
export interface Shipment {
  /** printful / printify for print-on-demand packages; absent for packages the store ships. */
  provider?: string;
  carrier: string;
  tracking_number: string;
  tracking_url: string | null;
  status: "shipped" | "label_created" | "in_transit" | "out_for_delivery" | "available_for_pickup" | "delivered" | "returned" | "exception";
  delivered_at: string | null;
  /** Estimated delivery, when known. */
  eta: string | null;
  /** The carrier's wording for the latest update. */
  detail: string | null;
  /** What's in this package, when it was recorded. */
  items?: { variant_id: string; quantity: number }[];
}

export interface Order {
  object: "order";
  id: string;
  /** Human-friendly, per-store sequential number (e.g. 1001). */
  number: number;
  status: OrderStatus;
  email: string | null;
  customer_name: string | null;
  shipping_address: Address | null;
  items: CheckoutItem[];
  currency: string;
  subtotal: Money;
  shipping: Money;
  tax: Money;
  total: Money;
  /** Taken off by a discount code. */
  discount: Money;
  discount_code: string | null;
  /** The customer was tax-exempt at this store, so no sales tax was charged. */
  tax_exempt: boolean;
  /** Gift card used on this order and how much it covered (included in discount). */
  gift_card: { id: string; amount: Money } | null;
  refunded: Money;
  fulfillment: {
    carrier: string | null; tracking_number: string | null; tracking_url: string | null; fulfilled_at: string;
    /** The packages recorded when the order was marked shipped. For every package with its status, use `order.shipments`. */
    shipments?: { provider?: string; carrier: string; tracking_number: string; tracking_url: string | null }[];
  } | null;
  /** Every package of the order (the store's own and print-on-demand), each with its delivery status. */
  shipments: Shipment[];
  /** unshipped, partial (some items are in packages) or shipped. */
  fulfillment_status: "unshipped" | "partial" | "shipped";
  /** Items not in a package yet (empty once the order has shipped). */
  unshipped_items: { variant_id: string; quantity: number }[];
  /** When the last package was delivered; null until every package has been. */
  delivered_at: string | null;
  /** The customer's tracking page for this order (linked from the shipping emails); null before anything ships. */
  tracking_page_url: string | null;
  /** One entry per print-on-demand provider this order was routed to. */
  fulfillment_provider_orders: {
    provider: "printful" | "printify"; id?: string; status: string; dashboard_url?: string | null; error?: string;
    shipments?: { carrier: string; tracking_number: string; tracking_url: string | null }[];
  }[];
  /** Changes made after the order was paid. Totals stay what was charged; items are what ships. */
  edits: { id: string; at: string; changes: string[]; refund: Money; extra_cost_waived: Money; reason: string | null }[];
  note: string | null;
  metadata: Record<string, string>;
  checkout_id: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  object: "store";
  id: string;
  name: string;
  currency: string;
  mode: "test" | "live";
  tax_enabled: boolean;
  default_success_url: string | null;
  default_cancel_url: string | null;
  stripe_webhook_url: string | null;
  stripe_webhook_configured: boolean;
  shipping: { provider: "easypost" | "shippo"; ship_from: Address; default_parcel: Dimensions | null } | null;
  emails: { provider: "resend"; from: string; reply_to: string | null; events: string[] | null } | null;
  storefront: StorefrontConfig | null;
  agent_access: boolean;
  /** Shipping every checkout offers unless it passes its own rates. */
  checkout_shipping: { countries: string[]; rates: { name: string; amount: Money; min_days?: number; max_days?: number }[]; free_over: Money | null } | null;
  /** Connected print-on-demand providers; each variant routes to the one it's mapped to. */
  fulfillment: { provider: "printful" | "printify"; auto_confirm: boolean; printful_store_id?: string | null; printify_shop_id?: string | null }[];
  feeds: { acp: string; google: string; agent: string | null } | null;
}

export interface Dimensions { length: number; width: number; height: number }
export interface Parcel extends Partial<Dimensions> { weight_oz?: number }

export interface ShipFromAddress {
  name?: string; company?: string; line1: string; line2?: string; city: string; state?: string;
  postal_code: string; country: string; phone?: string; email?: string;
}

export interface StorefrontConfig {
  /** Your product page URL with `{handle}` or `{id}`, e.g. "https://acme.com/products/{handle}". */
  product_url_template: string;
  brand?: string;
  seller_url?: string;
  privacy_policy_url?: string;
  terms_url?: string;
  return_policy_url?: string;
  return_window_days?: number;
}

export interface ShippingRate {
  object: "shipping_rate";
  id: string;
  carrier: string;
  service: string;
  amount: Money;
  currency: string;
  est_days: number | null;
  return_id: string | null;
}

export interface Label {
  object: "label";
  id: string;
  order_id: string;
  return_id: string | null;
  provider: "easypost" | "shippo";
  carrier: string;
  service: string;
  cost: Money;
  currency: string;
  tracking_number: string | null;
  tracking_url: string | null;
  /** PDF/PNG to print. */
  label_url: string;
  created_at: string;
}

export interface Return {
  object: "return";
  id: string;
  /** Per-store sequential number, shown to customers as R1, R2, ... */
  number: number;
  status: "requested" | "approved" | "rejected" | "completed";
  order_id: string;
  order_number: number | null;
  email: string | null;
  currency: string | null;
  items: { variant_id: string; product_name: string; variant_name: string; quantity: number; unit_price: Money }[];
  reason: string | null;
  note: string | null;
  refund_amount: Money | null;
  restocked: boolean;
  label: Label | null;
  created_at: string;
  updated_at: string;
}

export interface Email {
  object: "email";
  id: string;
  order_id: string | null;
  template: "order_confirmation" | "order_shipped" | "order_refunded" | "return_approved";
  to: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export type EventType =
  | "order.created"
  | "order.paid"
  | "order.fulfilled"
  | "order.updated"
  | "order.cancelled"
  | "order.refunded"
  | "checkout.expired"
  | "checkout.abandoned"
  | "label.created"
  | "order.shipment_created"
  | "order.edited"
  | "order.shipment_updated"
  | "order.shipment_delivered"
  | "order.delivered"
  | "draft_order.created"
  | "gift_card.created"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.updated"
  | "subscription.canceled"
  | "gift_card.sent"
  | "gift_card.used"
  | "gift_card.updated"
  | "draft_order.updated"
  | "draft_order.invoice_sent"
  | "draft_order.completed"
  | "draft_order.cancelled"
  | "fulfillment.submitted"
  | "fulfillment.failed"
  | "fulfillment.canceled"
  | "fulfillment.on_hold"
  | "return.requested"
  | "return.approved"
  | "return.rejected"
  | "return.completed"
  | "inventory.updated"
  | "product.created"
  | "product.updated";

export interface Event<T = unknown> {
  id: string;
  object: "event";
  type: EventType;
  created_at: string;
  data: T;
}

export interface WebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  url: string;
  events: string[];
  /** Only returned when the endpoint is created. */
  secret?: string;
  created_at?: string;
}

export interface List<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

export interface ErrorResponse {
  type:
    | "invalid_request" | "authentication_error" | "not_found" | "conflict" | "out_of_stock"
    | "stripe_error" | "idempotency_error" | "internal_error" | "network_error";
  message: string;
  param?: string;
  [k: string]: unknown;
}

export type Result<T> = { data: T; error: null } | { data: null; error: ErrorResponse };

export interface Collection {
  object: "collection";
  id: string;
  name: string;
  /** URL-safe, unique per store. Use it anywhere an id is accepted. */
  handle: string;
  description: string | null;
  image: string | null;
  position: number;
  product_count: number;
  /** In display order. */
  product_ids: string[];
  created_at: string;
  updated_at: string;
}
export interface CollectionParams { name?: string; handle?: string; description?: string | null; image?: string | null; position?: number; product_ids?: string[] }

export interface Customer {
  object: "customer";
  email: string;
  name: string | null;
  /** Paid orders (simulated ones never count). */
  orders: number;
  /** After refunds. */
  total_spent: Money;
  currency: string;
  /** No sales tax on this customer's checkouts (those you create with their customer_email). */
  tax_exempt: boolean;
  /** Null for a customer set up before their first order. */
  first_order_at: string | null;
  last_order_at: string | null;
}
export interface CustomerDetail extends Customer {
  /** This customer's private page: orders, tracking, subscriptions, return requests. Send it only to them. */
  account_url: string;
  /** Your note about the exemption, e.g. the certificate number. */
  tax_exempt_note: string | null;
  last_shipping_address: Address | null;
  order_history: Order[];
}

export interface SalesReport {
  object: "sales_report";
  days: number;
  interval: "day" | "week" | "month";
  currency: string;
  totals: { orders: number; gross: Money; net: Money; refunds: Money; discounts: Money; average_order: Money; customers: number; returning_customers: number };
  previous: { orders: number; gross: Money; net: Money; refunds: Money; discounts: Money; change_pct: { orders: number | null; gross: number | null; net: number | null } };
  series: { period: string; orders: number; gross: Money; discounts: Money; shipping: Money; tax: Money; refunds: Money; net: Money }[];
  top_products: { product_id: string; name: string; units: number; revenue: Money }[];
}

export interface Discount {
  object: "discount";
  id: string;
  /** Uppercase; what shoppers type (for an automatic discount, the name on the receipt). */
  code: string;
  /** Applied to every qualifying checkout without a code. */
  automatic: boolean;
  kind: "percent" | "amount";
  /** 1–100 for percent; cents for amount. */
  value: number;
  currency: string;
  description: string;
  min_subtotal: Money | null;
  max_redemptions: number | null;
  times_used: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  status: "live" | "scheduled" | "expired" | "used_up" | "off";
  created_at: string;
}
export interface DiscountParams {
  /** What shoppers type. Optional for an automatic discount (it's then only the name on the receipt). */
  code?: string;
  /** Apply to every qualifying checkout without a code, e.g. 10% off orders over $50. Doesn't stack with codes. */
  automatic?: boolean;
  kind: "percent" | "amount";
  value: number;
  min_subtotal?: Money | null;
  max_redemptions?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  active?: boolean;
}

export interface DraftOrderParams {
  items: { variant_id: string; quantity: number; /** This order's price, in cents. Default: the variant's price. */ unit_price?: Money; properties?: Record<string, string> }[];
  customer_email?: string | null;
  customer_name?: string | null;
  /** Shown to the customer on the invoice. */
  note?: string | null;
  discount_code?: string | null;
  /** One shipping charge for this order. Default: the store's checkout shipping. */
  shipping?: { name: string; amount: Money } | null;
  /** How long the invoice link works, in days (default 30). */
  expires_in_days?: number;
}

export interface DraftOrder {
  object: "draft_order";
  id: string;
  /** Shown as D1001. */
  number: number;
  status: "open" | "invoice_sent" | "completed" | "cancelled" | "expired";
  customer_email: string | null;
  customer_name: string | null;
  note: string | null;
  currency: string;
  items: { variant_id: string; product_name: string; variant_name: string; quantity: number; unit_price: Money; catalog_price?: Money; properties?: Record<string, string> }[];
  discount_code: string | null;
  shipping: { name: string; amount: Money } | null;
  /** Before discount, shipping and tax, which are worked out when the customer pays. */
  subtotal: Money;
  /** The customer's page to review and pay. Works until expires_at. */
  invoice_url: string;
  /** Set once the customer pays. */
  order_id: string | null;
  invoice_sent_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface GiftCard {
  object: "gift_card";
  id: string;
  /** What the customer types, e.g. K7QX-M2PD-9WRT-H4NB. */
  code: string;
  last4: string;
  currency: string;
  initial_value: Money;
  balance: Money;
  status: "active" | "used_up" | "disabled" | "expired";
  recipient_email: string | null;
  note: string | null;
  /** The order that bought it, for cards sold as products. */
  order_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  object: "subscription";
  id: string;
  status: "active" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "trialing" | "paused";
  /** Set when it will stop at the end of the period already paid for. */
  cancel_at_period_end: boolean;
  schedule: Required<Recurring>;
  /** e.g. "every month", "every 2 weeks". */
  description: string;
  email: string | null;
  customer_name: string | null;
  /** What each renewal order contains. */
  items: CheckoutItem[];
  /** Charged with every renewal. */
  shipping: { name: string; amount: Money } | null;
  shipping_address: Address | null;
  first_order_id: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  stripe_subscription_id: string;
  /** The customer's page to cancel (or undo cancelling); also linked from their order emails. */
  manage_url: string;
  created_at: string;
}

export interface OrderEditParams {
  remove?: { variant_id: string; quantity: number }[];
  /** Swap a variant for another (e.g. a different size). quantity defaults to every unshipped unit. */
  replace?: { variant_id: string; with_variant_id: string; quantity?: number }[];
  add?: { variant_id: string; quantity: number }[];
  shipping_address?: Address;
  email?: string;
  /** The change costs more than the customer paid: absorb the difference instead of refusing. */
  waive_difference?: boolean;
  /** Email the customer what changed (default true). */
  notify_customer?: boolean;
  reason?: string;
  /** Work out what would happen without doing it. */
  dry_run?: boolean;
}

export interface OrderEdit {
  object: "order_edit";
  order_id: string;
  order_number: number;
  /** In words, e.g. "Swapped 1 × Tee (M) for Tee (L)". */
  changes: string[];
  /** Refunded to the customer, in cents. */
  refund: Money;
  extra_cost_waived: Money;
  currency: string;
  items_after: { variant_id: string; product_name: string; variant_name: string; quantity: number; unit_price: Money }[];
  /** Print-on-demand orders cancelled at the provider and sent again with the change. */
  fulfillment: { provider: string; provider_order_id: string; action: "cancel_and_resend" | "cancel" }[];
  dry_run: boolean;
  order: Order;
}
