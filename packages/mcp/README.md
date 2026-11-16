# @commerceforai/mcp

Let an AI agent run your [CommerceForAI](https://commerceforai.com) store: products, inventory, orders, fulfillment, returns, discounts, reports, image hosting, Printify and test/live sync.

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

Over either cap, the store owner is asked to approve instead (email + dashboard); the agent checks the outcome with `get_approval`.
| `COMMERCEFORAI_TOOLS` | Comma-separated allowlist of tools |

[Docs](https://commerceforai.com/docs/guides/agents) · MIT licensed.
