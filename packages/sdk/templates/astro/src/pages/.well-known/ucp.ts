// Your store's Universal Commerce Protocol profile, served on your own domain so shopping agents can find it.
// Agents read https://your-site/.well-known/ucp, then search, check out and hand the buyer a payment page.
import type { APIRoute } from "astro";
import { commerce } from "../../lib/commerce";

export const prerender = false;

export const GET: APIRoute = async () => {
  const { data } = await commerce.store.get();
  if (!data) return Response.json({ error: "store unavailable" }, { status: 503 });
  const base = ((import.meta.env.COMMERCEFORAI_BASE_URL ?? process.env.COMMERCEFORAI_BASE_URL) || "https://api.commerceforai.com").replace(/\/$/, "");
  const res = await fetch(`${base}/agent/${data.id}/ucp/profile`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
};
