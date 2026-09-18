// scripts/gcba/validar-20-parcelas.mts
//   npx tsx scripts/gcba/validar-20-parcelas.mts   (npm i -D tsx una vez)
// Escribe docs/superpowers/specs/evidencia/prefactibilidad/<fecha>-validacion-20-parcelas.md.
//
// Ruling 18-sep-2026 (Step 1b): el oráculo es la capa oficial GCBA 2021, no TodoProps.
// Sale con código 1 solo si alguna parcela en modo oficial falla alguno de los DOS controles
// duros: (a) consistencia m² cuerpo <= superficie del lote (epok) + 1; (b) ±5 % contra
// ORACULO_2021 (donde hay dato medido). TodoProps queda como columna informativa, sin peso
// en el veredicto.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { crearClienteGcba } from "../../lib/prefactibilidad/gcba.ts";
import { calcularEdificabilidadOficial, medirM2 } from "../../lib/prefactibilidad/envolvente.ts";
import { bboxDe, anillosDe } from "../../lib/prefactibilidad/geo.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARCELAS = ["053-050-006", "048-026-005", "042-074-028", "051-098-009", "042-077A-007", "056-068-040B", "039-097-008B",
  "063-133-008", "048-134-014d", "051-102-016a", "053-045-008", "051-113-024a", "045-075-024g", "029-022-023", "063-037-025", "017-061-025", "053-036-016", "051-040-014", "023-082-008", "036-059-032"];
const TOLERANCIA = 0.05;

// Fuente: superficie_edificable.geojson (GCBA, 2021-05-10), medido por el controlador el 18-sep-2026.
const FUENTE_ORACULO = "superficie_edificable.geojson (GCBA, 2021-05-10), medido por el controlador el 18-sep-2026";
const ORACULO_2021: Record<string, { cuerpo: number; basamento?: number }> = {
  "053-050-006": { cuerpo: 261.9 },
  "048-026-005": { cuerpo: 225.5 },
  "042-074-028": { cuerpo: 269.8 },
  "051-098-009": { cuerpo: 130.1 },
  "042-077A-007": { cuerpo: 311.2, basamento: 341.2 },
};

const gcba = crearClienteGcba();
const filas: string[] = []; const notas: string[] = []; let fallas = 0; let sinDato = 0;

