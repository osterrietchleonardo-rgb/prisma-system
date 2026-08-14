// Marketing Worker — observa "En proceso" y desarrolla contenido + assets de marca.
// Corre local (node watch.mjs) o en EasyPanel (contenedor, como el acm-extractor).
// Reutiliza playwright/pdfkit/marked de Prisma-MK; usa @anthropic-ai/sdk + @supabase/supabase-js.
// Por formato: carrusel -> N slides + carousel.pdf; lead_magnet -> magnet.pdf (Vakdor-PDF);
// resto -> portada unica de marca.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { generarPdf } from "./vakdor-pdf.mjs";
import { portadaHtml, slideHtml, shot, armarPdfDeSlides } from "./render.mjs";
import { desarrollar, desarrollarCarrusel, desarrollarMagnet, llamador, BRAND_SYSTEM } from "./content.mjs";
import { insightsDelDia } from "./insights.mjs";
import { recetaParaIdea, textosRecientes, formatearMemoria, traerCluster, articulosPublicados } from "./recursos.mjs";
import { revisar } from "./revision.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MK = path.resolve(__dirname, "..");                 // Prisma - MK
const PRISMA = "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM";
const ASSETS = path.join(MK, "assets");
const TMP = path.join(__dirname, "tmp");
fs.mkdirSync(TMP, { recursive: true });

