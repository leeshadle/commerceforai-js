# @commerceforai/mcp

An MCP server for e-commerce: let an AI agent run your online store on your own Stripe account. Products, inventory, Stripe checkout, orders, refunds, shipping labels, returns, discounts, gift cards, subscriptions, reports, image hosting, print-on-demand (Printify and Printful import) and test/live sync, through [CommerceForAI](https://commerceforai.com).

Works with Claude, ChatGPT, Cursor and any MCP client. Refunds and shipping labels are capped by limits the store owner sets; over a cap, the owner is asked to approve. Test-mode stores need no sign-up: `npx commerceforai init`.

Not for in-person sales: there is no point-of-sale app. See [how it compares](https://commerceforai.com/docs/compare).

## No install: hosted server

In Claude.ai, ChatGPT or any MCP client that supports remote servers, add `https://api.commerceforai.com/mcp`. You sign in, pick a store, and choose read-only or full access.

## Local (stdio), with an API key

```json
{
  "mcpServers": {
    "commerce": {
      "command": "npx",
      "args": ["-y", "@commerceforai/mcp"],
      "env": { "COMMERCEFORAI_API_KEY": "cfa_...", "COMMERCEFORAI_MAX_REFUND": "5000" }
    }
  }
}
```

## Guardrails

| Variable | Effect |
|---|---|
| `COMMERCEFORAI_READ_ONLY=true` | Only read tools are offered |
| `COMMERCEFORAI_MAX_REFUND` | Largest refund in cents (default 5000) |
| `COMMERCEFORAI_MAX_LABEL_COST` | Largest shipping label in cents (default 5000) |

| `COMMERCEFORAI_TOOLS` | Comma-separated allowlist of tools |

Over either cap, the store owner is asked to approve instead (email + dashboard); the agent checks the outcome with `get_approval`.

[Docs](https://commerceforai.com/docs/guides/agents) · MIT licensed.
