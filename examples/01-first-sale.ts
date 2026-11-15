// Create a product, start a checkout, simulate the payment, and ship the order.
import { Commerce } from "commerceforai";

const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY!);

const { data: product, error } = await commerce.products.create({
  name: "Trail Tee",
  variants: [
    { name: "M", price: 3600, inventory: 10 },
    { name: "L", price: 3600, inventory: 10 },
  ],
});
if (error) throw new Error(error.message);
const medium = product.variants[0]!;

// A real checkout: send the customer to checkout.url. Stock is held until they pay or it expires.
const { data: checkout } = await commerce.checkouts.create({
  items: [{ variant_id: medium.id, quantity: 1 }],
  success_url: "https://example.com/thanks",
});
console.log("Pay here:", checkout?.url);

// Test stores can run the whole purchase without a browser.
const { data: sim } = await commerce.store.simulateOrder({ items: [{ variant_id: medium.id, quantity: 1 }] });
const order = sim!.order;
console.log(`Order #${order.number} is ${order.status}: ${order.total} cents`);

const { data: shipped } = await commerce.orders.fulfill(order.id, { carrier: "USPS", tracking_number: "9400100000000000000000" });
console.log("Tracking page for the customer:", shipped?.tracking_page_url);
