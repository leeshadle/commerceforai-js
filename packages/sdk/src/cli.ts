#!/usr/bin/env node
/**
 * npx commerceforai init
 *
 * Creates a free test-mode store and API key with no sign-up, saves the key to .env.local,
 * and prints a link a person uses later to claim the store and connect Stripe.
 * Designed for coding agents: `--json` prints machine-readable output.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `Usage: npx commerceforai <command> [options]

Commands:
  init       Create a free test-mode store and API key (no sign-up needed)
  claim      Open the page that makes you this test store's owner, in your browser
  go-live    Open the page where the store owner connects Stripe for real orders
  export     Save all of this store's data (products, orders, customers, returns,
             discounts, subscriptions, gift cards...) as JSON files in a folder
  test-order Prove a purchase works, no browser: runs a real test-mode order
             (stock, order, events, webhooks) and prints what happened


claim, go-live, test-order and export use COMMERCEFORAI_API_KEY (from the environment, .env.local or .env).
Their links log someone in, so they open in the browser instead of being printed;
add --print to show the link (e.g. over SSH), and treat it like a password.

Options for init:
  --template nextjs    Also add a working storefront to this Next.js app (App Router):
                       /shop product grid, product pages, cart, Stripe checkout,
                       thank-you page and order lookup. Never overwrites files.
  --template astro     The same storefront for an Astro project (server-rendered
                       pages under src/pages/shop; needs a server adapter).
                       Reuses COMMERCEFORAI_API_KEY if it's already set.
  --name <name>        Store name (default: this folder's package.json name)
  --env-file <path>    Where to save COMMERCEFORAI_API_KEY (default: .env.local)
  --no-write           Don't write any file; just print the key
  --force              Replace an existing COMMERCEFORAI_API_KEY in the env file
  --json               Print JSON (for agents and scripts)
  --base-url <url>     API base URL (default: https://api.commerceforai.com)
  -h, --help           Show this help

Options for test-order (test stores only; never charges a card or emails anyone):
  --variant <id>       Variant to buy, repeatable as --variant a,b (default: the first
                       in-stock variant of each of up to 3 products)
  --quantity <n>       Quantity of each (default 1)
  --fulfill            Also mark the order shipped
  --json               Print the full simulated order as JSON
`;

function parse(argv: string[]) {
  const o: Record<string, string | boolean> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--no-write" || a === "--force" || a === "--json" || a === "--print" || a === "--fulfill") o[a.slice(2)] = true;
    else if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2) as [string, string | undefined];
      o[k] = inline ?? argv[++i] ?? "";
    } else pos.push(a);
  }
  return { o, pos };
}

function defaultName() {
  try {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    if (typeof pkg.name === "string" && pkg.name) return pkg.name.replace(/^@[^/]+\//, "");
  } catch {}
  return undefined;
}

async function init(o: Record<string, string | boolean>) {
  const base = String(o["base-url"] ?? process.env.COMMERCEFORAI_BASE_URL ?? "https://api.commerceforai.com").replace(/\/$/, "");
  const envFile = resolve(String(o["env-file"] ?? ".env.local"));
  const write = !o["no-write"];

  const template = typeof o.template === "string" ? o.template : null;
  if (template && template !== "nextjs" && template !== "astro") {
    const msg = `Unknown template "${template}". Available: nextjs, astro`;
    if (o.json) console.log(JSON.stringify({ ok: false, error: { type: "invalid_request", message: msg } })); else console.error(msg);
    process.exit(1);
  }
  const hasKey = existsSync(envFile) && /^COMMERCEFORAI_API_KEY=/m.test(readFileSync(envFile, "utf8"));
  // With a template and an existing key: just add the storefront.
  if (template && hasKey && !o.force) {
    const sc = scaffold(template as Template);
    if (o.json) console.log(JSON.stringify({ ok: sc.ok, store_created: false, env_file: envFile, template: sc }));
    else printScaffold(sc, "Using the COMMERCEFORAI_API_KEY already in " + envFile.split("/").pop());
    process.exit(sc.ok ? 0 : 1);
  }
  if (write && hasKey && !o.force) {
    const msg = `${envFile} already has COMMERCEFORAI_API_KEY. Re-run with --force to replace it, or --no-write to just print a new key.`;
    if (o.json) console.log(JSON.stringify({ ok: false, error: { type: "already_configured", message: msg } }));
    else console.error(msg);
    process.exit(1);
  }

  const res = await fetch(`${base}/sandbox/stores`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "commerceforai-cli/0.1.0" },
    body: JSON.stringify({ name: (o.name as string) || defaultName() }),
  }).catch((e) => {
    console.error(`Couldn't reach ${base}: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    if (o.json) console.log(JSON.stringify({ ok: false, error: json?.error ?? { message: `HTTP ${res.status}` } }));
    else console.error(`CommerceForAI: ${json?.error?.message ?? `HTTP ${res.status}`}`);
    process.exit(1);
  }

  if (write) {
    const line = `COMMERCEFORAI_API_KEY=${json.api_key}\n`;
    if (existsSync(envFile)) {
      const cur = readFileSync(envFile, "utf8");
      if (/^COMMERCEFORAI_API_KEY=.*$/m.test(cur)) writeFileSync(envFile, cur.replace(/^COMMERCEFORAI_API_KEY=.*$/m, line.trim()));
      else appendFileSync(envFile, (cur.endsWith("\n") || cur === "" ? "" : "\n") + line);
    } else writeFileSync(envFile, line);
  }
  const gitignored = (() => {
    try { return /(^|\n)\s*\.env(\*|\.local|\.\*)?\s*(\n|$)/.test(readFileSync(resolve(".gitignore"), "utf8")); } catch { return false; }
  })();

  const sc = template ? scaffold(template as Template) : null;
  if (o.json) {
    console.log(JSON.stringify({
      ok: true, store_id: json.store_id, mode: json.mode, api_key: json.api_key,
      // The claim link logs whoever opens it in as the owner: have the user run `npx commerceforai claim` rather than showing it.
      claim_url: json.claim_url, claim_command: "npx commerceforai claim",
      env_file: write ? envFile : null, docs: "https://commerceforai.com/llms.txt",
      test_purchase: "npx commerceforai test-order (no browser; Stripe's hosted checkout doesn't run headless)", ...(sc ? { template: sc } : {}),
    }));
    return;
  }
  if (sc) {
    printScaffold(sc, `Created test store "${json.name}" (${json.store_id})${write ? ` and saved COMMERCEFORAI_API_KEY to ${envFile.split("/").pop()}` : `\n  API key: ${json.api_key}`}`);
    console.log(`To manage this test store in the dashboard, the owner claims it:
  npx commerceforai claim     (opens their browser; the link logs them in, so it isn't printed)

When it's ready for real orders: npx commerceforai go-live
`);
    return;
  }
  console.log(`
✓ Created test store "${json.name}" (${json.store_id})
${write ? `✓ Saved COMMERCEFORAI_API_KEY to ${envFile}` : `  API key: ${json.api_key}`}${write && !gitignored ? `\n! Add ${envFile.split("/").pop()} to .gitignore so the key isn't committed` : ""}

Test mode is free forever.

Next:
  npm install commerceforai
  Add products (commerce.products.create, or connect Printify/Printful)
  Docs for you and your agent: https://commerceforai.com/llms.txt

Prove a purchase works (no browser): npx commerceforai test-order
  Stripe's hosted checkout page doesn't run in headless browsers, so don't script it;
  test-order runs the same purchase path (stock, order, events, webhooks). To pay by
  hand in your own browser, use card 4242 4242 4242 4242.

To manage this test store in the dashboard, the owner claims it:
  npx commerceforai claim     (opens their browser; the link logs them in, so it isn't printed)

When it's ready for real orders: npx commerceforai go-live (opens the owner's browser).
That one page signs them in, copies the store to live mode, and takes them to Connect Stripe.
`);
}

// ---------- --template nextjs ----------

type Template = "nextjs" | "astro";
type Scaffold = { ok: boolean; template: Template; base: string; created: string[]; skipped: string[]; install_command: string | null; open: string; next_steps?: string[]; error?: string };

function scaffold(template: Template): Scaffold {
  const fail = (error: string): Scaffold => ({ ok: false, template, base: "", created: [], skipped: [], install_command: null, open: "", error });
  const app = template === "astro" ? "an Astro project (e.g. after `npm create astro@latest`)" : "a Next.js app (e.g. after `npx create-next-app@latest`)";
  let pkg: any;
  try { pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")); } catch { return fail(`No package.json here. Run this in ${app}.`); }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (template === "nextjs" && !deps.next) return fail("This isn't a Next.js app (no `next` dependency). Create one with `npx create-next-app@latest`, then re-run.");
  if (template === "astro" && !deps.astro) return fail("This isn't an Astro project (no `astro` dependency). Create one with `npm create astro@latest`, then re-run.");
  // Next.js: App Router lives in src/app or app. Astro: the template brings its own src/.
  const base = template === "astro" ? "" : existsSync(resolve("src/app")) ? "src" : existsSync(resolve("app")) ? "" : existsSync(resolve("src")) ? "src" : "";
  const from = fileURLToPath(new URL(`../templates/${template}/`, import.meta.url));
  const created: string[] = [], skipped: string[] = [];
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]);
  for (const file of walk(from)) {
    const rel = relative(from, file);
    const to = resolve(base, rel);
    const shown = relative(process.cwd(), to);
    if (existsSync(to)) { skipped.push(shown); continue; }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, readFileSync(file));
    created.push(shown);
  }
  const pm = existsSync(resolve("pnpm-lock.yaml")) ? "pnpm add" : existsSync(resolve("yarn.lock")) ? "yarn add" : existsSync(resolve("bun.lockb")) || existsSync(resolve("bun.lock")) ? "bun add" : "npm install";
  if (template === "astro") {
    // The shop renders on the server (it reads live stock and creates checkouts), so Astro needs an adapter.
    const adapter = Object.keys(deps).find((d) => /^@astrojs\/(node|vercel|netlify|cloudflare)$/.test(d));
    return { ok: true, template, base: ".", created, skipped, install_command: deps.commerceforai ? null : `${pm} commerceforai`, open: "http://localhost:4321/shop",
      next_steps: adapter ? [] : ["Add a server adapter so the shop can render on demand: `npx astro add node` (or vercel, netlify, cloudflare for your host)."] };
  }
  return { ok: true, template: "nextjs", base: base || ".", created, skipped, install_command: deps.commerceforai ? null : `${pm} commerceforai`, open: "http://localhost:3000/shop" };
}

function printScaffold(sc: Scaffold, first: string) {
  if (!sc.ok) { console.error(sc.error); return; }
  console.log(`
✓ ${first}
✓ Added the storefront: ${sc.created.length} file(s)${sc.skipped.length ? `, skipped ${sc.skipped.length} that already exist (${sc.skipped.join(", ")})` : ""}

Next:
${sc.install_command ? `  ${sc.install_command}
` : ""}${(sc.next_steps ?? []).map((x) => `  ${x}\n`).join("")}  Add a product (SDK, MCP, or connect Printify/Printful), then run your dev server and open ${sc.open}

Prove a purchase works (no browser): npx commerceforai test-order
  Stripe's hosted checkout page doesn't run in headless browsers, so don't script it;
  test-order runs the same purchase path (stock, order, events, webhooks). To pay by
  hand in your own browser, use card 4242 4242 4242 4242.
`);
}

/** The API key from the environment or this project's env files. */
function findKey(o: Record<string, string | boolean>) {
  if (process.env.COMMERCEFORAI_API_KEY) return process.env.COMMERCEFORAI_API_KEY;
  for (const f of [o["env-file"], ".env.local", ".env"].filter((x): x is string => typeof x === "string")) {
    try { const m = readFileSync(resolve(f), "utf8").match(/^COMMERCEFORAI_API_KEY=["']?([^"'\s]+)/m); if (m) return m[1]; } catch {}
  }
  return null;
}

/** Opens a URL in the default browser. Resolves false when there's no browser to open (SSH, CI, containers). */
async function openBrowser(url: string): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]] : ["xdg-open", [url]];
  return new Promise((done) => {
    const child = spawn(cmd as string, args as string[], { stdio: "ignore", detached: true });
    // The launcher normally exits at once; if it lingers, assume the browser opened and let it run.
    const timer = setTimeout(() => { child.unref(); done(true); }, 3000);
    child.on("error", () => { clearTimeout(timer); done(false); });
    child.on("exit", (code) => { clearTimeout(timer); done(code === 0); });
  });
}