// Ruling 22-sep-2026 (fix round 2): una corrida incompleta no es evidencia: se vuelve a correr.
// Un GcbaNoResponde (o cualquier error) a mitad de la lista NO puede abortar el script entero
// sin escribir la evidencia: se registra la parcela como SIN DATO y se sigue con las demás.
for (const smp of PARCELAS) {
  try {
    const lote = await gcba.geometriaLote(smp);
    if (!lote) {
      filas.push(`| ${smp} | SIN DATO | — | — | — | — | — | — | — | SIN DATO: sin lote en catastro |`);
      console.log(filas.at(-1));
      sinDato++;
      continue;
    }

    const origen = anillosDe(lote)[0][0] as [number, number];
    const loteM2 = medirM2(lote, origen);
    const vol = await gcba.volumenes(smp, bboxDe(lote));
    const e = calcularEdificabilidadOficial(vol, lote);
    const html = await fetch(`https://www.todoprops.com/terrenos/caba/parcela/${smp.toLowerCase()}`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.ok ? r.text() : "").catch(() => "");
    const tpM2 = Number((html.match(/edificable por planta[^0-9]*([\d.]+)\s*m²/i)?.[1] || "").replace(/\./g, "")) || null;

    if (!e) {
      filas.push(`| ${smp} | sin envolvente | — | — | — | — | ${tpM2 ?? "—"} | — | ${loteM2.toFixed(0)} | OK |`);
      console.log(filas.at(-1));
      continue;
    }

    const oraculo = ORACULO_2021[smp];
    if (e.unidades.length > 1) notas.push(`${smp}: TodoProps publica un solo número (${tpM2 ?? "—"} m²) que no corresponde a ninguna de las unidades (${e.unidades.join(", ")}).`);

    for (const unidad of e.unidades) {
      const cuerpo = e.plantas.find((p) => p.unidad === unidad && !p.nombre.startsWith("Basamento") && !p.nombre.includes("retirado"));
      const basamento = e.plantas.find((p) => p.unidad === unidad && p.nombre.startsWith("Basamento"));
      if (!cuerpo) {
        filas.push(`| ${smp} | ${unidad} | — | — | — | — | ${tpM2 ?? "—"} | — | ${loteM2.toFixed(0)} | SIN DATO: sin cuerpo principal en la envolvente |`);
        console.log(filas.at(-1));
        sinDato++;
        continue;
      }

      // (a) consistencia: 0 < m² cuerpo <= superficie del lote (epok) + 1
      const consistente = cuerpo.m2PorNivel > 0 && cuerpo.m2PorNivel <= loteM2 + 1;

      // (b) oráculo oficial 2021, donde hay dato medido para este SMP
      let oficialOk = true; let oficialTxt = "—"; let difOficialTxt = "—";
      if (oraculo) {
        const difCuerpo = (cuerpo.m2PorNivel - oraculo.cuerpo) / oraculo.cuerpo;
        let okCuerpo = Math.abs(difCuerpo) <= TOLERANCIA;
        let okBasamento = true; let difBasTxt = "";
        if (oraculo.basamento !== undefined) {
          const difBas = basamento ? (basamento.m2PorNivel - oraculo.basamento) / oraculo.basamento : null;
          okBasamento = difBas !== null && Math.abs(difBas) <= TOLERANCIA;
          difBasTxt = ` / ${difBas === null ? "sin basamento" : (difBas * 100).toFixed(1) + " %"}`;
          oficialTxt = `${oraculo.cuerpo.toFixed(1)} / ${oraculo.basamento.toFixed(1)}`;
        } else {
          oficialTxt = oraculo.cuerpo.toFixed(1);
        }
        difOficialTxt = `${(difCuerpo * 100).toFixed(1)} %${difBasTxt}`;
        oficialOk = okCuerpo && okBasamento;
      }

      if (!consistente || !oficialOk) fallas++;
      const resultado = consistente && oficialOk ? "OK" : "FALLA";

      const dif = tpM2 ? (cuerpo.m2PorNivel - tpM2) / tpM2 : null;
      filas.push(`| ${smp} | ${unidad} | ${cuerpo.m2PorNivel.toFixed(1)} | ${basamento ? basamento.m2PorNivel.toFixed(1) : "—"} | ${oficialTxt} | ${difOficialTxt} | ${tpM2 ?? "—"} | ${dif === null ? "—" : (dif * 100).toFixed(1) + " %"} | ${loteM2.toFixed(0)} | ${resultado} |`);
      console.log(filas.at(-1));
      if (!consistente) console.log(`  ! consistencia: ${cuerpo.m2PorNivel.toFixed(1)} m² de cuerpo no está en (0, ${(loteM2 + 1).toFixed(1)}] (lote)`);
      if (oraculo && !oficialOk) console.log(`  ! oráculo 2021 (${FUENTE_ORACULO}): fuera de ±5 %`);
    }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    filas.push(`| ${smp} | SIN DATO | — | — | — | — | — | — | — | SIN DATO: ${mensaje} |`);
    console.log(filas.at(-1));
    sinDato++;
  }
}
const fecha = new Date().toISOString().slice(0, 10);
const dir = path.join(RAIZ, "docs/superpowers/specs/evidencia/prefactibilidad"); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${fecha}-validacion-20-parcelas.md`), `# Validación de la envolvente oficial contra la capa oficial GCBA 2021 — ${fecha}\n\nOráculo: ${FUENTE_ORACULO}. Dos controles duros deciden el resultado: (a) consistencia — 0 < m² cuerpo ≤ superficie del lote (epok) + 1; (b) ±5 % contra ORACULO_2021, donde hay dato medido (cuerpo, y basamento para CA/CM). TodoProps queda como columna informativa, sin peso en el veredicto. Una parcela SIN DATO (error de red o sin cuerpo principal) cuenta como corrida incompleta: no es evidencia, se vuelve a correr.\n\n| SMP | Unidad | m²/planta PRISMA | Basamento PRISMA | Oficial 2021 | Dif. oficial | m²/planta TodoProps | Dif. TodoProps | Lote m² | Resultado |\n|---|---|---|---|---|---|---|---|---|---|\n${filas.join("\n")}\n\n${notas.length ? notas.map((n) => `- ${n}`).join("\n") + "\n\n" : ""}Nota: TodoProps coincide con la capa oficial en lotes cortos; en lotes profundos da más m² y en corredores publica el basamento. No es oráculo.\n\nFallas: ${fallas} · Sin dato: ${sinDato}.\n`);
console.log(`\nFallas: ${fallas} · Sin dato: ${sinDato}`);
console.log(fallas || sinDato
  ? `X ${fallas} parcelas fuera de tolerancia, ${sinDato} sin dato. NO habilitar el menú (una corrida incompleta no es evidencia: se vuelve a correr).`
  : "OK: las 20 dentro de tolerancia.");
process.exit(fallas || sinDato ? 1 : 0);
