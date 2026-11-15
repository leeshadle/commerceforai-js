"use client";

import { useEffect } from "react";
import { clearCart } from "../actions";

/** Empty the cart once the customer is back from Stripe (cookies can't be changed while rendering). */
export function ClearCart() {
  useEffect(() => { void clearCart(); }, []);
  return null;
}
