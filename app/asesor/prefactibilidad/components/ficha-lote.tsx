"use client";

import { describirPlanta, describirUnidad, m2, usd } from "@/lib/prefactibilidad/criollo";
import { requiereEstudio } from "@/lib/prefactibilidad/avisos";
import type { Prefactibilidad } from "@/lib/prefactibilidad/tipos";

export const LEYENDA = "Estudio orientativo elaborado con datos públicos del Gobierno de la Ciudad de Buenos Aires. No reemplaza el informe de un profesional matriculado ni el certificado urbanístico oficial.";

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">{titulo}</h3>
      {children}
    </section>
  );
}
const Dato = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800"><dt className="text-zinc-600 dark:text-zinc-400">{k}</dt><dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">{v}</dd></div>
);

export function FichaLote({ p }: { p: Prefactibilidad }) {
  const e = p.edificabilidad;
  const fuerte = requiereEstudio(p.avisos);
  return (
    <div className="space-y-4">
      <Bloque titulo="El lote">
        <dl>
          <Dato k="Parcela (sección-manzana-parcela)" v={p.smp.toUpperCase()} />
          <Dato k="Superficie" v={p.lote.superficieTotal != null ? m2(p.lote.superficieTotal) : "sin dato"} />
          <Dato k="Frente × fondo" v={p.lote.frente != null && p.lote.fondo != null ? `${p.lote.frente.toLocaleString("es-AR")} × ${p.lote.fondo.toLocaleString("es-AR")} m` : "sin dato"} />
          <Dato k="Propiedad horizontal" v={p.lote.propiedadHorizontal ? `Sí (${p.lote.unidadesFuncionales ?? "?"} unidades)` : "No"} />
          <Dato k="Construido hoy" v={p.lote.pisosSobreRasante != null ? `${p.lote.pisosSobreRasante} ${p.lote.pisosSobreRasante === 1 ? "piso" : "pisos"}${p.lote.superficieCubierta ? ` · ${m2(p.lote.superficieCubierta)} cubiertos` : ""}` : "sin dato"} />
          <Dato k="Barrio" v={`${p.cur?.barrio ?? "—"}${p.cur?.comuna ? ` · Comuna ${p.cur.comuna}` : ""}`} />
        </dl>
      </Bloque>

      <Bloque titulo="Qué se puede construir">
        {fuerte && (
          <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <strong>Requiere estudio profesional.</strong> {p.avisos.filter((a) => a.fuerte).map((a) => a.texto).join(" ")}
          </p>
        )}
        {e.unidades.map((u) => <p key={u} className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">{describirUnidad(u)}</p>)}
        {e.modo === "oficial" ? (
          <>
            <ul className="mb-3 space-y-1 text-sm">{e.plantas.map((pl, i) => <li key={i}>{describirPlanta(pl)}</li>)}</ul>
            <dl>
              <Dato k="Altura máxima / plano límite" v={`${e.alturaMaxima.toLocaleString("es-AR")} m / ${e.planoLimite.toLocaleString("es-AR")} m`} />
              <Dato k="m² construibles" v={m2(e.m2Construibles)} />
              <Dato k="m² vendibles (80 %)" v={m2(e.m2Vendibles)} />
            </dl>
            <p className="mt-2 text-xs text-zinc-500">Envolvente oficial del Código Urbanístico (Ciudad 3D, GCBA). Sin balcones.</p>
          </>
        ) : (
          <dl>
            <Dato k="m² construibles (rango)" v={e.rango ? `${m2(e.rango.piso)} a ${m2(e.rango.techo)}` : "sin dato"} />
            <Dato k="m² vendibles (80 %)" v={e.rango ? `${m2(e.rango.piso * 0.8)} a ${m2(e.rango.techo * 0.8)}` : "sin dato"} />
          </dl>
        )}
        {p.avisos.filter((a) => !a.fuerte).map((a) => <p key={a.clave} className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{a.texto}</p>)}
      </Bloque>

      <Bloque titulo="Cuánto vale la tierra">
        {p.tierra ? (
          <>
            <dl>
              <Dato k="Valor del lote (rango)" v={`${usd(p.tierra.valorLote.desde)} a ${usd(p.tierra.valorLote.hasta)}`} />
              <Dato k="Valor del lote (mediana)" v={usd(p.tierra.valorLote.mediana)} />
              <Dato k="USD por m² de tierra" v={`${p.tierra.usdM2Mediana.toLocaleString("es-AR")} (${p.tierra.usdM2P25.toLocaleString("es-AR")} a ${p.tierra.usdM2P75.toLocaleString("es-AR")})`} />
            </dl>
            <p className="mt-2 mb-1 text-xs text-zinc-500">{p.tierra.comparables.length} terrenos en venta a menos de 800 m:</p>
            <ul className="space-y-1 text-xs">
              {p.tierra.comparables.slice(0, 12).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <a href={c.url} target="_blank" rel="noreferrer" className="truncate underline">{c.direccion || c.titulo || "Terreno"}</a>
                  <span className="shrink-0 text-zinc-600 dark:text-zinc-400">{usd(c.precioUsd)} · {m2(c.superficieM2)} · {c.distanciaM} m</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Sin comparables suficientes: hacen falta al menos 5 terrenos en venta a menos de 800 m.</p>
        )}
      </Bloque>

      <p className="text-xs leading-relaxed text-zinc-500">{LEYENDA}{p.fuentes.curPublicado ? ` Código Urbanístico por parcela publicado por el GCBA el ${new Date(p.fuentes.curPublicado).toLocaleDateString("es-AR")}.` : ""}</p>
    </div>
  );
}
