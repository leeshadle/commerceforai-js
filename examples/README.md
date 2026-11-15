# Examples

Each file is a short script. Get a free test store first:

```bash
npx commerceforai init --no-write   # prints a test API key
export COMMERCEFORAI_API_KEY=cfa_test_...
npx tsx examples/01-first-sale.ts
```

| File | Shows |
|---|---|
| `01-first-sale.ts` | Create a product, start a checkout, simulate the payment, ship it |
| `02-webhooks.ts` | Verify and handle order events in a server route |
| `03-edit-and-refund.ts` | Swap a size on a paid order with a preview, then refund part of it |
| `04-subscription.ts` | Sell a monthly subscription and simulate a renewal |
