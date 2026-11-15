// CommerceForAI client for server code (server components, server actions, route handlers).
// The API key is a secret: never import this file from a "use client" component.
import { Commerce } from "commerceforai";

if (!process.env.COMMERCEFORAI_API_KEY) {
  console.warn("COMMERCEFORAI_API_KEY is not set. Run `npx commerceforai init` or add it to .env.local.");
}

export const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY ?? "");

export const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
