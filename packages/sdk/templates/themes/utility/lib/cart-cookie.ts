// The cart lives in a cookie: no database, works with server components and server actions.
import { cookies } from "next/headers";

export type CartLine = { variant_id: string; quantity: number };
export const CART_COOKIE = "shop_cart";
export const CHECKOUT_COOKIE = "shop_checkout";

export async function readCart(): Promise<CartLine[]> {
  try {
    const raw = (await cookies()).get(CART_COOKIE)?.value;
    const lines = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return lines.filter((l) => typeof l.variant_id === "string" && Number.isInteger(l.quantity) && l.quantity > 0).slice(0, 50);
  } catch {
    return [];
  }
}

export async function writeCart(lines: CartLine[]) {
  (await cookies()).set(CART_COOKIE, JSON.stringify(lines.filter((l) => l.quantity > 0)), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}
