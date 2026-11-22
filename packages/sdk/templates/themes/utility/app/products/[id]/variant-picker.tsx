"use client";

import { useMemo, useState } from "react";
import type { Variant } from "commerceforai";
import { addToCart } from "@/lib/actions";

const SWATCH: Record<string, string> = {
  bone: "#e9e4d8", pine: "#2f4a3a", rust: "#a4532f", charcoal: "#38383a", sand: "#d8c3a0", white: "#f6f5f1",
  olive: "#5b6142", navy: "#26324a", natural: "#e6dcc6", lake: "#5f7f95", heather: "#a8a7a2", ink: "#1f2329",
  black: "#111111",
};

// Colour as dots, other options (size) as tracked mono buttons; resolves to one variant id.
export function VariantPicker({ variants }: { variants: Variant[] }) {
  const optionNames = Object.keys(variants[0]?.options ?? {});
  const values = (name: string) => [...new Set(variants.map((v) => v.options[name]))];
  const firstBuyable = variants.find((v) => available(v)) ?? variants[0];
  const [picked, setPicked] = useState<Record<string, string>>(firstBuyable?.options ?? {});
  const variant = useMemo(
    () => variants.find((v) => optionNames.every((n) => v.options[n] === picked[n])),
    [variants, optionNames, picked],
  );
  const buyable = !!variant && available(variant);

  return (
    <form action={addToCart} className="mt-6 space-y-5">
      {optionNames.map((name) => (
        <fieldset key={name}>
          <legend className="label mb-2 text-[13px] normal-case tracking-[0.06em]">
            {name}: {picked[name]}
          </legend>
          <div className="flex flex-wrap gap-2">
            {values(name).map((value) => {
              const active = picked[name] === value;
              const soldOut = !variants.some((v) => v.options[name] === value && available(v) && optionNames.every((n) => n === name || v.options[n] === picked[n]));
              return name.toLowerCase() === "color" && SWATCH[value.toLowerCase()] ? (
                <button
                  key={value}
                  type="button"
                  aria-label={value}
                  aria-pressed={active}
                  onClick={() => setPicked({ ...picked, [name]: value })}
                  className={`h-5 w-5 rounded-full ring-offset-2 ${active ? "ring-1 ring-ink" : ""}`}
                  style={{ background: SWATCH[value.toLowerCase()], boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }}
                />
              ) : (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPicked({ ...picked, [name]: value })}
                  className={`label h-9 min-w-11 border px-3 text-[12px] ${active ? "border-ink text-ink" : "border-line"} ${soldOut ? "line-through opacity-40" : ""}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <input type="hidden" name="variant_id" value={variant?.id ?? ""} />
      <input type="hidden" name="quantity" value="1" />
      <button className="btn btn-outline w-full" disabled={!buyable}>
        {buyable ? "Add to cart" : "Sold out"}
      </button>
    </form>
  );
}

function available(v: Variant) {
  return v.active && (v.inventory.available === null || v.inventory.available > 0);
}
