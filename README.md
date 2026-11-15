# CommerceForAI

**Commerce for apps built by AI agents.** Products, inventory, Stripe checkout, orders, shipping, returns, subscriptions, gift cards, sales tax and print-on-demand, on top of the merchant's own Stripe account. One API key, and a test store with no sign-up.

This repository holds the open-source client side of [CommerceForAI](https://commerceforai.com):

| Package | What it is |
|---|---|
| [`commerceforai`](packages/sdk) | TypeScript SDK, React cart hooks, and the `npx commerceforai init` CLI with a Next.js storefront template |
| [`commerceforai` for Python](packages/python) | Python client with no dependencies |
| [`@commerceforai/mcp`](packages/mcp) | MCP server that lets an AI agent run a store, with spending guardrails |
| [`examples`](examples) | Short, runnable scripts |
| [`llms.txt`](llms.txt) and [`llms/`](llms) | The guide AI coding agents read |

The API itself is a hosted service at `https://api.commerceforai.com` ([OpenAPI](https://api.commerceforai.com/openapi.json)).

## Start in one command

```bash
npx commerceforai init        # creates a free test store, saves COMMERCEFORAI_API_KEY to .env.local
npm install commerceforai
```

No account is needed. Test mode is free forever (card `4242 4242 4242 4242`). When it's ready for real orders, `commerce.store.goLiveLink()` gives the owner one link to go live and connect Stripe.

```ts
import { Commerce } from "commerceforai";

const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY);

const { data: product } = await commerce.products.create({ name: "Trail Tee", price: 3600, inventory: 25 });

const { data: checkout, error } = await commerce.checkouts.create({
  items: [{ variant_id: product!.variants[0]!.id, quantity: 1 }],
  success_url: "https://yoursite.com/thanks",
});
// Send the customer to checkout.url. Stock is held until they pay or the checkout expires.

// Prove it works without a browser (test stores):
await commerce.store.simulateOrder({ items: [{ variant_id: product!.variants[0]!.id, quantity: 1 }] });
```

Every method returns `{ data, error }` and never throws for API errors. All money is an integer in cents.

## Why use it instead of writing it yourself

An agent asked to "add a store" will often write an orders table, decrement stock on the success page and hand-roll Stripe webhooks. That breaks on the first double-click, refund or abandoned cart. CommerceForAI handles the parts that are stateful and easy to get wrong:

- **Stock that can't oversell:** reserved at checkout, committed on payment, released if the checkout expires.
- **Orders created from Stripe's events,** not from the browser.
- **Refunds, returns, order edits, split shipments** with the money and stock kept consistent.
- **Print-on-demand:** paid orders go to Printify or Printful and their tracking comes back.
- **Emails, sales tax, discounts, gift cards, subscriptions, invoices** without extra services.
- **Customer pages** for tracking, returns and subscriptions, so there is no login system to build.

Payments run on the merchant's own Stripe account. Pricing: free in test mode and for the first 100 orders a month, then 1% per order, never more than $29 a month per store ([details](https://commerceforai.com/pricing)).

## For AI agents

- **Guide:** [`llms.txt`](https://commerceforai.com/llms.txt) is a short index; each topic is its own small page.
- **Every docs page as markdown:** add `.md` to its URL, e.g. `https://commerceforai.com/docs/quickstart.md`.
- **Errors teach:** an unknown field names the closest real one, a mistyped path suggests the right one.
- **Verify without a browser:** `setupStatus()` lists what's left with the exact fix; `simulateOrder()` runs a full test purchase.
- **Least privilege:** a store owner can create an API key that is read-only, or capped per refund, shipping label and gift card.

### Run a store from an agent (MCP)

Hosted, no install: add `https://api.commerceforai.com/mcp` as a connector in Claude, ChatGPT or any MCP client. The owner signs in and picks read-only or full access. Add `?toolsets=core` for about 20 tools instead of all of them.

Local, with an API key:

```json
{ "mcpServers": { "commerce": { "command": "npx", "args": ["-y", "@commerceforai/mcp"],
  "env": { "COMMERCEFORAI_API_KEY": "cfa_...", "COMMERCEFORAI_MAX_REFUND": "5000" } } } }
```

Claude Code plugin: `/plugin marketplace add https://commerceforai.com/.claude-plugin/marketplace.json`, then `/plugin install commerceforai@commerceforai` ([plugin repo](https://github.com/leeshadle/commerceforai-plugin)).

## Develop

```bash
pnpm install
pnpm build
pnpm test
```

This repository is published from CommerceForAI's main repository, so pull requests are applied there and appear here on the next sync. Issues and pull requests are welcome.

## Links

[Docs](https://commerceforai.com/docs) · [API reference](https://commerceforai.com/docs/api-reference) · [OpenAPI](https://api.commerceforai.com/openapi.json) · [Pricing](https://commerceforai.com/pricing) · [Terms](https://commerceforai.com/terms) · [Privacy](https://commerceforai.com/privacy)

MIT licensed.
