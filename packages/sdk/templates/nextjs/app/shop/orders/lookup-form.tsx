"use client";

import { useActionState } from "react";
import { lookupOrder, type LookupState } from "../actions";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export function LookupForm() {
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupOrder, null);
  return (
    <>
      <form action={action}>
        <label className="cfa-field">Order number<input name="number" inputMode="numeric" placeholder="1001" required /></label>
        <label className="cfa-field">Email<input name="email" type="email" required /></label>
        <button className="cfa-button" disabled={pending}>{pending ? "Looking…" : "Find order"}</button>
      </form>
      {state?.error ? <p className="cfa-alert" style={{ marginTop: 16 }}>{state.error}</p> : null}
      {state?.order ? (
        <div style={{ marginTop: 24 }}>
          <p><strong>Order #{state.order.number}</strong> · {state.order.status} · {money(state.order.total, state.order.currency)}</p>
          <ul className="cfa-muted">{state.order.items.map((i) => <li key={i.name}>{i.name} × {i.quantity}</li>)}</ul>
          {state.order.tracking.map((t) => (
            <p key={t.number} className="cfa-muted">
              Shipped{t.carrier ? ` with ${t.carrier}` : ""}: {t.url ? <a href={t.url}>{t.number}</a> : t.number}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
