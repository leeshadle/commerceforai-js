import { describe, expect, it } from "vitest";
import { addLine, initialSelection, parseLines, pickVariant, resolveCart, setLineQuantity, MAX_QUANTITY, type CatalogProduct } from "../src/cart-core";
import { Commerce, createCheckoutHandler } from "../src/index";

const tee: CatalogProduct = {
  id: "pr_tee", name: "Trail Tee", images: [],
  variants: [
    { id: "v_s_green", name: "S / Green", price: 3000, currency: "usd", options: { Size: "S", Color: "Green" }, inventory: { available: 0 } },
    { id: "v_m_green", name: "M / Green", price: 3000, currency: "usd", options: { Size: "M", Color: "Green" }, inventory: { available: 4 } },
    { id: "v_m_sand", name: "M / Sand", price: 3200, currency: "usd", options: { Size: "M", Color: "Sand" }, inventory: { available: null } },
    { id: "v_l_sand", name: "L / Sand", price: 3200, currency: "usd", options: { Size: "L", Color: "Sand" }, active: false, inventory: { available: 9 } },
  ],
};

describe("cart lines", () => {
  it("merges plain lines, keeps customized lines separate, clamps quantities", () => {
    let c = addLine([], "v_m_green", 1);
    c = addLine(c, "v_m_green", 2);
    expect(c).toEqual([{ variant_id: "v_m_green", quantity: 3 }]);
    c = addLine(c, "v_m_green", 1, { name: "Riley" });
    c = addLine(c, "v_m_green", 1, { name: "Riley" });
    expect(c).toHaveLength(3);
    c = addLine(c, "v_m_sand", 999);
    expect(c.at(-1)!.quantity).toBe(MAX_QUANTITY);
    expect(setLineQuantity(c, 0, 0)).toHaveLength(3);
  });

  it("parses untrusted stored data", () => {
    expect(parseLines([{ variant_id: "v1", quantity: "2" }, { variant_id: 5, quantity: 1 }, { variant_id: "v2", quantity: -1 }, { variant_id: "v3", quantity: 1, properties: { a: "x", b: 7 } }, null]))
      .toEqual([{ variant_id: "v1", quantity: 2 }, { variant_id: "v3", quantity: 1, properties: { a: "x" } }]);
    expect(parseLines("nope")).toEqual([]);
  });

  it("resolves against the catalog: current prices, stock checks, missing products", () => {
    const r = resolveCart([{ variant_id: "v_m_green", quantity: 5 }, { variant_id: "v_m_sand", quantity: 2 }, { variant_id: "v_gone", quantity: 1 }, { variant_id: "v_l_sand", quantity: 1 }], [tee]);
    expect(r.lines.map((l) => [l.variant_id, l.line_total, l.over_stock])).toEqual([["v_m_green", 15000, true], ["v_m_sand", 6400, false]]);
    expect(r.missing.map((m) => m.variant_id)).toEqual(["v_gone", "v_l_sand"]);
    expect(r).toMatchObject({ subtotal: 21400, count: 9, ready: false });
    expect(resolveCart([{ variant_id: "v_m_sand", quantity: 2 }], [tee]).ready).toBe(true);
  });
});

describe("variant picker", () => {
  it("starts on an in-stock variant and marks unbuyable choices", () => {
    expect(initialSelection(tee)).toEqual({ Size: "M", Color: "Green" });
    const p = pickVariant(tee, { Size: "M", Color: "Green" });
    expect(p.variant?.id).toBe("v_m_green");
    expect(p.available).toBe(4);
    const size = p.options.find((o) => o.name === "Size")!;
    expect(size.values.map((v) => [v.value, v.available])).toEqual([["S", false], ["M", true]]); // L is inactive → not offered
    const color = pickVariant(tee, { Size: "S" }).options.find((o) => o.name === "Color")!;
    expect(color.values.find((v) => v.value === "Green")!.available).toBe(false);
    expect(pickVariant(tee, { Size: "S" }).variant).toBeNull(); // incomplete selection
  });
  it("handles products without options", () => {
    const mug: CatalogProduct = { id: "pr_mug", name: "Mug", variants: [{ id: "v_mug", name: "Default", price: 2000, currency: "usd", in_stock: true }] };
    expect(pickVariant(mug, {})).toMatchObject({ variant: { id: "v_mug" }, inStock: true });
  });
});

describe("createCheckoutHandler", () => {
  const calls: any[] = [];
  const fakeFetch = (reply: (body: any) => [number, unknown]) => (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const [status, json] = reply(body);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const req = (body: unknown, headers: Record<string, string> = {}) => new Request("https://shop.test/api/checkout", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "https://shop.test", referer: "https://shop.test/cart", ...headers },
  });

  it("creates a checkout from ids + quantities only, with success/cancel URLs on this site", async () => {
    const commerce = new Commerce("cfa_test_x", { fetch: fakeFetch(() => [201, { id: "co_1", url: "https://checkout.stripe.com/c/pay/1" }]), maxRetries: 0 });
    const handler = createCheckoutHandler({ commerce });
    const res = await handler(req({ items: [{ variant_id: "v1", quantity: 2, price: 1 }], discount_code: " SAVE10 " }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "co_1", url: "https://checkout.stripe.com/c/pay/1" });
    expect(calls.at(-1)).toEqual({
      items: [{ variant_id: "v1", quantity: 2 }], discount_code: "SAVE10",
      success_url: "https://shop.test/checkout/success?cfa_checkout={CHECKOUT_SESSION_ID}", cancel_url: "https://shop.test/cart",
    });
  });

  it("refuses other sites, empty carts and bad JSON", async () => {
    const handler = createCheckoutHandler({ commerce: new Commerce("cfa_test_x", { fetch: fakeFetch(() => [201, {}]), maxRetries: 0 }) });
    expect((await handler(req({ items: [{ variant_id: "v1", quantity: 1 }] }, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await handler(req({ items: [] }))).status).toBe(400);
    expect((await handler(req("{nope"))).status).toBe(400);
    expect((await handler(new Request("https://shop.test/api/checkout"))).status).toBe(405);
  });

  it("passes stock errors through and hides internal ones", async () => {
    const oos = createCheckoutHandler({ commerce: new Commerce("cfa_test_x", { fetch: fakeFetch(() => [409, { error: { type: "out_of_stock", message: "Only 1 left", variant_id: "v1", available: 1 } }]), maxRetries: 0 }) });
    const r1 = await oos(req({ items: [{ variant_id: "v1", quantity: 3 }] }));
    expect(r1.status).toBe(409);
    expect((await r1.json()).error).toEqual({ type: "out_of_stock", message: "Only 1 left", variant_id: "v1", available: 1 });
    const internal = createCheckoutHandler({ commerce: new Commerce("cfa_test_x", { fetch: fakeFetch(() => [500, { error: { type: "stripe_error", message: "acct_123 secret detail" } }]), maxRetries: 0 }) });
    const r2 = await internal(req({ items: [{ variant_id: "v1", quantity: 1 }] }));
    expect(r2.status).toBe(502);
    expect(JSON.stringify(await r2.json())).not.toContain("acct_123");
  });
});
