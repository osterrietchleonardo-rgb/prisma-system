// Vakdor-PDF — Generador de PDFs profesionales con marca, a partir de Markdown.
// Uso:  node generate.mjs <config.json>
// Requiere:  marked  +  playwright (con Chromium instalado).
//
// El config.json describe la marca, la carpeta de salida y los documentos.
// Ver SKILL.md para el formato completo. Todo campo de marca es opcional:
// si falta, se usa el branding PRISMA/Vakdor por defecto (cobre + logo PRISMA).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let marked, chromium;
try {
  ({ marked } = await import("marked"));
  ({ chromium } = await import("playwright"));
} catch (e) {
  console.error(
    "\n[Vakdor-PDF] Faltan dependencias. Instalá en un proyecto con node_modules:\n" +
    "    npm install marked playwright\n" +
    "    npx playwright install chromium\n"
  );
  process.exit(1);
}

// ---------- Config ----------
const configPath = process.argv[2];
if (!configPath) {
  console.error("[Vakdor-PDF] Pasá la ruta al config: node generate.mjs <config.json>");
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const cfgDir = dirname(resolve(configPath));
const abs = (p) => (p && (isAbsolute(p) ? p : resolve(cfgDir, p)));

// ---------- Marca (defaults PRISMA / Vakdor) ----------
const B = cfg.brand || {};
const COPPER = B.copper || "#b87333";
const COPPER_LIGHT = B.copperLight || "#e29e6d";
const DARK = B.dark || "#131A2D";
const INK = "#1f2937";
const MUTED = "#64748b";
const BRAND_NAME = B.name || "PRISMA IA";
const BRAND_TAG = B.tagline || "Real Estate · Sistema Inteligente";
const FOOTER_BRAND = B.footerBrand || BRAND_NAME;
const CONFIDENTIAL = B.confidential || "Documento confidencial";
const COPYRIGHT = B.copyright || `© ${new Date().getFullYear()} Vakdor`;
const DATE_LABEL = B.dateLabel || new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
const META_LINE = B.metaLine || `<strong>${BRAND_NAME}</strong> &nbsp;·&nbsp; ${DATE_LABEL}`;

// Logo (path en config, o el bundleado en la skill)
let logoDataUri = "";
const logoPath = B.logo ? abs(B.logo) : resolve(__dirname, "assets/logo-icon.png");
if (logoPath && existsSync(logoPath)) {
  const ext = logoPath.toLowerCase().endsWith(".jpg") || logoPath.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
  logoDataUri = `data:image/${ext};base64,${readFileSync(logoPath).toString("base64")}`;
}

const OUT = abs(cfg.outDir || ".");

// ---------- Markdown → HTML ----------
function makeSlugger() {
  const seen = new Map();
  return (text) => {
    const base = text.toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-");
    if (seen.has(base)) { const n = seen.get(base) + 1; seen.set(base, n); return `${base}-${n}`; }
    seen.set(base, 0); return base;
  };
}
const stripTags = (h) => h.replace(/<[^>]+>/g, "");
marked.setOptions({ gfm: true, breaks: false });

function renderBody(md, { dropFirstH1 = true } = {}) {
  let cleaned = dropFirstH1 ? md.replace(/^#\s+.*$/m, "").trimStart() : md;
  let html = marked.parse(cleaned);
  const slug = makeSlugger();
  html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g,
    (m, lvl, inner) => `<h${lvl} id="${slug(stripTags(inner))}">${inner}</h${lvl}>`);
  return html;
}

function buildHtml(doc, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI","Helvetica Neue",Arial,sans-serif; color:${INK}; font-size:10.5pt; line-height:1.62; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .cover { position:relative; height:252mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always;
    background: radial-gradient(circle at 80% 12%, rgba(184,115,51,0.10), transparent 45%), radial-gradient(circle at 8% 92%, rgba(184,115,51,0.08), transparent 40%); border-radius:4px; }
  .cover .topbar { position:absolute; top:0; left:0; right:0; height:6px; background:linear-gradient(90deg,${COPPER},${COPPER_LIGHT},${COPPER}); border-radius:4px 4px 0 0; }
  .cover .brand { display:flex; align-items:center; gap:14px; margin-bottom:60px; }
  .cover .brand .logo { width:58px; height:58px; border-radius:50%; background:${DARK}; padding:5px; border:1.5px solid ${COPPER}; overflow:hidden; }
  .cover .brand .logo img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  .cover .brand .wm { display:flex; flex-direction:column; }
  .cover .brand .wm .name { font-size:22pt; font-weight:800; letter-spacing:-0.5px; line-height:1; color:${COPPER}; }
  .cover .brand .wm .tag { font-size:7.5pt; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:${MUTED}; margin-top:5px; }
  .cover .kicker { color:${COPPER}; font-weight:700; text-transform:uppercase; letter-spacing:3px; font-size:10pt; margin-bottom:10px; }
  .cover h1.title { font-size:40pt; font-weight:800; line-height:1.04; margin:0 0 18px 0; color:${DARK}; letter-spacing:-1px; }
  .cover .subtitle { font-size:14pt; color:${MUTED}; font-weight:500; max-width:80%; }
  .cover .rule { height:3px; width:90px; background:${COPPER}; margin:30px 0; border-radius:3px; }
  .cover .meta { font-size:10pt; color:${MUTED}; }
  .cover .meta strong { color:${INK}; }
  .cover .footer-note { position:absolute; bottom:0; left:0; right:0; font-size:8.5pt; color:${MUTED}; border-top:1px solid #e2e8f0; padding-top:10px; display:flex; justify-content:space-between; }
  .content { padding-top:4px; }
  h1,h2,h3,h4 { color:${DARK}; line-height:1.25; font-weight:700; }
  h1 { font-size:19pt; margin:26px 0 12px; color:${COPPER}; border-bottom:2px solid ${COPPER}; padding-bottom:6px; page-break-after:avoid; }
  h2 { font-size:14.5pt; margin:22px 0 9px; color:${COPPER}; padding-left:11px; border-left:4px solid ${COPPER}; page-break-after:avoid; }
  h3 { font-size:12pt; margin:16px 0 6px; color:${DARK}; page-break-after:avoid; }
  h4 { font-size:10.8pt; margin:13px 0 5px; color:${INK}; page-break-after:avoid; }
  p { margin:7px 0; } a { color:${COPPER}; text-decoration:none; } strong { color:${DARK}; }
  ul,ol { margin:7px 0; padding-left:22px; } li { margin:3px 0; } li::marker { color:${COPPER}; }
  hr { border:none; border-top:1px solid #e2e8f0; margin:22px 0; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:9.3pt; page-break-inside:avoid; }
  thead { display:table-header-group; }
  th { background:${COPPER}; color:#fff; text-align:left; font-weight:600; padding:7px 9px; border:1px solid ${COPPER}; }
  td { padding:6px 9px; border:1px solid #e2e8f0; vertical-align:top; }
  tbody tr:nth-child(even) { background:#faf6f1; }
  table code { background:rgba(184,115,51,0.10); }
  code { font-family:"Consolas","SF Mono","Courier New",monospace; font-size:9pt; background:#f1f5f9; color:#be4b1f; padding:1px 5px; border-radius:4px; }
  pre { background:${DARK}; color:#e6edf3; padding:13px 15px; border-radius:8px; overflow-x:auto; font-size:8.6pt; line-height:1.45; margin:12px 0; page-break-inside:avoid; border-left:4px solid ${COPPER}; }
  pre code { background:transparent; color:inherit; padding:0; }
  blockquote { margin:12px 0; padding:10px 16px; background:#faf6f1; border-left:4px solid ${COPPER}; border-radius:0 6px 6px 0; color:#4a3520; }
  blockquote p { margin:4px 0; }
  </style></head><body>
  <section class="cover">
    <div class="topbar"></div>
    <div class="brand">
      ${logoDataUri ? `<div class="logo"><img src="${logoDataUri}" alt="${BRAND_NAME}"/></div>` : ""}
      <div class="wm"><span class="name">${BRAND_NAME}</span><span class="tag">${BRAND_TAG}</span></div>
    </div>
    ${doc.kicker ? `<div class="kicker">${doc.kicker}</div>` : ""}
    <h1 class="title">${doc.title || ""}</h1>
    ${doc.subtitle ? `<div class="subtitle">${doc.subtitle}</div>` : ""}
    <div class="rule"></div>
    <div class="meta">${META_LINE}</div>
    <div class="footer-note"><span>${CONFIDENTIAL}</span><span>${COPYRIGHT}</span></div>
  </section>
  <section class="content">${bodyHtml}</section>
  </body></html>`;
}

function footerTemplate(docTitle) {
  return `<div style="width:100%; font-size:7.5pt; color:#94a3b8; font-family:'Segoe UI',Arial,sans-serif; padding:0 15mm; display:flex; justify-content:space-between; align-items:center;">
    <span style="color:${COPPER}; font-weight:700;">${FOOTER_BRAND}</span>
    <span>${docTitle || ""}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
}

// ---------- Render ----------
const browser = await chromium.launch();
const page = await browser.newPage();
for (const doc of cfg.docs) {
  const md = readFileSync(abs(doc.file), "utf8");
  const html = buildHtml(doc, renderBody(md, { dropFirstH1: doc.dropFirstH1 !== false }));
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: resolve(OUT, doc.out),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: footerTemplate(doc.title),
    margin: { top: "18mm", bottom: "16mm", left: "15mm", right: "15mm" },
  });
  console.log(`OK  ->  ${doc.out}`);
}
await browser.close();
console.log(`\nListo. PDFs en: ${OUT}`);
