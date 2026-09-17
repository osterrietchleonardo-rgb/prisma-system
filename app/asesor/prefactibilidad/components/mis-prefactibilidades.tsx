"use client";

import { useEffect, useState } from "react";

export interface Guardada { id: string; direccion: string; smp: string; modo: "oficial" | "regla"; token: string | null; creado_en: string; cur_publicado: string | null }

export function MisPrefactibilidades({ onAbrir, recargar }: { onAbrir: (id: string) => void; recargar: number }) {
  const [lista, setLista] = useState<Guardada[]>([]);
  const [publicadoActual, setPublicadoActual] = useState<string | null>(null);
  useEffect(() => { fetch("/api/prefactibilidad").then((r) => r.json()).then((j) => { setLista(j.prefactibilidades || []); setPublicadoActual(j.cur_publicado_actual ?? null); }).catch(() => setLista([])); }, [recargar]);
  const vieja = (g: Guardada) => Boolean(publicadoActual && g.cur_publicado && g.cur_publicado < publicadoActual);
  if (lista.length === 0) return <p className="text-sm text-zinc-500">Todavía no guardaste ninguna.</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {lista.map((g) => (
        <li key={g.id}>
          <button type="button" onClick={() => onAbrir(g.id)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <span className="truncate">{g.direccion}</span>
            <span className="shrink-0 text-xs text-zinc-500">{new Date(g.creado_en).toLocaleDateString("es-AR")}{g.token ? " · compartida" : ""}{g.modo === "regla" ? " · rango" : ""}{vieja(g) ? " · hay Código nuevo, recalcular" : ""}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
