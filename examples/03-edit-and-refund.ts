// Swap a size on a paid order (with a preview first), then refund part of it.
import { Commerce } from "commerceforai";

const commerce = new Commerce(process.env.COMMERCEFORAI_API_KEY!);
const [orderId, fromVariant, toVariant] = process.argv.slice(2) as [string, string, string];

// dry_run shows the refund and any print-on-demand order that would be cancelled and sent again.
const { data: preview, error } = await commerce.orders.edit(orderId, {
  replace: [{ variant_id: fromVariant, with_variant_id: toVariant }],
  dry_run: true,
});
if (error) throw new Error(error.message); // e.g. already shipped, or the swap costs more (pass waive_difference)
console.log(preview.changes, "refund:", preview.refund);

const { data: edit } = await commerce.orders.edit(orderId, { replace: [{ variant_id: fromVariant, with_variant_id: toVariant }] });
console.log("Now ships:", edit?.order.items.map((i) => `${i.quantity} × ${i.product_name} (${i.variant_name})`));

// A goodwill refund of $5. A key with a refund cap fails here with error.type "permission_error".
const { error: refundError } = await commerce.orders.refund(orderId, { amount: 500 });
if (refundError) console.log("Hand this to the store owner:", refundError.message);
