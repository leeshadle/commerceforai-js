"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createCheckout } from "./commerce";
import { readCart, writeCart } from "./cart-cookie";

export async function addToCart(form: FormData) {
  const variant_id = String(form.get("variant_id") ?? "");
  const quantity = Math.max(1, Math.min(99, Number(form.get("quantity") ?? 1) || 1));
  if (!variant_id) return;
  const cart = await readCart();
  const line = cart.find((l) => l.variant_id === variant_id);
  if (line) line.quantity = Math.min(99, line.quantity + quantity);
  else cart.push({ variant_id, quantity });
  await writeCart(cart);
  redirect("/cart");
}

export async function setQuantity(form: FormData) {
  const variant_id = String(form.get("variant_id") ?? "");
  const quantity = Math.max(0, Math.min(99, Number(form.get("quantity") ?? 0) || 0));
  await writeCart((await readCart()).map((l) => (l.variant_id === variant_id ? { ...l, quantity } : l)));
  revalidatePath("/", "layout");
}

/** Send the customer to Stripe Checkout (hosted), via CommerceForAI. */
export async function checkout() {
  const cart = await readCart();
  if (!cart.length) redirect("/cart");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { url, error } = await createCheckout(cart, origin);
  if (!url) redirect(`/cart?error=${encodeURIComponent(error ?? "Checkout isn't available right now")}`);
  redirect(url);
}
