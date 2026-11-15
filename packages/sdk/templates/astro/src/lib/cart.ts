// The cart lives in a cookie: no database needed.
import type { AstroCookies } from "astro";

export type CartLine = { variant_id: string; quantity: number };
const CART = "shop_cart";
export const CHECKOUT = "shop_checkout";

export function readCart(cookies: AstroCookies): CartLine[] {
  try {
    const lines = (cookies.get(CART)?.json() ?? []) as CartLine[];
    return lines.filter((l) => typeof l.variant_id === "string" && Number.isInteger(l.quantity) && l.quantity > 0).slice(0, 50);
  } catch {
    return [];
  }
}

export function writeCart(cookies: AstroCookies, lines: CartLine[]) {
  cookies.set(CART, JSON.stringify(lines.filter((l) => l.quantity > 0)), {
    httpOnly: true, sameSite: "lax", secure: import.meta.env.PROD, path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}
