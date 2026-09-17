// Lo que comparten los cargadores del GCBA: leer .env, resolver la URL del recurso por el
// catálogo CKAN (el gobierno mueve archivos de carpeta; ver scripts/cargar-zona-pois.mjs),
// bajar con User-Agent de navegador (sin él el portal devuelve "Request Rejected"), y escribir
// en Supabase por PostgREST con service_role en tandas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const UA = "Mozilla/5.0 (compatible; PRISMA-prefactibilidad/1.0; contacto: osterrietchleonardo@vakdor.com)";
export const DRY = process.argv.includes("--dry");

export function leerEnv() {
  const env = {};
  for (const linea of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env"); process.exit(1); }
  return env;
}

/** URL y fecha de un recurso del portal de datos, por id de dataset y nombre de recurso. */
export async function recursoCkan(datasetId, nombreIncluye) {
  const r = await fetch(`https://data.buenosaires.gob.ar/api/3/action/package_show?id=${datasetId}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`CKAN ${datasetId} → HTTP ${r.status}`);
  const j = await r.json();
  const rec = j.result.resources.find((x) => x.name.includes(nombreIncluye) && x.format.toUpperCase() === "CSV");
  if (!rec) throw new Error(`No hay recurso CSV "${nombreIncluye}" en ${datasetId}`);
  return { url: rec.url, modificado: (rec.last_modified || j.result.metadata_modified || "").slice(0, 10) };
}

export async function bajarTexto(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return await r.text();
}

export function clienteRest(env) {
  const base = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  return async (ruta, opts = {}) => {
    const res = await fetch(`${base}/rest/v1/${ruta}`, { ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: opts.prefer || "return=minimal", ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`${opts.method || "GET"} ${ruta} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };
}

/** Upsert en tandas por PostgREST (Prefer: resolution=merge-duplicates). */
export async function subirEnTandas(sb, tabla, onConflict, filas, tam = 500) {
  let hechas = 0;
  for (let i = 0; i < filas.length; i += tam) {
    await sb(`${tabla}?on_conflict=${onConflict}`, { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify(filas.slice(i, i + tam)) });
    hechas += Math.min(tam, filas.length - i);
    if (hechas % 20000 < tam || hechas === filas.length) console.log(`  [${tabla}] ${hechas}/${filas.length}`);
  }
}
