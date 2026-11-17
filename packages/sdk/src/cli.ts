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

claim and go-live use COMMERCEFORAI_API_KEY (from the environment, .env.local or .env).
Their links log someone in, so they open in the browser instead of being printed;
add --print to show the link (e.g. over SSH), and treat it like a password.

Options for init:

Options:
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
`;

function parse(argv: string[]) {
  const o: Record<string, string | boolean> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--no-write" || a === "--force" || a === "--json" || a === "--print") o[a.slice(2)] = true;
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
      env_file: write ? envFile : null, docs: "https://commerceforai.com/llms.txt", ...(sc ? { template: sc } : {}),
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

Test mode is free forever. Pay with card 4242 4242 4242 4242.

Next:
  npm install commerceforai
  Docs for you and your agent: https://commerceforai.com/llms.txt

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
  Pay with test card 4242 4242 4242 4242. Agents: verify without a browser with commerce.store.simulateOrder().
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
    child.on("error", () => done(false));
    child.on("exit", (code) => done(code === 0));
    child.unref();
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

const { o, pos } = parse(process.argv.slice(2));
if (o.help || !pos[0]) { console.log(HELP); process.exit(pos[0] ? 0 : o.help ? 0 : 1); }
if (pos[0] === "init") await init(o);
else if (pos[0] === "claim" || pos[0] === "go-live") await openOwnerLink(pos[0], o);
else { console.error(`Unknown command "${pos[0]}".\n\n${HELP}`); process.exit(1); }
