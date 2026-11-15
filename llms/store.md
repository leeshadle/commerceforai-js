# CommerceForAI: Store settings

> Store settings, customer emails and branding, team alerts, test/live sync, Stripe branding, and selling in ChatGPT.

Part of https://commerceforai.com/llms.txt (start there: setup, rules and the core recipe). SDK calls are `commerce.<resource>.<method>(...)` and return `{ data, error }`; money is in cents.

- test/live sync (test store as staging): store.syncPreview() → { plan_id, has_changes, products: { create, update (with price changes), only_in_destination }, collections, discounts, settings }; store.sync({ plan_id }). Pulls from the other version INTO the store whose key you use, so a test key can't change live; live needs the plan_id. Never touches orders, keys, Stripe, site URLs or stock counts on existing variants. MCP: preview_store_sync, apply_store_sync. Test and live have separate API keys.
- store: get(), update({ name?, tax_enabled?, default_success_url?, default_cancel_url? })
  - tax_enabled uses Stripe Tax; it only collects tax where the merchant has active Stripe Tax registrations.
  - configureShipping({ provider: "easypost" | "shippo", api_key, ship_from, default_parcel? })
  - configureEmails({ resend_api_key, from, reply_to?, events? }) → sends order confirmation / shipped / refunded / return approved
  - configureStorefront({ product_url_template: "https://site.com/products/{handle}", brand?, return_policy_url?, return_window_days?, agent_access? })
    → publishes store.feeds.acp (OpenAI product feed), store.feeds.google (Merchant Center XML), store.feeds.agent (public agent API)
- emails: emails.list({ order_id? }) — log of customer emails; emails.preview(template) → { subject, html, text }; emails.sendTest({ template?: "all" }) emails previews to the owner (MCP send_test_emails)
  - branding: store.update({ email_brand: { logo_url: "https://...", accent_color: "#2f6f4e", address: "..." } }) (MCP brand_emails). Templates: order_confirmation, order_shipped, package_shipped, package_delivered, order_refunded, return_approved, checkout_recovery (has an unsubscribe link).
  - team alerts (on by default): store.update({ owner_alerts: { new_order: true, low_stock_threshold: 3, delivery_problem: true } }); null threshold turns low-stock emails off; delivery_problem emails the team when a package is returned or can't be delivered
- order emails work out of the box: with no email provider, CommerceForAI sends confirmation/shipped/refund/return emails under the store's name from orders@commerceforai.com, replies to the owner (live stores; test stores only email their own members). Opt out: store.update({ builtin_emails: false }). Own domain: store.configureEmails({ resend_api_key, from }).
- Sell in ChatGPT: store.chatgpt() (MCP chatgpt_channel) returns readiness steps, the answers for OpenAI's merchant application and its status; the owner submits the form themselves at chatgpt.com/merchants, then record it with store.updateChatgpt({ status: "applied" }) (MCP update_chatgpt_channel).
- ChatGPT shopping: store.checkFeed() (MCP check_product_feed) lists what OpenAI would reject per item; fix errors before the owner applies at chatgpt.com/merchants. Feed: /feeds/<store>/acp.json (JSON) and /feeds/<store>/openai.jsonl.gz (upload format), current OpenAI field names, no null placeholders.
- store.get() → stripe_branding (linked Stripe accounts): if matches is false, customers see another name at checkout/on statements; tell the owner the suggested values and fix_url (only they can change it in Stripe).

