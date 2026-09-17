// CSV "Frentes parcelas" → gcba_puertas (una fila por puerta).
//   node scripts/gcba/cargar-puertas.mjs [--dry] [--verificar]
// Valida: columnas, ~426.664 filas de frentes (±2 %), y que "AV. CABILDO 2040" resuelva a 039-097-008b.
import Papa from "papaparse";
import { DRY, bajarTexto, clienteRest, leerEnv, recursoCkan, subirEnTandas } from "./comun.mjs";
import { calleClave, filaPuertas } from "../../lib/prefactibilidad/normalizar-calle.ts";

const FILAS_ESPERADAS = 426664;
const COLUMNAS = ["clase", "frente", "num_dom", "ochava", "parcela", "parc_esq", "seccion", "smp"];
const VERIFICAR = process.argv.includes("--verificar");

const env = leerEnv();
const sb = clienteRest(env);

if (VERIFICAR) {
  const r = await sb(`gcba_puertas?calle_clave=eq.${encodeURIComponent(calleClave("CABILDO AV."))}&altura=eq.2040&select=smp,es_esquina`, { prefer: "return=representation" });
  console.log("Cabildo 2040 →", JSON.stringify(r));
  if (r?.[0]?.smp !== "039-097-008b") { console.error("  X CARGA NO VÁLIDA: Cabildo 2040 no resuelve a 039-097-008b."); process.exit(1); }
  console.log("  OK carga válida"); process.exit(0);
}

const { url, modificado } = await recursoCkan("parcelas", "Frentes parcelas");
console.log(`[puertas] recurso: ${url} (modificado ${modificado})${DRY ? " · DRY RUN" : ""}`);
const { data, meta } = Papa.parse((await bajarTexto(url)).trim(), { header: true, skipEmptyLines: true });
const faltan = COLUMNAS.filter((c) => !meta.fields.includes(c));
if (faltan.length) { console.error("  X El CSV cambió de columnas. Faltan:", faltan.join(", ")); process.exit(1); }
if (Math.abs(data.length - FILAS_ESPERADAS) > FILAS_ESPERADAS * 0.02) { console.error(`  X Filas: ${data.length}, esperadas ~${FILAS_ESPERADAS}.`); process.exit(1); }

const puertas = data.flatMap(filaPuertas);
const prueba = puertas.find((p) => p.calle_clave === calleClave("CABILDO AV.") && p.altura === 2040);
if (prueba?.smp !== "039-097-008b") { console.error("  X Cabildo 2040 no resuelve a 039-097-008b en el CSV:", JSON.stringify(prueba)); process.exit(1); }
console.log(`[puertas] ${puertas.length} puertas de ${data.length} frentes · esquinas: ${puertas.filter((p) => p.es_esquina).length}`);
if (DRY) { console.log("[puertas] DRY RUN: nada escrito."); process.exit(0); }
// Recarga completa: se vacía y se vuelve a cargar (no hay clave natural estable).
await sb("gcba_puertas?id=gt.0", { method: "DELETE" });
await subirEnTandas(sb, "gcba_puertas", "id", puertas, 1000);
console.log("[puertas] listo. Correr --verificar.");
