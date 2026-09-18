"use client";

import { useEffect, useRef, useState } from "react";
import type { DireccionUsig } from "@/lib/prefactibilidad/gcba";

const ESPERA_MS = 250;
const MINIMO = 3;

export function BuscadorDireccion({ onElegir, deshabilitado, texto }: { onElegir: (d: DireccionUsig) => void; deshabilitado?: boolean; texto?: string }) {
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<DireccionUsig[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  // Dirección recién elegida (del desplegable o de una prefactibilidad guardada): si `q` es
  // exactamente esa, el useEffect de búsqueda no debe volver a abrir el desplegable.
  const elegida = useRef<string | null>(null);

  // Al abrir una guardada desde la lista, el buscador venía vacío: el módulo recién setea `q`
  // acá cuando cambia `p`, no cuando cambia el texto que YA tenía este input.
  useEffect(() => {
    if (texto !== undefined && texto !== q) {
      elegida.current = texto;
      setQ(texto);
      setAbierto(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  useEffect(() => {
    if (q === elegida.current) { setOpciones([]); setAbierto(false); return; }
    if (q.trim().length < MINIMO) { setOpciones([]); setAviso(null); return; }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const r = await fetch(`/api/prefactibilidad/direcciones?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.current.signal });
        const j = await r.json();
        if (!r.ok) { setAviso(j.error || "No se pudo buscar."); setOpciones([]); return; }
        setOpciones(j.direcciones || []);
        setAviso(j.fueraDeCaba ? "Por ahora solo Ciudad de Buenos Aires" : null);
        setAbierto(true);
      } catch (e: any) { if (e?.name !== "AbortError") setAviso("No se pudo buscar."); }
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <label htmlFor="pref-direccion" className="sr-only">Dirección</label>
      <input
        id="pref-direccion" type="text" inputMode="text" autoComplete="off" disabled={deshabilitado}
        value={q} onChange={(e) => { elegida.current = null; setQ(e.target.value); }} onFocus={() => setAbierto(true)}
        placeholder="Calle y número, por ejemplo Roosevelt 4554"
        className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {aviso && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{aviso}</p>}
      {abierto && opciones.length > 0 && (
        <ul role="listbox" className="absolute z-[700] mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {opciones.map((d) => (
            <li key={`${d.codCalle}-${d.altura}`}>
              <button type="button" className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => { elegida.current = d.direccion; setQ(d.direccion); setAbierto(false); onElegir(d); }}>
                {d.direccion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