async function openOwnerLink(which: "claim" | "go-live", o: Record<string, string | boolean>) {
  const base = String(o["base-url"] ?? process.env.COMMERCEFORAI_BASE_URL ?? "https://api.commerceforai.com").replace(/\/$/, "");
  const fail = (message: string) => {
    if (o.json) console.log(JSON.stringify({ ok: false, error: { message } })); else console.error(message);
    process.exit(1);
  };
  const key = findKey(o);
  if (!key) return fail("No COMMERCEFORAI_API_KEY found in the environment, .env.local or .env. Run `npx commerceforai init` first.");
  const res = await fetch(`${base}${which === "claim" ? "/v1/store/claim_link" : "/v1/go_live_links"}`, {
    method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "user-agent": "commerceforai-cli" }, body: "{}",
  }).catch((e) => fail(`Couldn't reach ${base}: ${e instanceof Error ? e.message : e}`));
  const body: any = await res!.json().catch(() => null);
  if (!res!.ok || !body?.url) return fail(body?.error?.message ?? `Request failed (HTTP ${res!.status})`);
  const what = which === "claim" ? "the claim page (sign in there to become the store's owner)" : "the go-live page (the store owner connects Stripe there)";
  const opened = o.print ? false : await openBrowser(body.url);
  if (o.json) { console.log(JSON.stringify({ ok: true, opened, ...(opened ? {} : { url: body.url }) })); return; }
  if (opened) console.log(`✓ Opened ${what} in your browser. The link works once.`);
  else console.log(`${o.print ? "" : "Couldn't open a browser here. "}Open this link in the store owner's browser. It logs them in, so don't share it:\n  ${body.url}`);
}

