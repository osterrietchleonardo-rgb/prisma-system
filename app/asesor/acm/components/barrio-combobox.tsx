// ACM · El campo "Barrio / Zona": desplegable con buscador, alimentado desde la base.
//
// Antes era un input de texto libre que solo validaba "no vacío". Una asesora cargó la
// dirección partida — "Nogoya" en Dirección y "4464" en Barrio — y el ACM buscó comparables
// en un barrio llamado "4464": devolvió cero en 256 ms, sin ningún error, y encima el
// mensaje de la pantalla la mandaba a pensar que faltaban avisos de venta. Con el barrio
// bien cargado esa propiedad tenía 50 comparables en la red y 3 en la cartera.
//
// La lista NO es cerrada: se puede escribir un barrio que no esté (hay 106 propiedades en
// carteras reales, sobre todo countries, que no figuran en la red). Cuando eso pasa se
// avisa, que es lo que le faltó a ella.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, AlertTriangle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { barrioReconocido, filtrarBarrios, type BarrioOpcion } from "@/lib/acm/barrios";

// El catálogo son ~600 filas iguales para toda la pantalla y no cambia mientras el asesor
// carga una propiedad. Se pide UNA vez por carga de página y se comparte entre instancias
// (el ACM monta este campo en más de un paso). La promesa se cachea, no el resultado, para
// que dos montajes simultáneos no disparen dos requests.
let cacheBarrios: Promise<BarrioOpcion[]> | null = null;
function traerBarrios(): Promise<BarrioOpcion[]> {
  if (!cacheBarrios) {
    cacheBarrios = fetch("/api/acm/barrios")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => (Array.isArray(d?.barrios) ? (d.barrios as BarrioOpcion[]) : []))
      .catch((e) => {
        // Que un fallo de red no deje el catálogo roto para siempre: se reintenta al
        // próximo montaje. Sin esto, un corte de un segundo dejaría el campo sin lista
        // hasta recargar la página.
        cacheBarrios = null;
        console.error("No se pudo cargar el listado de barrios:", e);
        return [] as BarrioOpcion[];
      });
  }
  return cacheBarrios;
}

export function BarrioCombobox({
  value,
  onChange,
  placeholder = "Escribí para buscar. Ej: Recoleta",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [opciones, setOpciones] = useState<BarrioOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const cajaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    traerBarrios().then((b) => {
      if (!vivo) return;
      setOpciones(b);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  // Cerrar al tocar fuera. En el celular no hay blur confiable cuando el dedo cae sobre otra
  // parte de la pantalla, así que se escucha el pointerdown del documento.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const sugerencias = useMemo(() => filtrarBarrios(value, opciones), [value, opciones]);
  // Mientras el catálogo no llegó, no hay con qué juzgar: no le mostramos un aviso de
  // "barrio desconocido" a alguien que escribió bien.
  const desconocido = !cargando && opciones.length > 0 && !barrioReconocido(value, opciones);

  const elegir = (o: BarrioOpcion) => {
    onChange(o.nombre);
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setAbierto(false); return; }
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setAbierto(true); return; }
    if (!abierto) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((i) => Math.min(i + 1, sugerencias.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setMarcado((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && sugerencias[marcado]) { e.preventDefault(); elegir(sugerencias[marcado]); }
  };

  // Que la opción marcada con el teclado siga a la vista dentro de la lista con scroll.
  useEffect(() => {
    const li = listaRef.current?.children[marcado] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [marcado]);

  return (
    <div className="relative" ref={cajaRef}>
      <Input
        placeholder={cargando ? "Cargando barrios…" : placeholder}
        className="bg-card/50 border-accent/10 focus-visible:ring-accent"
        value={value}
        onChange={(e) => { onChange(e.target.value); setAbierto(true); setMarcado(0); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={teclas}
        role="combobox"
        aria-expanded={abierto}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {abierto && sugerencias.length > 0 && (
        <div
          ref={listaRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-accent/20 bg-popover shadow-xl"
        >
          {sugerencias.map((o, i) => (
            <button
              key={o.clave}
              type="button"
              // onPointerDown y no onClick: el pointerdown del documento cierra la lista
              // antes de que un click llegue a dispararse.
              onPointerDown={(e) => { e.preventDefault(); elegir(o); }}
              onMouseEnter={() => setMarcado(i)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                i === marcado ? "bg-accent/15" : "hover:bg-accent/10"
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-accent/70" />
                <span className="truncate">{o.nombre}</span>
              </span>
              <span className="text-[11px] shrink-0 text-muted-foreground">
                {o.propio
                  ? "de tu cartera"
                  : `${o.avisos.toLocaleString("es-AR")} aviso${o.avisos === 1 ? "" : "s"}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* El aviso que le faltó a la asesora: no bloquea, avisa. */}
      {desconocido ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            No reconocemos “{value.trim()}” como barrio. Revisá que esté bien escrito y que no
            se haya colado el número de la calle — si el barrio existe pero es nuevo, podés
            dejarlo igual, aunque quizá no aparezcan comparables.
          </span>
        </p>
      ) : value.trim() && !cargando ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-500">
          <Check className="w-3.5 h-3.5 shrink-0" /> Barrio reconocido.
        </p>
      ) : null}
    </div>
  );
}
