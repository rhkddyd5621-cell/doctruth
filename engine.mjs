// DocTruth engine — runs each documented snippet against the actually-installed
// library version and publishes a per-snippet "still works / breaks + real output"
// static page. The page's value is an EXECUTED result, not a guess — so it's
// genuinely useful (search-targetable) and not thin AI spam.
//
// This file IS both the product and the distribution: each generated page targets
// a real developer search query and pulls strangers in passively via search.
// Zero dependencies (Node built-ins only). ES modules.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const RUN = join(ROOT, ".run");
mkdirSync(DIST, { recursive: true });
mkdirSync(RUN, { recursive: true });

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const require = createRequire(import.meta.url);
const version = require(`${manifest.library}/package.json`).version;
const runAt = new Date().toISOString();

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Execute one snippet in a child node process against the installed lib. */
function runSnippet(snip) {
  const file = join(RUN, `${snip.id}.mjs`);
  writeFileSync(file, snip.code);
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8", timeout: 15000 });
  const timedOut = r.error && r.error.code === "ETIMEDOUT";
  const ok = !timedOut && r.status === 0;
  return {
    ok,
    output: (r.stdout || "").trim(),
    error: timedOut ? "Timed out after 15s" : (r.stderr || "").trim(),
    exit: r.status,
  };
}

function page(snip, res) {
  const badge = res.ok ? "✅ works" : "❌ breaks";
  const resultBlock = res.ok
    ? `<h2>Output</h2><pre class="ok">${esc(res.output) || "(no stdout)"}</pre>`
    : `<h2>It breaks — actual error</h2><pre class="err">${esc(res.error) || "(exit " + esc(res.exit) + ")"}</pre>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(snip.title)} — ${esc(manifest.library)} ${esc(version)}</title>
<meta name="description" content="Verified by actually running it on ${esc(manifest.library)} ${esc(version)}: ${esc(snip.query)}.">
<style>body{max-width:760px;margin:40px auto;padding:0 18px;font:16px/1.6 system-ui,sans-serif;color:#1a2030;background:#fff}
h1{font-size:1.5rem} .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:.85rem}
.works{background:#e6f7ee;color:#0a7a45}.breaks{background:#fdeaea;color:#c0392b}
pre{background:#0f131c;color:#e8ecf5;padding:14px;border-radius:8px;overflow:auto;font-size:13px}
pre.ok{border-left:4px solid #39d98a}pre.err{border-left:4px solid #ff6b6b}
.meta{color:#667;font-size:.85rem}a{color:#2f6fed}</style></head><body>
<p class="meta"><a href="./index.html">DocTruth</a> · ${esc(manifest.library)} <b>${esc(version)}</b> · checked ${esc(runAt.slice(0, 10))}</p>
<h1>${esc(snip.title)}</h1>
<p><span class="badge ${res.ok ? "works" : "breaks"}">${esc(badge)}</span> on ${esc(manifest.library)} ${esc(version)}.</p>
<h2>The snippet</h2><pre>${esc(snip.code)}</pre>
${resultBlock}
<p class="meta">This was produced by <i>executing</i> the snippet against the installed version — not a guess. Re-verified on each release.</p>
</body></html>`;
}

const results = manifest.snippets.map((s) => ({ snip: s, res: runSnippet(s) }));
for (const { snip, res } of results) {
  writeFileSync(join(DIST, `${snip.id}.html`), page(snip, res));
}

// index
const rows = results
  .map(({ snip, res }) =>
    `<li><a href="./${esc(snip.id)}.html">${esc(snip.title)}</a> <span class="badge ${res.ok ? "works" : "breaks"}">${res.ok ? "✅" : "❌"}</span></li>`)
  .join("\n");
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DocTruth — ${esc(manifest.library)} ${esc(version)}: which doc snippets still work</title>
<meta name="description" content="Every ${esc(manifest.library)} doc snippet, executed on ${esc(version)} — see what still works and what breaks.">
<style>body{max-width:760px;margin:40px auto;padding:0 18px;font:16px/1.6 system-ui,sans-serif;color:#1a2030}
h1{font-size:1.6rem}ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #eee}
.badge{font-size:.8rem}.meta{color:#667;font-size:.9rem}</style></head><body>
<h1>DocTruth — ${esc(manifest.library)} <b>${esc(version)}</b></h1>
<p class="meta">${esc(manifest.blurb)} Last run: ${esc(runAt.slice(0, 10))}.</p>
<ul>${rows}</ul>
</body></html>`;
writeFileSync(join(DIST, "index.html"), index);
writeFileSync(join(DIST, "feed.json"), JSON.stringify(
  { library: manifest.library, version, runAt, results: results.map(({ snip, res }) => ({ id: snip.id, query: snip.query, ok: res.ok })) }, null, 2));

const pass = results.filter((r) => r.res.ok).length;
console.log(`DocTruth: ${manifest.library}@${version} — ${results.length} snippets, ${pass} work, ${results.length - pass} break`);
for (const { snip, res } of results) console.log(`  ${res.ok ? "✅" : "❌"} ${snip.id}${res.ok ? "" : "  -> " + (res.error.split("\n")[0] || "exit " + res.exit)}`);
