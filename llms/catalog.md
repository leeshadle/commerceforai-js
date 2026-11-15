# CommerceForAI: Catalog

> Products, variants, stock, collections, image hosting, buy links without a website, and importing from Shopify.

Part of https://commerceforai.com/llms.txt (start there: setup, rules and the core recipe). SDK calls are `commerce.<resource>.<method>(...)` and return `{ data, error }`; money is in cents.

- products: create({ name, price, inventory? } | { name, variants: [{ name, price, sku?, inventory? }] }), list({ active?, q?, collection?: "mugs" }), get, update, archive, addVariant
  - product-level `print_files` = default artwork for every variant (variant print_files and checkout-line print_files override it)
  - `inventory` omitted/null = unlimited stock (not tracked)
- collections: create({ name, product_ids?, description?, image? }), list(), get(idOrHandle), update(idOrHandle, { name?, product_ids? (replaces, in order) }), addProducts(c, ids), removeProduct(c, id), delete(c). Handle defaults from the name; products.list({ collection }) filters.
- buy links (no website needed): every store has a public page at store.get().hosted_store_url (commerceforai.com/s/<store_id>) and a page per product (/s/<store_id>/<handle or id>) that opens Stripe checkout. Turn off: store.update({ hosted_pages: false }).
- variants: update(id, { price?, name?, sku?, active? })
- inventory: list({ low_stock_threshold? }), adjust(variantId, +n | -n, reason?), set(variantId, onHand, reason?)
  - variant.inventory = { tracked, on_hand, reserved, available }
- moving from Shopify: store.importFromShopify({ csv }) with the contents of Shopify's product export (Products → Export), or { shop: "your-store.myshopify.com", access_token } from a custom app (read_products, read_inventory). MCP: import_from_shopify. Brings products, variants, options, SKUs, prices, stock, images, descriptions; safe to re-run.
  - history too: store.importFromShopify({ orders_csv, customers_csv }) with Shopify's order export (Orders → Export) and customer export (Customers → Export). Import products first so order lines link by SKU. Past orders arrive as records (order.imported: true) with Shopify's order numbers where free: nothing is charged, emailed, sent to a print provider, taken from stock or counted toward fees; they appear in orders, customers, reports and the customer's account page. Unpaid and pending orders are left out. The customer export carries over tax-exempt status. Discount codes aren't in Shopify's exports: recreate them with discounts.create. Safe to re-run.

## Image hosting (included, 5 GB per store)

- files.upload(bytes | Blob, { filename }) or files.upload({ url }) → { url: "https://cdn.commerceforai.com/...", width, height, bytes }. PNG, JPEG, WebP up to 25 MB; metadata removed; identical images stored once; URLs never change. REST: POST /v1/files (multipart `file`, or JSON { url } / { data: base64, filename }). MCP: upload_image.
- Use the URL for product images, print_files (Printify/Printful fetch it), and the email logo. No S3/Cloudinary setup needed.
- Products using images from other sites: files.copyAllProductImages() (repeat until remaining is 0) or files.copyProductImages(productId) copies them to the CDN and updates the products. MCP: copy_product_images.
