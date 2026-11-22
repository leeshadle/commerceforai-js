// CommerceForAI client for server code. The API key is a secret: never import this from a "use client" file.
// With no COMMERCEFORAI_API_KEY the theme runs on demo products, so it can be previewed without a store.
import { Commerce } from "commerceforai";
import type { Product } from "commerceforai";
import { demoProducts } from "./demo";

const key = process.env.COMMERCEFORAI_API_KEY;
const client = key ? new Commerce(key) : null;
export const isDemo = !client;

export async function listProducts(): Promise<Product[]> {
  if (!client) return demoProducts;
  const { data, error } = await client.products.list({ active: true, limit: 100 });
  if (error) throw new Error(error.message);
  return data.data.filter((p) => p.variants.some((v) => v.active));
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!client) return demoProducts.find((p) => p.id === id) ?? null;
  const { data } = await client.products.get(id);
  return data && data.active ? data : null;
}

export async function createCheckout(items: { variant_id: string; quantity: number }[], origin: string) {
  if (!client) return { url: null as string | null, error: "Demo mode: set COMMERCEFORAI_API_KEY to check out." };
  const { data, error } = await client.checkouts.create({
    items,
    success_url: `${origin}/thanks`,
    cancel_url: `${origin}/cart`,
  });
  return { url: data?.url ?? null, error: error?.message ?? null };
}

export const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export const fromPrice = (p: Product) => {
  const prices = p.variants.filter((v) => v.active).map((v) => v.price);
  const min = Math.min(...prices);
  return { min, varies: Math.max(...prices) !== min, currency: p.variants[0]?.currency ?? "usd" };
};
