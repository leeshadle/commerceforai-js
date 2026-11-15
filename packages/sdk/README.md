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

No account yet? `npx commerceforai init` creates a test store and an API key without signing up.

Every method returns `{ data, error }`. All money is an integer in cents.

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
