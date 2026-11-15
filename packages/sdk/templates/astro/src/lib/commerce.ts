// CommerceForAI client for server code (.astro frontmatter, endpoints). The API key is a secret: never use it in a <script>.
import { Commerce } from "commerceforai";

const key = import.meta.env.COMMERCEFORAI_API_KEY ?? process.env.COMMERCEFORAI_API_KEY;
if (!key) console.warn("COMMERCEFORAI_API_KEY is not set. Run `npx commerceforai init` or add it to .env.");

export const commerce = new Commerce(key || "cfa_test_missing");

export const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

/** The store's name and its customer account page ("My orders"), loaded once per server process. */
let storeInfo: Promise<{ name: string; accountUrl: string | null }> | null = null;
export function store() {
  storeInfo ??= commerce.store.get().then(({ data }) => ({ name: data?.name ?? "Shop", accountUrl: (data as { customer_account_url?: string } | null)?.customer_account_url ?? null }));
  return storeInfo;
}
