# commerceforai (Python)

Products, inventory, Stripe checkout, orders, shipping, returns, subscriptions and gift cards, on the merchant's own Stripe account. No dependencies.

```bash
pip install commerceforai
```

```python
from commerceforai import Commerce, CommerceError, create_test_store

store = create_test_store("My shop")     # a free test store, no sign-up; keep store["api_key"]
commerce = Commerce(store["api_key"])    # or Commerce() with COMMERCEFORAI_API_KEY set

product = commerce.products.create(name="Trail Tee", price=3600, inventory=25)
variant = product["variants"][0]["id"]

checkout = commerce.checkouts.create(items=[{"variant_id": variant, "quantity": 1}], success_url="https://example.com/thanks")
print(checkout["url"])                   # send the customer here

# Test stores can run the whole purchase without a browser:
order = commerce.store.simulate_order(items=[{"variant_id": variant, "quantity": 1}])["order"]
commerce.orders.fulfill(order["id"], carrier="USPS", tracking_number="9400100000000000000000")

try:
    commerce.orders.refund(order["id"], amount=500)
except CommerceError as e:
    print(e.type, e.message)             # e.g. permission_error when the key has a refund cap
```

Responses are plain dicts and lists. Money is an integer in cents. Errors raise `CommerceError` with `type`, `message` and extra fields such as `param` or `available`.

Resources: `products`, `variants`, `inventory`, `checkouts`, `orders`, `returns`, `collections`, `discounts`, `customers`, `draft_orders`, `gift_cards`, `subscriptions`, `store`, `events`, `webhooks`, `reports`. Anything else: `commerce.request("GET", "/v1/...")` ([OpenAPI](https://api.commerceforai.com/openapi.json)).

Webhooks (Flask example):

```python
from commerceforai import verify_webhook

event = verify_webhook(request.get_data(), request.headers, os.environ["COMMERCEFORAI_WEBHOOK_SECRET"])
if event["type"] == "order.paid": ...
```

Docs: https://commerceforai.com/docs · Agent guide: https://commerceforai.com/llms.txt · MIT licensed.
