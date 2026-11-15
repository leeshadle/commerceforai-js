// Sell a monthly subscription. Each renewal Stripe charges becomes a normal order.
import { Commerce } from "commerceforai";

const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY!);

const { data: club } = await commerce.products.create({ name: "Coffee of the month", price: 1800, recurring: { interval: "month" } });
const variant = club!.variants[0]!;

// A checkout with a recurring item becomes a Stripe subscription.
const { data: checkout } = await commerce.checkouts.create({ items: [{ variant_id: variant.id, quantity: 1 }], success_url: "https://example.com/thanks" });
console.log("Subscribe here:", checkout?.url);

// Test stores: simulate the first payment and a renewal.
await commerce.store.simulateOrder({ items: [{ variant_id: variant.id, quantity: 1 }] });
const { data: subs } = await commerce.subscriptions.list({ status: "active" });
const sub = subs!.data[0]!;
const { data: renewal } = await commerce.subscriptions.simulateRenewal(sub.id);
console.log(`Renewal order #${renewal?.number}; the customer manages it at ${sub.manage_url}`);
