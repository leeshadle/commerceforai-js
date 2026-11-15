// Verify and handle order events. Works in any runtime with the Fetch API (Next.js route handlers, Hono, Workers).
// Register the endpoint once:  await commerce.webhooks.create({ url: "https://yoursite.com/api/commerce-webhook" })
// and keep the `secret` it returns in COMMERCEFORAI_WEBHOOK_SECRET.
import { Commerce, type Order } from "commerceforai";

const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY!);

export async function POST(request: Request) {
  const payload = await request.text();
  // Pass the raw body, not parsed JSON. Throws if the signature is wrong or too old.
  const event = await commerce.webhooks.verify({ payload, headers: request.headers, secret: process.env.COMMERCEFORAI_WEBHOOK_SECRET! }).catch(() => null);
  if (!event) return new Response("Bad signature", { status: 400 });

  switch (event.type) {
    case "order.paid":
      // Stock is already committed and the customer already has a confirmation email.
      console.log("New order", (event.data as Order).number);
      break;
    case "order.shipment_delivered":
      console.log("Delivered", (event.data as Order).number);
      break;
  }
  // Events are also available by polling: commerce.events.list({ after, type: "order.*" })
  return new Response("ok");
}
