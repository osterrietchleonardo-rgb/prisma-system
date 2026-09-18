// scripts/gcba/validar-20-parcelas.mts
//   npx tsx scripts/gcba/validar-20-parcelas.mts   (npm i -D tsx una vez)
// Escribe docs/superpowers/specs/evidencia/prefactibilidad/<fecha>-validacion-20-parcelas.md.
// Sale con código 1 si alguna parcela en modo oficial difiere más de 5 % de TodoProps en m²/planta.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { crearClienteGcba } from "../../lib/prefactibilidad/gcba.ts";
import { calcularEdificabilidadOficial } from "../../lib/prefactibilidad/envolvente.ts";
import { huellaPorRegla } from "../../lib/prefactibilidad/lfi-regla.ts";
import { bboxDe } from "../../lib/prefactibilidad/geo.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARCELAS = ["053-050-006", "048-026-005", "042-074-028", "051-098-009", "042-077A-007", "056-068-040B", "039-097-008B",
  "063-133-008", "048-134-014d", "051-102-016a", "053-045-008", "051-113-024a", "045-075-024g", "029-022-023", "063-037-025", "017-061-025", "053-036-016", "051-040-014", "023-082-008", "036-059-032"];
const TOLERANCIA = 0.05;
const gcba = crearClienteGcba();
const filas = []; let fallas = 0;

for (const smp of PARCELAS) {
  const lote = await gcba.geometriaLote(smp); const manzana = await gcba.geometriaManzana(smp.slice(0, smp.lastIndexOf("-")));
  if (!lote) { filas.push(`| ${smp} | — | sin lote en catastro |`); continue; }
  const vol = await gcba.volumenes(smp, bboxDe(lote));
  const e = calcularEdificabilidadOficial(vol, lote);
  const cuerpo = e?.plantas.find((p) => !p.nombre.startsWith("Basamento") && !p.nombre.includes("retirado"));
  const html = await fetch(`https://www.todoprops.com/terrenos/caba/parcela/${smp.toLowerCase()}`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.ok ? r.text() : "").catch(() => "");
  const tpM2 = Number((html.match(/edificable por planta[^0-9]*([\d.]+)\s*m²/i)?.[1] || "").replace(/\./g, "")) || null;
  const tpNiv = Number(html.match(/(\d+)\s*pisos de tejido/i)?.[1]) || null;
  const regla = e && manzana ? huellaPorRegla(lote, manzana, e.unidades[0]).m2 : null;
  const dif = cuerpo && tpM2 ? (cuerpo.m2PorNivel - tpM2) / tpM2 : null;
  const ok = e ? (dif === null || Math.abs(dif) <= TOLERANCIA) : true;
  if (!ok) fallas++;
  filas.push(`| ${smp} | ${e?.unidades.join("+") ?? "sin envolvente"} | ${cuerpo ? cuerpo.m2PorNivel.toFixed(0) : "—"} | ${tpM2 ?? "—"} | ${dif === null ? "—" : (dif * 100).toFixed(1) + " %"} | ${cuerpo ? cuerpo.niveles - 1 : "—"} | ${tpNiv ?? "—"} | ${regla ? regla.toFixed(0) : "—"} | ${ok ? "OK" : "FALLA"} |`);
  console.log(filas.at(-1));
}
const fecha = new Date().toISOString().slice(0, 10);
const dir = path.join(RAIZ, "docs/superpowers/specs/evidencia/prefactibilidad"); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${fecha}-validacion-20-parcelas.md`), `# Validación de la envolvente oficial contra TodoProps — ${fecha}\n\nTolerancia ±5 % en m² por planta (spec). "pisos de tejido" de TodoProps = niveles sobre PB.\n\n| SMP | Unidad | m²/planta PRISMA | m²/planta TodoProps | Dif. | Pisos PRISMA | Pisos TodoProps | Regla ¼ (m²) | Resultado |\n|---|---|---|---|---|---|---|---|---|\n${filas.join("\n")}\n\nFallas: ${fallas}.\n`);
console.log(fallas ? `\nX ${fallas} parcelas fuera de tolerancia. NO habilitar el menú.` : "\nOK: las 20 dentro de tolerancia.");
process.exit(fallas ? 1 : 0);
