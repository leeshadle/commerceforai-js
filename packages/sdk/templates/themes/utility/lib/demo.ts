// Demo catalog used when no API key is set. Neutral placeholder products and art (no reference-store content).
import type { Product, Variant } from "commerceforai";

const now = "2026-11-19T00:00:00Z";
const SIZES = ["S", "M", "L", "XL"];

type Seed = { id: string; name: string; kind: "tee" | "crew" | "cap" | "tote"; colors: [string, string][]; price: number; description: string };

const seeds: Seed[] = [
  { id: "prod_demo_ridge", name: "Ridge Line Tee", kind: "tee", price: 3400, colors: [["Bone", "#e9e4d8"], ["Pine", "#2f4a3a"]], description: "Heavyweight cotton tee with a single-line mountain ridge printed across the chest. Garment dyed, boxy fit." },
  { id: "prod_demo_trail", name: "Trail Marker Crew", kind: "crew", price: 6800, colors: [["Rust", "#a4532f"], ["Charcoal", "#38383a"]], description: "Loopback fleece crewneck with an embroidered trail blaze on the left chest." },
  { id: "prod_demo_canyon", name: "Canyon Sun Tee", kind: "tee", price: 3400, colors: [["Sand", "#d8c3a0"], ["White", "#f6f5f1"]], description: "Soft-washed tee with a setting-sun graphic in two inks." },
  { id: "prod_demo_ranger", name: "Ranger Cap", kind: "cap", price: 3200, colors: [["Olive", "#5b6142"], ["Navy", "#26324a"]], description: "Six-panel washed cotton cap with a brass buckle and tonal embroidery." },
  { id: "prod_demo_field", name: "Field Notes Tote", kind: "tote", price: 2800, colors: [["Natural", "#e6dcc6"]], description: "14 oz canvas tote with an interior pocket. Fits a field guide and a thermos." },
  { id: "prod_demo_lake", name: "Still Lake Tee", kind: "tee", price: 3400, colors: [["Lake", "#5f7f95"], ["Bone", "#e9e4d8"]], description: "A quiet lake and treeline, screen printed in a single ink." },
  { id: "prod_demo_summit", name: "Summit Crew", kind: "crew", price: 6800, colors: [["Heather", "#a8a7a2"]], description: "Midweight crewneck with a summit elevation printed on the sleeve." },
  { id: "prod_demo_camp", name: "Camp Mug Tee", kind: "tee", price: 3400, colors: [["Ink", "#1f2329"], ["Bone", "#e9e4d8"]], description: "A tin camp mug, steam and all. Printed on a relaxed-fit tee." },
];

const img = (kind: Seed["kind"], hex: string) => `/demo/${kind}-${hex.slice(1)}.svg`;

export const demoProducts: Product[] = seeds.map((s) => {
  const sizes = s.kind === "tee" || s.kind === "crew" ? SIZES : ["One size"];
  const variants: Variant[] = s.colors.flatMap(([color]) =>
    sizes.map((size, i) => ({
      object: "variant",
      id: `${s.id}_${color.toLowerCase()}_${size.toLowerCase().replace(" ", "")}`,
      product_id: s.id,
      name: sizes.length > 1 ? `${color} / ${size}` : color,
      sku: null,
      options: sizes.length > 1 ? { Color: color, Size: size } : { Color: color },
      price: s.price,
      currency: "usd",
      weight_oz: null,
      fulfillment: null,
      recurring: null,
      inventory: { available: i === 3 && color === "Pine" ? 0 : null },
      active: true,
      created_at: now,
      updated_at: now,
    }) as unknown as Variant),
  );
  return {
    object: "product",
    id: s.id,
    name: s.name,
    description: s.description,
    images: s.colors.map(([, hex]) => img(s.kind, hex)),
    metadata: {},
    active: true,
    print_files: null,
    variants,
    created_at: now,
    updated_at: now,
  } as Product;
});

/** Every image the demo catalog references, for scripts/demo-art.mjs. */
export const demoArt = seeds.flatMap((s) => s.colors.map(([, hex]) => ({ kind: s.kind, hex })));
