# commerceforai

Products, inventory, checkout, orders, shipping, returns and print-on-demand on top of your own Stripe account. One API key, built for you and your AI coding agent.

```bash
npm install commerceforai
```

```ts
import { Commerce } from "commerceforai";

const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY);

const { data: product, error } = await commerce.products.create({ name: "Trail Tee", price: 3600, inventory: 25 });
const { data: checkout } = await commerce.checkouts.create({
  items: [{ variant_id: product!.variants[0]!.id, quantity: 1 }],
  success_url: "https://yoursite.com/thanks",
});
// Send the customer to checkout.url
```

Every method returns `{ data, error }`. All money is an integer in cents.

## From nothing to a tested store (for coding agents)

```bash
npx commerceforai init                     # free test store, no sign-up; saves COMMERCEFORAI_API_KEY to .env.local
npx commerceforai init --template nextjs   # Next.js App Router: also adds /shop (grid, product pages, cart, checkout)
```

Products with sizes or colors are variants:

```ts
await commerce.products.create({
  name: "Trail Tee",
  variants: ["S", "M", "L"].map((size) => ({ name: size, options: { Size: size }, sku: `TEE-${size}`, price: 2500, inventory: 20 })),
});
// Many at once: commerce.products.createMany([...]) (up to 100)
```

Prove a purchase works without a browser:

```bash
npx commerceforai test-order    # buys in-stock variants on the test store and prints the paid order
```

Stripe's hosted checkout page doesn't run in headless browsers, so don't try to script it. `test-order`
(in code: `commerce.store.simulateOrder({ items })`, MCP: `simulate_order`) runs the same purchase path:
stock is committed, the order is created and paid, events and your webhooks fire. It never charges a card or
emails anyone. To pay by hand in your own browser, use card 4242 4242 4242 4242.

Then: `commerce.store.setupStatus()` lists what's left before real orders, `npx commerceforai claim` puts the
test store in the owner's dashboard, and `npx commerceforai go-live` connects Stripe for real orders.

Your data stays yours: payments run on your own Stripe account, and `npx commerceforai export` saves products,
orders, customers and everything else as JSON.

## What's included

- `commerceforai`: products, variants, inventory, checkouts, orders, returns, shipping labels, collections, discounts, customers, reports, webhooks, image hosting, Printify tools, test/live sync
- `commerceforai/react`: `CartProvider`, `useCart`, `useVariantPicker`, `useClearCartOnSuccess` (draw nothing, fit any design)
- `commerceforai/cart`: the same cart logic with no framework
- `createCheckoutHandler()`: a one-line server route for your cart

## Links

- [Docs](https://commerceforai.com/docs)
- [Quickstart](https://commerceforai.com/docs/quickstart)
- [For AI agents: llms.txt](https://commerceforai.com/llms.txt)
- [MCP server](https://www.npmjs.com/package/@commerceforai/mcp)

MIT licensed.
