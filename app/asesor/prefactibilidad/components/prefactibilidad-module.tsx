"use client";
// Prefactibilidad · dirección → lote oficial en el mapa → qué se puede construir y cuánto vale
// la tierra. Spec: docs/superpowers/specs/2026-09-12-prefactibilidad-design.md.
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { BuscadorDireccion } from "./buscador-direccion";
import { FichaLote } from "./ficha-lote";
import { MisPrefactibilidades } from "./mis-prefactibilidades";
import type { DireccionUsig } from "@/lib/prefactibilidad/gcba";
import type { Prefactibilidad } from "@/lib/prefactibilidad/tipos";

const MapaParcela = dynamic(() => import("./mapa-parcela"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-zinc-100 dark:bg-zinc-800" /> });

export function PrefactibilidadModule({ esDirector = false }: { esDirector?: boolean }) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [p, setP] = useState<Prefactibilidad | null>(null);
  const [idGuardada, setIdGuardada] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);

  const analizar = useCallback(async (d: DireccionUsig) => {
    setPin({ lat: d.lat, lng: d.lng }); setP(null); setIdGuardada(null); setLink(null); setError(null); setCargando(true);
    try {
      const r = await fetch("/api/prefactibilidad/analizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calle: d.calle, altura: d.altura, direccion: d.direccion }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "No se pudo analizar."); return; }
      setP(j.prefactibilidad);
    } catch { setError("No se pudo analizar."); } finally { setCargando(false); }
  }, []);

  // Devuelve el id: el estado de React no se actualiza dentro del mismo tick, así que quien lo
  // llame no puede leer `idGuardada` recién seteado.
  const guardar = async (): Promise<string | null> => {
    if (!p) return null;
    const r = await fetch("/api/prefactibilidad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ smp: p.smp, direccion: p.direccion }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "No se pudo guardar."); return null; }
    setIdGuardada(j.id); setRecargar((n) => n + 1);
    return j.id as string;
  };
  const compartir = async () => {
    const id = idGuardada ?? (await guardar());
    if (!id) return;
    const r = await fetch(`/api/prefactibilidad/${id}/compartir`, { method: "POST" });
    const j = await r.json();
    if (r.ok) setLink(`${window.location.origin}${j.path}`); else setError(j.error || "No se pudo compartir.");
  };
  const abrir = async (id: string) => {
    const r = await fetch(`/api/prefactibilidad/${id}`);
    const j = await r.json();
    if (!r.ok) { setError(j.error); return; }
    setP(j.prefactibilidad); setIdGuardada(id); setLink(j.token ? `${window.location.origin}/prefactibilidad/${j.token}` : null);
    setPin({ lat: j.prefactibilidad.lote.centroide[1], lng: j.prefactibilidad.lote.centroide[0] });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 pt-6 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Prefactibilidad</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Escribí una dirección de la Ciudad de Buenos Aires: el mapa marca el lote oficial y la ficha dice cuánto se puede construir y cuánto vale la tierra.</p>
      </header>
      <BuscadorDireccion onElegir={analizar} deshabilitado={cargando} />
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative isolate h-[45dvh] overflow-hidden rounded-xl border border-zinc-200 lg:h-[calc(100dvh-16rem)] lg:min-h-[520px] dark:border-zinc-800">
          <MapaParcela pin={pin} lote={p?.geomLote ?? null} huella={p?.edificabilidad.huella ?? null} manzana={p?.geomManzana ?? null} />
        </div>
        <div className="space-y-4">
          {cargando && <p className="text-sm text-zinc-500">Consultando el catastro de la Ciudad…</p>}
          {p && (
            <>
              <FichaLote p={p} />
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void guardar()} disabled={Boolean(idGuardada)} className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-60 dark:border-zinc-700">{idGuardada ? "Guardada" : "Guardar"}</button>
                <button type="button" onClick={compartir} className="min-h-11 rounded-lg bg-[#8d5c2a] px-4 text-sm font-semibold text-white dark:bg-[#c48a4f] dark:text-zinc-950">Compartir ficha</button>
              </div>
              {link && (
                <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <p className="mb-1 text-zinc-600 dark:text-zinc-400">Link para el dueño del lote:</p>
                  <code className="block break-all">{link}</code>
                </div>
              )}
            </>
          )}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">{esDirector ? "Prefactibilidades de la agencia" : "Mis prefactibilidades"}</h2>
            <MisPrefactibilidades onAbrir={abrir} recargar={recargar} />
          </section>
        </div>
      </div>
    </div>
  );
}
