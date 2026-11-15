"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { commerce } from "../../lib/commerce";
import { CHECKOUT_COOKIE, readCart, writeCart } from "./cart-cookie";

export async function addToCart(form: FormData) {
  const variant_id = String(form.get("variant_id") ?? "");
  const quantity = Math.max(1, Math.min(99, Number(form.get("quantity") ?? 1) || 1));
  if (!variant_id) return;
  const cart = await readCart();
  const line = cart.find((l) => l.variant_id === variant_id);
  if (line) line.quantity = Math.min(99, line.quantity + quantity);
  else cart.push({ variant_id, quantity });
  await writeCart(cart);
  redirect("/shop/cart");
}

export async function setQuantity(form: FormData) {
  const variant_id = String(form.get("variant_id") ?? "");
  const quantity = Math.max(0, Math.min(99, Number(form.get("quantity") ?? 0) || 0));
  await writeCart((await readCart()).map((l) => (l.variant_id === variant_id ? { ...l, quantity } : l)));
  revalidatePath("/shop", "layout");
}

export async function clearCart() {
  await writeCart([]);
}

/** Reserve stock and send the customer to Stripe Checkout. */
export async function checkout() {
  const cart = await readCart();
  if (!cart.length) redirect("/shop/cart");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { data, error } = await commerce.checkouts.create({
    items: cart,
    success_url: `${origin}/shop/thanks`,
    cancel_url: `${origin}/shop/cart`,
  });
  if (error || !data?.url) redirect(`/shop/cart?error=${encodeURIComponent(error?.message ?? "Checkout isn't available right now")}`);
  (await cookies()).set(CHECKOUT_COOKIE, data.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 });
  redirect(data.url);
}

export type LookupState = { error?: string; order?: { number: number; status: string; total: number; currency: string; items: { name: string; quantity: number }[]; tracking: { carrier: string | null; number: string | null; url: string | null }[] } } | null;

/** Order lookup needs both the order number and the email it was placed with. */
export async function lookupOrder(_prev: LookupState, form: FormData): Promise<LookupState> {
  const number = String(form.get("number") ?? "").replace(/^#/, "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\d+$/.test(number) || !email) return { error: "Enter your order number and email." };
  const { data } = await commerce.orders.get(Number(number));
  if (!data || (data.email ?? "").toLowerCase() !== email) return { error: "We couldn't find that order. Check the number and email." };
  const shipments = data.fulfillment?.shipments?.length
    ? data.fulfillment.shipments.map((s) => ({ carrier: s.carrier, number: s.tracking_number, url: s.tracking_url }))
    : data.fulfillment ? [{ carrier: data.fulfillment.carrier, number: data.fulfillment.tracking_number, url: data.fulfillment.tracking_url }] : [];
  return {
    order: {
      number: data.number, status: data.status.replace("_", " "), total: data.total, currency: data.currency,
      items: data.items.map((i) => ({ name: i.variant_name === "Default" ? i.product_name : `${i.product_name} (${i.variant_name})`, quantity: i.quantity })),
      tracking: shipments.filter((s) => s.number),
    },
  };
}
