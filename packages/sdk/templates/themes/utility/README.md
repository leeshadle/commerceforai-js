# utility: a CommerceForAI storefront theme

Technical-catalogue minimalism: tracked monospace for labels and prices, a neutral grotesk for names and headings,
products on flat grey tiles, square corners. The look is based on our measurements of a reference store
(https://commerceforai.com/inspiration#notom); this is a clean reimplementation with no code, assets or copy from it.

Live demo: https://commerceforai-theme-utility.vercel.app · Theme page: https://commerceforai.com/themes/utility

Stack: Next.js 16 (App Router) + Tailwind v4 + the `commerceforai` SDK. Checkout is Stripe Checkout via CommerceForAI.

```bash
npx degit leeshadle/commerceforai-js/packages/sdk/templates/themes/utility my-store
cd my-store && npm install
npm run dev                # demo products, no key needed
npx commerceforai init     # free test store + COMMERCEFORAI_API_KEY in .env.local: your products, real test checkout
```

## Where things are

| file | what |
| --- | --- |
| `app/tokens.css` | **the theme**: colours, fonts, radii, spacing as `--t-*` variables |
| `app/globals.css` | maps tokens into Tailwind `@theme` (`bg-surface`, `font-mono`, `px-gutter`...) + `.label`, `.btn` |
| `lib/site.ts` | store name, announcement, hero and intro copy |
| `lib/commerce.ts` | SDK client; falls back to `lib/demo.ts` with no API key |
| `lib/actions.ts` | add to cart, change quantity, checkout (server actions) |
| `app/page.tsx` | home: full-bleed hero, intro, 2-up featured, split category tiles |
| `app/collection/page.tsx` | 4-column edge-to-edge grid (2 on mobile) |
| `app/products/[id]/` | 3-tile gallery strip, narrow info column, colour dots + size buttons |
| `app/cart/page.tsx` | table cart, quantity stepper, estimated total, solid checkout |

The cart is a cookie (variant ids + quantities), so there's no database.
