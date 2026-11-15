import { LookupForm } from "./lookup-form";

export const metadata = { title: "Find an order" };

export default function OrdersPage() {
  return (
    <div>
      <h1 className="cfa-h1">Find an order</h1>
      <p className="cfa-muted">Enter your order number and the email you used at checkout.</p>
      <LookupForm />
    </div>
  );
}
