# CommerceForAI: Print-on-demand

> Printful and Printify: connecting, mapping variants, per-order artwork, creating products in Printify, how orders are sent and shipped.

Part of https://commerceforai.com/llms.txt (start there: setup, rules and the core recipe). SDK calls are `commerce.<resource>.<method>(...)` and return `{ data, error }`; money is in cents.

- missed provider notifications heal themselves: unshipped Printify/Printful orders are re-checked with the provider every 6 hours.
- print-on-demand: store.configureFulfillment({ provider: "printful", api_key } | { provider: "printify", api_key, printify_shop_id }, auto_confirm? = false) — call once per provider; both can be connected and each variant routes to the provider it's mapped to (an order can split across both)
- connecting imports the products already set up in that Printify shop / Printful store automatically (background, upsert by SKU; prices you edit are kept). Re-run: store.importCatalog({ provider? }) · MCP import_catalog · progress in store.get().fulfillment[].catalog_import
- Printful options: variant fulfillment.printful_options (item options, e.g. embroidery_type) and print_files[].options (e.g. thread_colors); embroidery uses Printful placements like "embroidery_chest_left"
- an order is marked fulfilled automatically only when every item is print-on-demand and every provider has shipped; each package emits order.shipment_created
- Printify without the token (uses the connected shop): printify.blueprints({ q: "heavy cotton tee" }) → printify.providers(blueprintId) → printify.variants(blueprintId, providerId) gives variant ids per color/size and placements. Then printify.createProduct(productId, { blueprint_id, print_provider_id, print_files?, fixed_options?: { color: "Black" }, use_mockups? }) creates it in the Printify shop (artwork, prices, mockups) and maps the variants. MCP: printify_catalog, create_in_printify. To list on Etsy through Printify: connect a Printify store that's linked to Etsy, then printify.createProduct(id, { ..., publish: true }) or printify.publish(id) (MCP publish_in_printify); printify.shop() shows the store's sales_channel. API-only Printify stores can't publish. Or skip creating Printify products: map variants to { printify: { blueprint_id, print_provider_id, variant_id } } with print_files and orders are printed from catalog ids.
- map a variant (exactly one): fulfillment: { printful_variant_id: 4012 } or { printful_sync_variant_id } (existing Printful store product, no files) or { printify: { blueprint_id, print_provider_id, variant_id } } (per-order artwork) or { printify: { product_id, variant_id } } (existing Printify product); optional default print_files
- test stores never send orders to Printify/Printful (test-card orders would be printed, shipped and billed for real); opt in with store.update({ send_test_orders_to_providers: true }). Live stores always send.
- paid orders with mapped variants are sent automatically (held for approval unless auto_confirm); provider shipments mark the order fulfilled with tracking
- order.fulfillment_provider_order shows { provider, id, status }; status "submit_failed" + a fulfillment.failed event means fix it (e.g. add a print file) and call orders.submitFulfillment(order)

## Recipe: custom print-on-demand product (e.g. a shirt printed with the buyer's choices)

```ts
// 1. Render the buyer's artwork to a PNG at a public https URL (your app's job), then:
const { data } = await commerce.checkouts.create({
  items: [{
    variant_id, quantity: 1,
    properties: { name: "Riley", parks: "Zion, Arches, Yosemite" },
    print_files: [{ placement: "front", url: "https://yoursite.com/print/abc123.png" }],
  }],
  success_url: "https://yoursite.com/thanks",
});
// 2. Redirect to data.url. On payment the order goes to Printful/Printify with that file; shipping marks it fulfilled.
```