const fmt = (n: number, cur = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(n / 100);

/** Runs a simulated test-mode purchase so an agent can prove checkout works without driving Stripe's page. */
async function testOrder(o: Record<string, string | boolean>) {
  const base = String(o["base-url"] ?? process.env.COMMERCEFORAI_BASE_URL ?? "https://api.commerceforai.com").replace(/\/$/, "");
  const fail = (message: string): never => {
    if (o.json) console.log(JSON.stringify({ ok: false, error: { message } })); else console.error(message);
    process.exit(1);
  };
  const key = findKey(o);
  if (!key) return fail("No COMMERCEFORAI_API_KEY found in the environment, .env.local or .env. Run `npx commerceforai init` first.");
  if (!key.startsWith("cfa_test_")) return fail("test-order only runs on test stores (keys starting cfa_test_). Live stores take real payments.");
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "user-agent": "commerceforai-cli" }, body: body === undefined ? undefined : JSON.stringify(body) })
      .catch((e) => fail(`Couldn't reach ${base}: ${e instanceof Error ? e.message : e}`));
    const json: any = await res.json().catch(() => null);
    if (!res.ok) fail(json?.error?.message ?? `HTTP ${res.status} on ${path}`);
    return json;
  };
  const quantity = Math.max(1, Number(o.quantity ?? 1) || 1);
  let ids = typeof o.variant === "string" ? o.variant.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!ids.length) {
    const products = await call("GET", "/v1/products?limit=100");
    for (const p of products.data ?? []) {
      if (p.active === false) continue;
      const v = (p.variants ?? []).find((v: any) => !v.recurring && (v.inventory?.available == null || v.inventory.available >= quantity));
      if (v) ids.push(v.id);
      if (ids.length >= 3) break;
    }
    if (!ids.length) fail("This store has no in-stock products yet. Create one first, e.g. commerce.products.create({ name, price, inventory }), then run test-order again.");
  }
  const sim = await call("POST", "/v1/simulate/order", { items: ids.map((variant_id) => ({ variant_id, quantity })), ...(o.fulfill ? { fulfill: true } : {}) });
  if (o.json) { console.log(JSON.stringify({ ok: true, ...sim })); return; }
  const ord = sim.order;
  console.log(`✓ Test purchase succeeded: order #${ord.number} (${ord.id}) is ${ord.status}, total ${fmt(ord.total, ord.currency)}`);
  for (const it of ord.items ?? []) console.log(`    ${it.quantity} × ${it.product_name}${it.variant_name && it.variant_name !== "Default" ? ` (${it.variant_name})` : ""}`);
  if (sim.events?.length) console.log(`  Events: ${sim.events.join(", ")}`);
  for (const w of sim.webhooks ?? []) console.log(`  Webhook ${w.url}: ${w.deliveries} deliver${w.deliveries === 1 ? "y" : "ies"}`);
  for (const e of sim.emails_that_would_send ?? []) console.log(`  A real order would email: ${e.subject}${e.to ? ` (to ${e.to})` : ""}`);
  for (const n of sim.notes ?? []) console.log(`  Note: ${n}`);
}

