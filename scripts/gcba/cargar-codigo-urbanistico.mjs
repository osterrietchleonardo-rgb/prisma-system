// CSV "Código Urbanístico actualizado al 31 de diciembre de 2024" → gcba_parcelas_cur.
//   node scripts/gcba/cargar-codigo-urbanistico.mjs [--dry] [--verificar]
// Valida ANTES de escribir: columnas esperadas, ~318.128 filas (±1 %), y la parcela de prueba
// 056-068-040b con sus valores conocidos. Si algo no cierra, no escribe nada.
// A producción SOLO con el OK de Leonardo.
import Papa from "papaparse";
import { DRY, bajarTexto, clienteRest, leerEnv, recursoCkan, subirEnTandas } from "./comun.mjs";
import { filaCurDesdeCsv } from "../../lib/prefactibilidad/filas-cur.ts";

const FILAS_ESPERADAS = 318128;
const COLUMNAS = ["gid", "smp", "seccion", "manzana", "parcela", "uni_edif_1", "uni_edif_2", "uni_edif_3", "uni_edif_4", "tipo_mza", "catalogado", "barrio", "comuna", "plano_l", "dist_1_grp", "dist_1_esp", "dist_cpu_1", "fot_em_1", "alicuota", "inc_uva_21"];
const VERIFICAR = process.argv.includes("--verificar");

const env = leerEnv();
const sb = clienteRest(env);

if (VERIFICAR) {
  const r = await sb("gcba_parcelas_cur?smp=eq.056-068-040b&select=uni_edif,plano_l,dist_cpu_1,alicuota,inc_uva_21,publicado", { prefer: "return=representation" });
  const n = await sb("gcba_parcelas_cur?select=smp", { headers: { Prefer: "count=exact", Range: "0-0" } });
  console.log("fila de prueba:", JSON.stringify(r?.[0]));
  const ok = r?.[0] && r[0].uni_edif?.[0] === 17.2 && r[0].plano_l === 24.2 && r[0].dist_cpu_1 === "R2b II" && r[0].alicuota === 0.1 && r[0].inc_uva_21 === 50;
  if (!ok) { console.error("  X CARGA NO VÁLIDA: la parcela de prueba no tiene los valores esperados."); process.exit(1); }
  console.log("  OK carga válida"); process.exit(0);
}

const { url, modificado } = await recursoCkan("codigo-urbanistico", "31 de diciembre de 2024");
console.log(`[cur] recurso: ${url} (modificado ${modificado})${DRY ? " · DRY RUN" : ""}`);
const texto = await bajarTexto(url);
const { data, meta } = Papa.parse(texto.trim(), { header: true, skipEmptyLines: true });
const faltan = COLUMNAS.filter((c) => !meta.fields.includes(c));
if (faltan.length) { console.error("  X El CSV cambió de columnas. Faltan:", faltan.join(", ")); process.exit(1); }
if (Math.abs(data.length - FILAS_ESPERADAS) > FILAS_ESPERADAS * 0.01) { console.error(`  X Filas: ${data.length}, esperadas ~${FILAS_ESPERADAS}. Mirar el CSV antes de tocar el código.`); process.exit(1); }

const filas = data.map((f) => filaCurDesdeCsv(f, modificado)).filter(Boolean);
const prueba = filas.find((f) => f.smp === "056-068-040b");
if (!prueba || prueba.uni_edif[0] !== 17.2 || prueba.plano_l !== 24.2 || prueba.dist_cpu_1 !== "R2b II" || prueba.alicuota !== 0.1 || prueba.inc_uva_21 !== 50) {
  console.error("  X La parcela de prueba 056-068-040b no da los valores conocidos:", JSON.stringify(prueba)); process.exit(1);
}
console.log(`[cur] ${filas.length} filas válidas · alturas 0: ${filas.filter((f) => f.uni_edif.length === 0).length} · atípicas: ${filas.filter((f) => f.tipo_mza === "ATIPICA").length}`);
if (DRY) { console.log("[cur] DRY RUN: nada escrito."); process.exit(0); }
await subirEnTandas(sb, "gcba_parcelas_cur", "smp", filas, 500);
console.log("[cur] listo. Correr --verificar.");
