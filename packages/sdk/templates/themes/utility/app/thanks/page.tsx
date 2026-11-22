import Link from "next/link";

export const metadata = { title: "Thank you" };

// Stripe redirects here after payment; CommerceForAI records the order from Stripe's webhook.
export default function Thanks() {
  return (
    <div className="px-gutter py-32 text-center">
      <h1 className="text-[40px]">Thank you.</h1>
      <p className="label mt-3 text-[13px]">Your order is in. A receipt is on its way to your inbox.</p>
      <Link href="/collection" className="btn btn-outline mt-8">Keep shopping</Link>
    </div>
  );
}