// ---------- env (desde el .env de PRISMA-SYSTEM) ----------
function loadEnv() {
  const raw = fs.readFileSync(path.join(PRISMA, ".env"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const E = loadEnv();

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PROJECT_URL", "SERVICE_ROLE_SECRET", "ANTHROPIC_API_KEY"]) {
  if (!E[k]) { console.error("Falta env:", k); process.exit(1); }
}
const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anthropic = new Anthropic({ apiKey: E.ANTHROPIC_API_KEY });

// ---------- subir archivo al bucket publico de vakdor-app ----------
async function subirPublico(localFile, storagePath, contentType) {
  const bytes = fs.readFileSync(localFile);
  const url = `${E.PROJECT_URL}/storage/v1/object/blog-images/${storagePath}`;
  const headers = { Authorization: `Bearer ${E.SERVICE_ROLE_SECRET}`, apikey: E.SERVICE_ROLE_SECRET, "Content-Type": contentType };
  let res = await fetch(url, { method: "POST", headers, body: bytes });
  if (!res.ok) {
    res = await fetch(url, { method: "POST", headers: { ...headers, "x-upsert": "true" }, body: bytes });
    if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return `${E.PROJECT_URL}/storage/v1/object/public/blog-images/${storagePath}`;
}
const subirImagenPublica = (png, p) => subirPublico(png, p, "image/png");

// ---------- procesar una idea ----------
async function procesar(browser, idea, insights = "") {
  const historial = [...(idea.historial ?? []), { fecha: new Date().toISOString(), tipo: "desarrollada", detalle: "worker: contenido+assets" }];
  const patch = { historial };
  const yaTeniaContenido = !!(idea.contenido && idea.contenido.length);

  // Receta (canon + estructura rotativa + escenas + tipo de comentario) y memoria de piezas
  // recientes, para que cada pieza tenga su propia forma en vez de la plantilla unica.
  const previas = await textosRecientes(db, 15);
  // `idea.estructura` manda si la idea ya la trae Y es compatible con el proposito: si no, el
  // prompt terminaba con dos formas narrativas distintas (la de la idea y la sorteada) peleandose.
  // El cluster aporta las areas afines, que sesgan que escenas entran al sorteo.
  const cluster = await traerCluster(db, idea.cluster);
  const receta = await recetaParaIdea(db, previas, {
    estructura: idea.estructura,
    proposito: idea.proposito,
    funnel: idea.funnel ?? "mofu",
    areas: cluster?.areas ?? [],
  });
  const hooksPrevios = previas.map((p) => p.hook).filter(Boolean);
  // Los enlaces internos solo aplican al articulo de la web; pedirlos para LinkedIn seria
  // contraproducente (los links bajan el alcance).
  const enlaces = idea.fuente === "blog" ? await articulosPublicados(db, 8) : [];
  const ctx = {
    insights,
    memoria: formatearMemoria(previas),
    receta,
    hooksPrevios,
    enlaces,
    pilar: cluster ? { keyword: cluster.keyword_pilar, url: `https://www.vakdor.com${cluster.url_pilar}` } : null,
  };

  const aplicarBase = (d) => {
    if (yaTeniaContenido) return;
    patch.contenido = d.contenido;
    if (idea.fuente === "blog") patch.blog = { ...(idea.blog ?? {}), ...(d.blog ?? {}) };
    else {
      if (d.primer_comentario) patch.primer_comentario = d.primer_comentario;
      if (d.hashtags) patch.hashtags = d.hashtags;
    }
  };

  // Corre la revision sobre lo escrito y arma la receta PERSISTIDA (aplanada: estructura como
  // clave string, escenas como ids) — NUNCA el objeto en-memoria que devuelve recetaParaIdea.
  const revisarYRegistrar = async (d) => {
    const etapa = idea.funnel ?? "mofu";
    // El primer comentario es donde vive la mitad de la regla de CTA (en BOFU el link va ahi y
    // solo ahi). El juez no lo ve — el chequeo determinista de chequeoCta si, y por eso se pasa.
    const comentario = idea.fuente === "blog"
      ? d.blog?.linkedin_primer_comentario
      : d.primer_comentario;
    // La keyword solo entra en la rubrica de los articulos de blog: en LinkedIn cada
    // criterio de mas sube los reintentos, que son llamadas pagas.
    const keyword = idea.fuente === "blog" ? idea.keyword_objetivo : null;
    const rev = await revisar(llamador(anthropic, BRAND_SYSTEM), d.contenido, etapa, hooksPrevios, comentario, { keyword });
    d.contenido = rev.texto;
    patch.receta = {
      estructura: receta.estructura?.clave ?? null,
      // Sin persistir el proposito, la rotacion no avanza: recetaParaIdea excluye los
      // usados leyendo justamente este campo a traves de resumirPieza.
      proposito: receta.proposito?.clave ?? null,
      cluster: idea.cluster ?? null,
      escenas: receta.escenas.map((e) => e.id),
      comentario_tipo: receta.comentarioTipo,
      modelo: "claude-sonnet-5",
      revision: {
        aprobado: rev.aprobado,
        reintentos: rev.reintentos,
        fallos: rev.fallos,
        reescritura_descartada: rev.reescrituraDescartada === true,
      },
    };
  };

  const tmpFiles = [];

  if (idea.formato === "carrusel") {
    // --- CARRUSEL: N slides + carousel.pdf ---
    const d = await desarrollarCarrusel(anthropic, idea, ctx);
    await revisarYRegistrar(d);
    aplicarBase(d);
    const total = d.slides.length;
    const slidePaths = [];
    for (let i = 0; i < total; i++) {
      const s = d.slides[i] ?? {};
      const out = path.join(TMP, `${idea.id}-s${i}.png`);
      await shot(browser, slideHtml({
        eyebrow: s.eyebrow, title: s.title ?? "", parrafo: s.parrafo, bullets: s.bullets,
        pagina: String(i + 1).padStart(2, "0"), esFinal: i === total - 1, cta: s.cta,
      }), 1080, 1080, out);
      slidePaths.push(out);
    }
    const pdfPath = path.join(TMP, `${idea.id}-carousel.pdf`);
    await armarPdfDeSlides(slidePaths, pdfPath);
    tmpFiles.push(...slidePaths, pdfPath);

    const assets = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const sp = `${idea.fuente}/${idea.id}/slide-${String(i + 1).padStart(2, "0")}.png`;
      const u = await subirImagenPublica(slidePaths[i], sp);
      assets.push({ tipo: "png", path: sp, url: u, orden: i });
    }
    const pdfStore = `${idea.fuente}/${idea.id}/carousel.pdf`;
    const pu = await subirPublico(pdfPath, pdfStore, "application/pdf");
    assets.push({ tipo: "pdf", path: pdfStore, url: pu, orden: slidePaths.length });
    patch.assets = assets;
    console.log(`  ✓ carrusel — ${total} slides + pdf — "${idea.titulo.slice(0, 40)}"`);

  } else if (idea.formato === "lead_magnet") {
    // --- LEAD MAGNET: markdown -> magnet.pdf (Vakdor-PDF) + portada ---
    const d = await desarrollarMagnet(anthropic, idea, ctx);
    await revisarYRegistrar(d);
    aplicarBase(d);
    const pdfPath = path.join(TMP, `${idea.id}-magnet.pdf`);
    await generarPdf({
      markdown: d.markdown, outPath: pdfPath,
      kicker: d.kicker || "Lead Magnet", title: d.title || idea.titulo,
      subtitle: d.subtitle || "Para directores de inmobiliarias con +30 asesores",
      brand: { logo: path.join(ASSETS, "logo-vakdor.png") }, browser,
    });
    const coverPng = path.join(TMP, `${idea.id}-cover.png`);
    await shot(browser, portadaHtml({
      eyebrow: "Lead Magnet · Vakdor",
      title: d.title || idea.titulo,
      subtitle: d.subtitle || "Descargá la herramienta.",
      size: "square",
    }), 1080, 1080, coverPng);
    tmpFiles.push(pdfPath, coverPng);

    const coverStore = `${idea.fuente}/${idea.id}/portada.png`;
    const cu = await subirImagenPublica(coverPng, coverStore);
    const pdfStore = `${idea.fuente}/${idea.id}/magnet.pdf`;
    const pu = await subirPublico(pdfPath, pdfStore, "application/pdf");
    patch.assets = [{ tipo: "png", path: coverStore, url: cu, orden: 0 }, { tipo: "pdf", path: pdfStore, url: pu, orden: 1 }];
    console.log(`  ✓ lead_magnet — pdf + portada — "${idea.titulo.slice(0, 40)}"`);

  } else {
    // --- RESTO: portada unica de marca sin recortar titulos ---
    let subtitle = idea.gancho ?? "";
    if (!yaTeniaContenido) {
      const d = await desarrollar(anthropic, idea, ctx);
      await revisarYRegistrar(d);
      aplicarBase(d);
      if (idea.fuente === "blog") subtitle = (d.blog?.meta_description) || subtitle;
    } else if (idea.fuente === "blog") {
      patch.blog = idea.blog ?? {};
    }
    const eyebrow = (idea.blog?.category ? String(idea.blog.category) + " · Vakdor" : "Vakdor · Inmobiliarias");
    const title = idea.titulo || "";
    subtitle = subtitle || "Recupera el control de tu operacion.";
    const outPng = path.join(TMP, `${idea.id}.png`);
    await shot(browser, portadaHtml({ eyebrow, title, subtitle, size: idea.fuente === "blog" ? "og" : "square" }), idea.fuente === "blog" ? 1200 : 1080, idea.fuente === "blog" ? 630 : 1080, outPng);
    tmpFiles.push(outPng);
    const storagePath = `${idea.fuente}/${idea.id}/portada.png`;
    const publicUrl = await subirImagenPublica(outPng, storagePath);
    patch.assets = [{ tipo: "png", path: storagePath, url: publicUrl, orden: 0 }];
    if (idea.fuente === "blog") patch.blog = { ...(patch.blog ?? idea.blog ?? {}), featured_image_url: publicUrl };
    console.log(`  ✓ ${idea.fuente}/${idea.formato} — "${idea.titulo.slice(0, 40)}" · img: ${publicUrl}`);
  }

  patch.estado = "en_revision";
  const { error } = await db.from("marketing_ideas").update(patch).eq("id", idea.id);
  if (error) throw new Error(`update: ${error.message}`);
  for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch {} }
}

// ---------- loop ----------
let corriendo = true;
process.on("SIGINT", () => { console.log("\nParando worker…"); corriendo = false; });

// Tope de reintentos por idea. Un fallo determinista (p.ej. "carrusel: la ultima slide no tiene
// cta") no se arregla solo: sin tope, la idea se queda en la cola para siempre y el ciclo de 20s
// la reintenta — cada intento es una pieza entera generada con Sonnet 5. Como no hay un estado
// "error" en el tablero (mover a `rechazada` es una decision del director, no del worker), se
// deja `estado` como esta y se saca de la cola de este proceso, dejando rastro en el historial.
const MAX_INTENTOS = 3;
const intentosPorIdea = new Map();
const abandonadas = new Set();

async function abandonar(idea, motivo) {
  abandonadas.add(idea.id);
  console.error(`  ⛔ ${idea.id} "${String(idea.titulo ?? "").slice(0, 40)}": ${MAX_INTENTOS} intentos fallidos — se saca de la cola hasta reiniciar el worker. Ultimo error: ${motivo}`);
  try {
    const historial = [
      ...(idea.historial ?? []),
      { fecha: new Date().toISOString(), tipo: "error", detalle: `worker: ${MAX_INTENTOS} intentos fallidos — ${motivo}`.slice(0, 300) },
    ];
    const { error } = await db.from("marketing_ideas").update({ historial }).eq("id", idea.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(`  · no se pudo registrar el abandono de ${idea.id}: ${e.message}`);
  }
}

async function ciclo() {
  const { data, error } = await db.from("marketing_ideas").select("*").eq("estado", "en_proceso");
  if (error) { console.error("query:", error.message); return; }
  const pendientes = (data ?? [])
    .filter((i) => !i.contenido || !(i.assets && i.assets.length))
    .filter((i) => !abandonadas.has(i.id));
  if (pendientes.length === 0) return;
  console.log(`[${new Date().toLocaleTimeString()}] procesando ${pendientes.length} idea(s) en "En proceso"…`);
  const insights = await insightsDelDia(db, E.BUFFER_API_KEY, anthropic); // datos reales de Buffer (1x/dia, cacheado)
  const browser = await chromium.launch();
  try {
    for (const idea of pendientes) {
      try {
        await procesar(browser, idea, insights);
        intentosPorIdea.delete(idea.id);
      } catch (e) {
        const n = (intentosPorIdea.get(idea.id) ?? 0) + 1;
        intentosPorIdea.set(idea.id, n);
        console.error(`  ✗ ${idea.id} (intento ${n}/${MAX_INTENTOS}): ${e.message}`);
        if (n >= MAX_INTENTOS) await abandonar(idea, e.message);
      }
    }
  } finally { await browser.close(); }
}

console.log("Marketing worker iniciado. Observando 'En proceso' cada 20s… (Ctrl-C para salir)");
await ciclo();
while (corriendo) {
  await new Promise((r) => setTimeout(r, 20000));
  if (corriendo) await ciclo().catch((e) => console.error("ciclo:", e.message));
}
process.exit(0);
