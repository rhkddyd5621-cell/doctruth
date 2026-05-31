// DocTruth engine — runs each documented snippet against the actually-installed
// library version and publishes a per-snippet "still works / breaks + real output"
// static page. The page's value is an EXECUTED result, not a guess — not thin spam.
//
// Multi-library; per-snippet version. Also emits SEO foundation (sitemap.xml,
// robots.txt, canonical, JSON-LD QAPage) so the pages are findable + citable by
// search and AI answer engines — the $0, zero-ban distribution the growth role
// identified. Zero deps beyond the libraries under test. ES modules.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const RUN = join(ROOT, ".run");
const SITE = "https://rhkddyd5621-cell.github.io/doctruth/";
mkdirSync(DIST, { recursive: true });
mkdirSync(RUN, { recursive: true });

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const runAt = new Date().toISOString();

const _ver = {};
function libVersion(lib) {
  if (lib in _ver) return _ver[lib];
  // Read node_modules/<lib>/package.json via fs — require() throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED for ESM-only pkgs (e.g. chalk 5).
  try { _ver[lib] = JSON.parse(readFileSync(join(ROOT, "node_modules", lib, "package.json"), "utf8")).version; }
  catch { _ver[lib] = "unknown"; }
  return _ver[lib];
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

function runSnippet(snip) {
  const file = join(RUN, `${snip.id}.mjs`);
  writeFileSync(file, snip.code);
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8", timeout: 15000 });
  const timedOut = r.error && r.error.code === "ETIMEDOUT";
  const ok = !timedOut && r.status === 0;
  return { ok, output: (r.stdout || "").trim(), error: timedOut ? "Timed out after 15s" : (r.stderr || "").trim(), exit: r.status };
}

const STYLE = `body{max-width:760px;margin:40px auto;padding:0 18px;font:16px/1.6 system-ui,sans-serif;color:#1a2030;background:#fff}
h1{font-size:1.5rem}.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:.85rem}
.works{background:#e6f7ee;color:#0a7a45}.breaks{background:#fdeaea;color:#c0392b}
.lib{color:#667;font-size:.8rem;font-weight:600}
pre{background:#0f131c;color:#e8ecf5;padding:14px;border-radius:8px;overflow:auto;font-size:13px}
pre.ok{border-left:4px solid #39d98a}pre.err{border-left:4px solid #ff6b6b}
.meta{color:#667;font-size:.85rem}a{color:#2f6fed}ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center;flex-wrap:wrap}`;

function page(snip, res) {
  const lib = snip.library, ver = libVersion(lib), url = SITE + snip.id + ".html";
  const badge = res.ok ? "✅ works" : "❌ breaks";
  const answer = res.ok
    ? `Works on ${lib} ${ver}. Output: ${res.output || "(no stdout)"}`
    : `Breaks on ${lib} ${ver}. Error: ${res.error || "exit " + res.exit}`;
  const ld = jsonLd({
    "@context": "https://schema.org", "@type": "QAPage",
    mainEntity: { "@type": "Question", name: snip.title, text: snip.title,
      acceptedAnswer: { "@type": "Answer", text: answer } },
  });
  const resultBlock = res.ok
    ? `<h2>Output</h2><pre class="ok">${esc(res.output) || "(no stdout)"}</pre>`
    : `<h2>It breaks — actual error</h2><pre class="err">${esc(res.error) || "(exit " + esc(res.exit) + ")"}</pre>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(snip.title)} — ${esc(lib)} ${esc(ver)}</title>
<meta name="description" content="Verified by actually running it on ${esc(lib)} ${esc(ver)}: ${esc(snip.query)}.">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(snip.title)}"><meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}"><meta name="twitter:card" content="summary">
<script type="application/ld+json">${ld}</script>
<style>${STYLE}</style></head><body>
<p class="meta"><a href="./index.html">DocTruth</a> · <span class="lib">${esc(lib)} ${esc(ver)}</span> · checked ${esc(runAt.slice(0, 10))}</p>
<h1>${esc(snip.title)}</h1>
<p><span class="badge ${res.ok ? "works" : "breaks"}">${esc(badge)}</span> on ${esc(lib)} ${esc(ver)}.</p>
<h2>The snippet</h2><pre>${esc(snip.code)}</pre>
${resultBlock}
<p class="meta">Produced by <i>executing</i> the snippet against the installed version — not a guess. Last verified ${esc(runAt.slice(0, 10))}.</p>
</body></html>`;
}

const results = manifest.snippets.map((s) => ({ snip: s, res: runSnippet(s) }));
for (const { snip, res } of results) writeFileSync(join(DIST, `${snip.id}.html`), page(snip, res));

const libs = [...new Set(manifest.snippets.map((s) => s.library))];
const rows = results
  .map(({ snip, res }) =>
    `<li><a href="./${esc(snip.id)}.html">${esc(snip.title)}</a> <span class="lib">${esc(snip.library)} ${esc(libVersion(snip.library))}</span> <span class="badge ${res.ok ? "works" : "breaks"}">${res.ok ? "✅" : "❌"}</span></li>`)
  .join("\n");
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DocTruth — which library doc snippets still work (executed, not guessed)</title>
<meta name="description" content="Real developer doc snippets executed against the installed version — what works and what breaks across ${libs.length} libraries.">
<link rel="canonical" href="${esc(SITE)}">
<style>${STYLE}</style></head><body>
<h1>DocTruth</h1>
<p class="meta">${esc(manifest.blurb)} ${libs.length} libraries · ${results.length} checks · last run ${esc(runAt.slice(0, 10))}. <a href="./feed.json">feed.json</a></p>
<ul>${rows}</ul>
</body></html>`;
writeFileSync(join(DIST, "index.html"), index);

// SEO foundation — sitemap + robots (growth tactic #1, zero ban risk)
const urls = [SITE, ...results.map(({ snip }) => SITE + snip.id + ".html")];
writeFileSync(join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc><lastmod>${runAt.slice(0, 10)}</lastmod></url>`).join("\n") +
  `\n</urlset>\n`);
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

writeFileSync(join(DIST, "feed.json"), JSON.stringify(
  { runAt, libraries: libs.map((l) => ({ library: l, version: libVersion(l) })),
    results: results.map(({ snip, res }) => ({ id: snip.id, library: snip.library, version: libVersion(snip.library), query: snip.query, ok: res.ok })) }, null, 2));

const pass = results.filter((r) => r.res.ok).length;
console.log(`DocTruth: ${results.length} snippets across ${libs.length} libs — ${pass} work, ${results.length - pass} break`);
for (const { snip, res } of results) console.log(`  ${res.ok ? "✅" : "❌"} ${snip.library}/${snip.id}${res.ok ? "" : "  -> " + (res.error.split("\n")[0] || "exit " + res.exit)}`);
console.log(`SEO: sitemap.xml (${urls.length} urls) + robots.txt written`);