/** Saves every resource the store's key can read to ./commerceforai-export-<date>/ (or --out). */
async function exportStore(o: Record<string, string | boolean>) {
  const base = String(o["base-url"] ?? process.env.COMMERCEFORAI_BASE_URL ?? "https://api.commerceforai.com").replace(/\/$/, "");
  const fail = (message: string): never => { console.error(message); process.exit(1); };
  const key = findKey(o) ?? fail("No COMMERCEFORAI_API_KEY found in the environment, .env.local or .env.");
  const get = async (path: string) => {
    const res = await fetch(base + path, { headers: { authorization: `Bearer ${key}`, "user-agent": "commerceforai-cli" } }).catch((e) => fail(`Couldn't reach ${base}: ${e instanceof Error ? e.message : e}`));
    const json: any = await res.json().catch(() => null);
    if (!res.ok) fail(json?.error?.message ?? `HTTP ${res.status} on ${path}`);
    return json;
  };
  const all = async (path: string, paging: "cursor" | "page" | "none") => {
    const out: any[] = [];
    if (paging === "none") return (await get(path)).data ?? [];
    for (let n = 1, after = ""; n < 10_000; n++) {
      const sep = path.includes("?") ? "&" : "?";
      const body = await get(`${path}${sep}limit=100${paging === "page" ? `&page=${n}` : after ? `&starting_after=${after}` : ""}`);
      const data: any[] = body.data ?? [];
      out.push(...data);
      const more = body.has_more ?? data.length === 100;
      if (!more || !data.length) break;
      after = data[data.length - 1].id;
    }
    return out;
  };
  const dir = resolve(String(o.out ?? `commerceforai-export-${new Date().toISOString().slice(0, 10)}`));
  mkdirSync(dir, { recursive: true });
  const parts: [string, () => Promise<unknown>][] = [
    ["store", () => get("/v1/store")],
    ["products", () => all("/v1/products", "cursor")],
    ["orders", () => all("/v1/orders", "cursor")],
    ["customers", () => all("/v1/customers", "page")],
    ["returns", () => all("/v1/returns", "cursor")],
    ["collections", () => all("/v1/collections", "none")],
    ["discounts", () => all("/v1/discounts", "none")],
    ["subscriptions", () => all("/v1/subscriptions", "none")],
    ["gift_cards", () => all("/v1/gift_cards", "none")],
  ];
  for (const [name, load] of parts) {
    const data = await load();
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
    console.log(`✓ ${name}.json${Array.isArray(data) ? ` (${data.length})` : ""}`);
  }
  console.log(`\nSaved to ${dir}. It contains customer details: keep it private and out of git.
Payments, payouts and card data live in your own Stripe account and stay there.`);
}

const { o, pos } = parse(process.argv.slice(2));
if (o.help || !pos[0]) { console.log(HELP); process.exit(pos[0] ? 0 : o.help ? 0 : 1); }
if (pos[0] === "init") await init(o);
else if (pos[0] === "claim" || pos[0] === "go-live") await openOwnerLink(pos[0], o);
else if (pos[0] === "test-order") await testOrder(o);
else if (pos[0] === "export") await exportStore(o);
else { console.error(`Unknown command "${pos[0]}".\n\n${HELP}`); process.exit(1); }
