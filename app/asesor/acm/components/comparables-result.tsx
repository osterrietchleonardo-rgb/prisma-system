"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AcmComparable, ChecklistItem, Sujeto, Operacion } from "@/lib/tasacion/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Check, X, Minus, ChevronDown, ExternalLink, Building2, Network, ArrowLeft, MapPin, Ruler, DoorOpen,
  FileText, Loader2, CheckSquare, Square, Plus, Trash2, Sparkles, ScanEye, ImageOff, AlertTriangle,
} from "lucide-react";
import {
  MAX_COMPARABLES_ANALISIS,
  PISO_MATCH_PCT_ANALISIS,
  scoreComparacionFotos,
  ajustePorScore,
  aplicarAjuste,
  type AtributosFotoIA,
} from "@/lib/acm/analisis-fotos";

interface Props {
  sujeto: Sujeto;
  operacion: Operacion;
  cartera: AcmComparable[];
  roomix: AcmComparable[];
  conSemantica: boolean;
  /** true = la búsqueda en cartera/red falló (ej. timeout) y el resultado de esa fuente está
   *  incompleto — nunca hay que mostrarlo como si fuera un resultado completo y válido. */
  carteraFallo?: boolean;
  roomixFallo?: boolean;
  /** Fila del historial "Mis ACM" a la que pertenece esta búsqueda (para colgarle la ficha). */
  searchId?: string | null;
  /** Avisa qué fila del historial quedó asociada a la ficha recién creada. */
  onFichaCreada?: (searchId: string | null) => void;
  onVolver: () => void;
}

/** Resultado de analizar las fotos de UN comparable (o el estado de carga/error). */
interface FotoResultadoComparable {
  descripcion: string | null;
  atributos: AtributosFotoIA | null;
  cache: boolean;
  error: string | null;
}

/** El anclaje efectivo del sujeto: si el asesor no corrigió nada, "sin_evidencia" hace que
 *  `scoreComparacionFotos` devuelva null (no se inventa un ajuste sin dato real). */
function anclajeSujeto(sujeto: Sujeto) {
  return {
    estado_conservacion: sujeto.anclaje_estado_conservacion ?? "sin_evidencia",
    luminosidad: sujeto.anclaje_luminosidad ?? "sin_evidencia",
  } as const;
}

/** Resultado de aplicar la 3ra capa a UN comparable puntual. Fuente única de verdad para el
 *  badge de la tarjeta, el reordenamiento de la lista y el % que viaja a la ficha — los tres
 *  tienen que salir del mismo cálculo o el orden, la tarjeta y la ficha podrían mostrar cosas
 *  distintas entre sí (el bug que ya mordió esta rama una vez: un dato viviendo en un solo
 *  lugar y leído desde otro que nunca lo recibía). null = no hay ajuste aplicable (sin
 *  analizar, fotos que no muestran la propiedad, o sin evidencia suficiente para puntuar).
 */
interface ComparacionFotos {
  atributos: AtributosFotoIA;
  noMuestraInterior: boolean;
  ajuste: ReturnType<typeof ajustePorScore> | null;
  pctAjustado: number;
}

function comparacionFotos(
  c: AcmComparable,
  sujeto: Sujeto,
  fotos: "cargando" | FotoResultadoComparable | undefined
): ComparacionFotos | null {
  if (!fotos || fotos === "cargando" || !fotos.atributos) return null;
  const atributos = fotos.atributos;
  if (atributos.fotos_muestran_interior === false) {
    return { atributos, noMuestraInterior: true, ajuste: null, pctAjustado: c.match_pct };
  }
  const comparacion = scoreComparacionFotos(anclajeSujeto(sujeto), atributos);
  if (!comparacion) return { atributos, noMuestraInterior: false, ajuste: null, pctAjustado: c.match_pct };
  const ajuste = ajustePorScore(comparacion.score);
  return { atributos, noMuestraInterior: false, ajuste, pctAjustado: aplicarAjuste(c.match_pct, ajuste.delta) };
}

/** El % que efectivamente cuenta para ordenar la lista y para lo que viaja a la ficha: el
 *  ajustado si hay uno aplicable, si no el original — nunca null, siempre un número usable. */
function pctEfectivo(c: AcmComparable, sujeto: Sujeto, fotos: "cargando" | FotoResultadoComparable | undefined): number {
  return comparacionFotos(c, sujeto, fotos)?.pctAjustado ?? c.match_pct;
}

const estadoIcon = (e: ChecklistItem["estado"]) => {
  if (e === "match") return <Check className="w-3.5 h-3.5 text-green-500" />;
  if (e === "parcial") return <Minus className="w-3.5 h-3.5 text-amber-500" />;
  if (e === "distinto") return <X className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground/40" />;
};

const pctColor = (p: number) =>
  p >= 80 ? "text-green-500" : p >= 60 ? "text-amber-500" : "text-muted-foreground";

const fmtPrecio = (c: AcmComparable) =>
  c.precio ? `${c.moneda === "ARS" ? "$" : "US$"} ${c.precio.toLocaleString("es-AR")}` : "Consultar";

function ComparableCard({
  c, selectable, selected, onToggle, sujeto, fotos,
}: {
  c: AcmComparable; selectable?: boolean; selected?: boolean; onToggle?: (id: string) => void;
  sujeto: Sujeto;
  /** undefined = este comparable no entra en el top 10 analizado (o la capa está apagada).
   *  "cargando" = el pedido está en vuelo. Si no, el resultado (o su error) ya volvió. */
  fotos?: "cargando" | FotoResultadoComparable;
}) {
  const [open, setOpen] = useState(false);
  // El ítem "zona" del checklist trae el nivel: 100 mismo barrio · 70 sub-barrio · 50 limítrofe.
  const esLindero = c.checklist.some((i) => i.dimension === "zona" && i.score === 50);

  const resultado = comparacionFotos(c, sujeto, fotos);
  const atributos = resultado?.atributos ?? null;
  const noMuestraInterior = resultado?.noMuestraInterior ?? false;
  const ajuste = resultado?.ajuste ?? null;
  const pctAjustado = resultado && !noMuestraInterior ? resultado.pctAjustado : null;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-colors ${
        selectable && selected ? "border-accent bg-accent/5 ring-1 ring-accent/40" : "border-accent/10 bg-card/40"
      }`}
    >
      <div className="flex gap-4 p-4">
        {selectable && (
          <button
            onClick={() => onToggle?.(c.id)}
            className="shrink-0 self-start pt-1 text-accent"
            aria-label={selected ? "Quitar de la ficha" : "Agregar a la ficha"}
          >
            {selected ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6 text-muted-foreground/50" />}
          </button>
        )}
        {c.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imagen} alt={c.titulo} className="w-24 h-24 rounded-xl object-cover shrink-0 bg-muted" />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-muted/40 shrink-0 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-muted-foreground/40" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold truncate">{c.titulo || c.direccion}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {c.zona || c.direccion || "—"}
                {esLindero && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 text-[10px] font-bold uppercase tracking-wide">
                    lindero
                  </span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              {pctAjustado !== null && pctAjustado !== c.match_pct ? (
                <p className="text-lg font-black leading-none whitespace-nowrap">
                  <span className="text-muted-foreground/60 line-through decoration-2">{c.match_pct}%</span>{" "}
                  <span className={pctColor(pctAjustado)}>{pctAjustado}%</span>
                </p>
              ) : (
                <p className={`text-2xl font-black leading-none ${pctColor(c.match_pct)}`}>{c.match_pct}%</p>
              )}
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">comparable</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Ruler className="w-3 h-3" /> {c.m2 ? `${c.m2} m²` : "—"}</span>
            <span className="flex items-center gap-1"><DoorOpen className="w-3 h-3" /> {c.ambientes ? `${c.ambientes} amb` : "—"}</span>
            <span>{c.banos ? `${c.banos} baño${c.banos > 1 ? "s" : ""}` : ""}</span>
          </div>

          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-lg font-black text-foreground">{fmtPrecio(c)}</p>
              {c.precio_m2 ? <p className="text-[11px] text-muted-foreground">{c.moneda === "ARS" ? "$" : "US$"} {c.precio_m2.toLocaleString("es-AR")}/m²</p> : null}
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <p className="truncate max-w-[160px]">{c.responsable}</p>
              {c.fecha_publicacion && <p>{c.fecha_publicacion}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Comparación por fotos (3ra capa): lo que la IA vio en las fotos del sujeto contra lo
          que vio en las de este comparable. Deliverable principal de la Feature B — se muestra
          siempre que el comparable entró al análisis, no hace falta abrir el checklist. */}
      {fotos === "cargando" && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparando fotos con la IA...
        </div>
      )}
      {fotos && fotos !== "cargando" && fotos.error && !atributos && (
        <p className="px-4 pb-3 text-xs text-muted-foreground italic">{fotos.error}</p>
      )}
      {fotos && fotos !== "cargando" && noMuestraInterior && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-2">
          <ImageOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-bold">Estas fotos no muestran el interior de la propiedad</span>
            {atributos?.motivo_no_evaluable ? ` — ${atributos.motivo_no_evaluable}` : ""}. No se comparó ni se ajustó el %:
            comparar contra fotos que no son de la propiedad no tiene sentido.
          </p>
        </div>
      )}
      {fotos && fotos !== "cargando" && atributos && !noMuestraInterior && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-card/50 border border-accent/10 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
            <ScanEye className="w-3.5 h-3.5" /> Comparación por fotos
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs leading-relaxed">
            <div>
              <p className="font-bold text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Tu propiedad</p>
              <p className="text-foreground/90">{sujeto.descripcion_ia || "—"}</p>
            </div>
            <div>
              <p className="font-bold text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Este comparable</p>
              <p className="text-foreground/90">{fotos.descripcion || "—"}</p>
            </div>
          </div>
          {ajuste ? (
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-accent/5">
              {pctAjustado === c.match_pct ? (
                <>El % no cambió: {ajuste.texto}.</>
              ) : (
                <>
                  <span className="font-bold text-foreground">{c.match_pct}% → {pctAjustado}%</span> ({ajuste.delta > 0 ? "+" : ""}
                  {ajuste.delta} pts): {ajuste.texto}.
                </>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-accent/5">
              No se pudo comparar el estado de conservación con este comparable (falta anclar el estado de tu propiedad o el de
              este comparable). El % no se ajustó.
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-1 py-2 text-xs font-bold text-accent border-t border-accent/10 hover:bg-accent/5"
      >
        Ver checklist de comparabilidad
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {c.checklist.map((item) => (
            <div key={item.dimension} className="flex items-center gap-2 text-xs py-1 border-b border-accent/5 last:border-0">
              <span className="shrink-0">{estadoIcon(item.estado)}</span>
              <span className="font-semibold w-40 shrink-0">{item.label}</span>
              <span className="text-muted-foreground flex-1 truncate">
                <span className="text-foreground">{item.sujeto_val}</span>
                <span className="mx-1">vs</span>
                <span className="text-foreground">{item.comp_val}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground w-12 text-right">
                {/* Peso 0 = filtro duro (tipo y operación). La zona dejó de serlo el 3-ago-2026:
                    puntúa 100/70/50 según mismo barrio, sub-barrio o lindero. */}
                {item.peso === 0 ? "filtro" : item.score !== null ? `${item.score}%` : "n/a"}
              </span>
            </div>
          ))}
          {c.url && (
            <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-accent pt-2">
              Ver aviso original <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title, icon: Icon, items, empty, selectable, selected, onToggle, sujeto, fotosPorId,
}: {
  title: string; icon: any; items: AcmComparable[]; empty: string;
  selectable?: boolean; selected?: Set<string>; onToggle?: (id: string) => void;
  sujeto: Sujeto;
  /** Mapa id → resultado (o "cargando") solo para los comparables que entraron al top analizado. */
  fotosPorId: Map<string, "cargando" | FotoResultadoComparable>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-accent" />
        <h3 className="text-lg font-black">{title}</h3>
        <Badge variant="outline" className="border-accent/20">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 rounded-xl bg-card/20 border border-accent/5">{empty}</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <ComparableCard
              key={c.id}
              c={c}
              selectable={selectable}
              selected={selected?.has(c.id)}
              onToggle={onToggle}
              sujeto={sujeto}
              fotos={fotosPorId.get(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_FICHA = 12;

export function ComparablesResult({
  sujeto, operacion, cartera, roomix, conSemantica, carteraFallo, roomixFallo, searchId, onFichaCreada, onVolver,
}: Props) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Revisión de conclusiones antes de crear la ficha (paso previo).
  const [revisando, setRevisando] = useState(false);      // modal abierto
  const [cargandoPrev, setCargandoPrev] = useState(false); // pidiendo el cálculo
  const [conclusiones, setConclusiones] = useState<string[]>([]);
  const [incluirConclusiones, setIncluirConclusiones] = useState(true);

  const byId = useMemo(() => {
    const m = new Map<string, AcmComparable>();
    for (const c of [...cartera, ...roomix]) m.set(c.id, c);
    return m;
  }, [cartera, roomix]);

  // ── 3ra capa: fotos contra fotos ──────────────────────────────────────────────────────
  // Solo disponible si el sujeto tiene descripción por fotos (sin eso no hay contra qué
  // comparar). Apagable por el asesor en cualquier momento: es una mitigación SIN probar en
  // producción (validacion-holdout.md), tiene que poder desactivarse si ordena mal en la
  // práctica — apagarla no borra lo ya analizado, solo deja de mostrarlo/usarlo.
  const hayDescripcionSujeto = Boolean(sujeto.descripcion_ia?.trim());
  const [capaFotosActiva, setCapaFotosActiva] = useState(true);
  const [fotosResultados, setFotosResultados] = useState<Map<string, FotoResultadoComparable>>(new Map());
  const [cargandoFotos, setCargandoFotos] = useState(false);

  // Top N por match_pct (≥ piso), de cartera + roomix combinados — mismo criterio sin
  // importar la fuente. Datos reales: 12.8 comparables ≥90% en promedio, máximo 54; el tope
  // evita gastar 54 llamadas de visión con el cliente esperando.
  const top10 = useMemo(() => {
    return [...cartera, ...roomix]
      .filter((c) => c.match_pct >= PISO_MATCH_PCT_ANALISIS)
      .sort((a, b) => b.match_pct - a.match_pct)
      .slice(0, MAX_COMPARABLES_ANALISIS);
  }, [cartera, roomix]);

  // Firma estable de "qué hay que analizar" — evita re-pedir si el componente re-renderiza
  // por otro motivo (ej. tildar un comparable). Cambia si cambia la búsqueda (otro searchId)
  // o el propio set de ids del top 10.
  const top10Key = top10.map((c) => c.id).join(",");
  // Qué firma está en vuelo ahora mismo. Sin esto, el doble-montaje de StrictMode en desarrollo
  // (monta → limpia → monta) dispara dos POST reales a este endpoint antes de que el primero
  // termine, y las dos llamadas gastan Gemini de verdad aunque el resultado de una se descarte.
  const fetchEnCursoRef = useRef("");

  useEffect(() => {
    if (!capaFotosActiva || !hayDescripcionSujeto || top10.length === 0) return;
    // Ya están todos resueltos (de una corrida anterior de este mismo efecto, ej. al prender
    // de nuevo el switch): no repetir el pedido.
    if (top10.every((c) => fotosResultados.has(c.id))) return;
    if (fetchEnCursoRef.current === top10Key) return; // ya está pidiéndose esta misma firma
    fetchEnCursoRef.current = top10Key;

    const controller = new AbortController();
    setCargandoFotos(true);
    fetch("/api/acm/fotos-comparables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comparables: top10.map((c) => ({
          id: c.id,
          source: c.source,
          tipo: c.tipo,
          zona: c.zona,
          m2: c.m2,
          dormitorios: c.dormitorios,
          banos: c.banos,
        })),
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        const nuevo = new Map(fotosResultados);
        for (const r of data.resultados || []) {
          nuevo.set(r.id, { descripcion: r.descripcion, atributos: r.atributos, cache: Boolean(r.cache), error: r.error });
        }
        setFotosResultados(nuevo);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return; // cleanup legítimo, no un fallo real
        toast.error("No se pudo comparar las fotos de los comparables. El resto del ACM sigue funcionando igual.");
      })
      .finally(() => setCargandoFotos(false));

    return () => {
      controller.abort();
      // Libera la firma: si esta limpieza es el "monta → limpia" sintético de StrictMode (dev),
      // el segundo montaje real tiene que poder volver a pedir — si no, la request abortada
      // nunca se reintenta y esa firma queda sin resolver para siempre.
      if (fetchEnCursoRef.current === top10Key) fetchEnCursoRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capaFotosActiva, hayDescripcionSujeto, top10Key, searchId]);

  // Mapa que consume cada <ComparableCard>: "cargando" mientras está en vuelo, el resultado
  // una vez que vuelve, y ausente para los que no entraron al top analizado.
  const fotosPorId = useMemo(() => {
    const m = new Map<string, "cargando" | FotoResultadoComparable>();
    if (!capaFotosActiva || !hayDescripcionSujeto) return m;
    for (const c of top10) {
      const r = fotosResultados.get(c.id);
      m.set(c.id, r ?? "cargando");
    }
    return m;
  }, [capaFotosActiva, hayDescripcionSujeto, top10, fotosResultados]);

  // Reordena cada lista por el % EFECTIVO (ajustado si la capa está activa y el comparable
  // entró al análisis, original si no) — es lo que pidió Leonardo: el ajuste tiene que
  // "llegar hasta el final", no quedarse solo como cartel en la tarjeta. Con la capa apagada
  // `pctEfectivo` devuelve siempre el original, así que el orden vuelve a ser el de siempre
  // sin ninguna rama especial acá — apagar es apagar de verdad, para el orden también.
  const carteraOrdenada = useMemo(
    () => [...cartera].sort((a, b) => pctEfectivo(b, sujeto, fotosPorId.get(b.id)) - pctEfectivo(a, sujeto, fotosPorId.get(a.id))),
    [cartera, sujeto, fotosPorId]
  );
  const roomixOrdenado = useMemo(
    () => [...roomix].sort((a, b) => pctEfectivo(b, sujeto, fotosPorId.get(b.id)) - pctEfectivo(a, sujeto, fotosPorId.get(a.id))),
    [roomix, sujeto, fotosPorId]
  );

  // Comparables seleccionados para la ficha cuyas fotos NO muestran la propiedad — se avisa
  // antes de crear la ficha, nunca se sacan solos. Lee de `fotosPorId` (gateada por
  // `capaFotosActiva`), NO del `fotosResultados` crudo: con la capa apagada, el switch dice
  // "todo vuelve al original" y eso incluye esta advertencia — si no, apagar la capa seguiría
  // bloqueando la ficha con un aviso de un análisis que el asesor decidió dejar de usar.
  const advertenciasFotos = useMemo(() => {
    return [...selected]
      .map((id) => byId.get(id))
      .filter((c): c is AcmComparable => Boolean(c))
      .map((c) => {
        const r = fotosPorId.get(c.id);
        return { c, atributos: r && r !== "cargando" ? r.atributos : null };
      })
      .filter(({ atributos }) => atributos?.fotos_muestran_interior === false)
      .map(({ c, atributos }) => ({ id: c.id, titulo: c.titulo || c.direccion, motivo: atributos!.motivo_no_evaluable }));
  }, [selected, byId, fotosPorId]);
  const [entendidoAdvertencia, setEntendidoAdvertencia] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_FICHA) {
          toast.error(`Podés incluir hasta ${MAX_FICHA} comparables por ficha.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const cancelar = () => {
    setSelecting(false);
    setSelected(new Set());
    setRevisando(false);
  };

  // El % que viaja al backend de la ficha (preview Y creación final) es el EFECTIVO al momento
  // de armar el pedido — la corrección del anclaje que hizo el asesor, ya resuelta a un número.
  // Si la capa está apagada, `pctEfectivo` devuelve el original sin ninguna rama especial: así
  // "apagar es apagar de verdad" alcanza también a una ficha creada después de apagarla.
  // El snapshot de la ficha (`shared_acm_reports`) guarda este número tal cual — es lo único
  // que ve el cliente, nunca el "antes → después": ese detalle de trabajo queda en la lista del
  // asesor, no en el documento que recibe el dueño de la propiedad.
  const seleccionados = () =>
    [...selected]
      .map((id) => byId.get(id))
      .filter((c): c is AcmComparable => Boolean(c))
      .map((c) => ({ ...c, match_pct: pctEfectivo(c, sujeto, fotosPorId.get(c.id)) }));

  /** Paso previo: calcula las conclusiones (sin guardar nada) y las muestra para revisar/editar. */
  const revisarConclusiones = async () => {
    const comparables = seleccionados();
    if (comparables.length === 0) {
      toast.error("Seleccioná al menos un comparable.");
      return;
    }
    setCargandoPrev(true);
    try {
      const res = await fetch("/api/acm/ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operacion, sujeto, comparables, preview: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudieron calcular las conclusiones.");
      setConclusiones(Array.isArray(data.conclusiones) ? data.conclusiones : []);
      setIncluirConclusiones(true);
      setEntendidoAdvertencia(false); // cada revisión arranca sin el "ya lo sé" tildado
      setRevisando(true);
    } catch (e: any) {
      toast.error("Error preparando la ficha: " + e.message);
    } finally {
      setCargandoPrev(false);
    }
  };

  const crearFicha = async () => {
    const comparables = seleccionados();
    if (comparables.length === 0) {
      toast.error("Seleccioná al menos un comparable.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/acm/ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operacion, sujeto, comparables, search_id: searchId ?? null,
          // [] = el asesor decidió que la sección de conclusiones no aparezca en la ficha.
          conclusiones: incluirConclusiones ? conclusiones.filter((t) => t.trim()) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo crear la ficha.");
      onFichaCreada?.(data.search_id ?? searchId ?? null);
      toast.success("Ficha creada. Abriendo…");
      window.open(data.path, "_blank");
      cancelar();
    } catch (e: any) {
      toast.error("Error creando la ficha: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-24">
      {/* Aviso de búsqueda incompleta: cartera y/o red fallaron (ej. timeout de Postgres en
          barrios grandes). Se muestra SIEMPRE que haya un fallo, fijo en la pantalla (no un
          toast que desaparece) — el asesor tiene que poder ver esto en cualquier momento antes
          de confiar en el resultado o armar una ficha para el cliente con datos incompletos. */}
      {(carteraFallo || roomixFallo) && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-red-500/25 bg-red-500/10">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-400">
            <p className="font-bold">
              {carteraFallo && roomixFallo
                ? "No pudimos completar la búsqueda ni en tu cartera ni en la red de comparables"
                : carteraFallo
                  ? "No pudimos completar la búsqueda en tu cartera"
                  : "No pudimos completar la búsqueda en la red de comparables"}
            </p>
            <p className="mt-0.5 text-red-700/90 dark:text-red-400/90">
              Lo que ves abajo{" "}
              {carteraFallo && roomixFallo
                ? "no incluye ningún comparable de ninguna de las dos fuentes"
                : carteraFallo
                  ? "no incluye comparables de tu cartera"
                  : "no incluye comparables de la red"}
              {" "}— no es que esta zona no tenga, es que la búsqueda no terminó. Probá de nuevo o angostá los filtros
              (zona más chica, menos ambientes/m² de tolerancia).
            </p>
          </div>
        </div>
      )}

      {/* Sujeto */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-accent/20 bg-accent/5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Propiedad analizada · {operacion}</p>
          <p className="font-black text-lg">{sujeto.direccion || "Sujeto"}</p>
          <p className="text-sm text-muted-foreground">
            {sujeto.barrio} · {sujeto.tipo_propiedad} · {sujeto.m2_cubiertos} m² · {sujeto.dormitorios} dorm · {sujeto.banos} baños
          </p>
          {!conSemantica && <p className="text-[11px] text-amber-500 mt-1">Ranking estructural (sin similitud semántica esta vez).</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!selecting ? (
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setSelecting(true)}>
              <FileText className="w-4 h-4 mr-1" /> Crear ficha
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="border-accent/20" onClick={cancelar}>
              Cancelar
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-accent/20" onClick={onVolver}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Editar
          </Button>
        </div>
      </div>

      {/* Interruptor de la 3ra capa (fotos contra fotos): solo aparece si hay algo que
          comparar. Es una mitigación sin probar en producción — tiene que poder apagarse. */}
      {hayDescripcionSujeto && (
        <div className="flex items-start justify-between gap-4 p-3.5 rounded-2xl border border-accent/10 bg-card/20">
          <div className="flex items-start gap-2.5">
            <ScanEye className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Comparar por fotos (IA)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Analiza las fotos de los {Math.min(top10.length, MAX_COMPARABLES_ANALISIS)} comparables con mayor % (≥
                {PISO_MATCH_PCT_ANALISIS}%) y ajusta el % hasta ±5 puntos según qué tan parecida es la condición a la de tu
                propiedad — reordena la lista y es el número que va a la ficha del cliente. Vos siempre ves el antes/después
                acá; al cliente le llega solo el número final. Apagala si la ves ordenando mal: todo vuelve al original,
                orden y ficha incluidos.
              </p>
            </div>
          </div>
          <Switch checked={capaFotosActiva} onCheckedChange={setCapaFotosActiva} className="shrink-0 mt-0.5" />
        </div>
      )}

      {selecting && (
        <div className="text-sm text-muted-foreground p-3 rounded-xl bg-card/30 border border-accent/10">
          Marcá los comparables que querés incluir en la ficha para tu cliente. Cada uno ocupará una hoja con todas sus fotos y
          características.
        </div>
      )}

      <Section
        title="Cartera de tu agencia"
        icon={Building2}
        items={carteraOrdenada}
        empty={
          carteraFallo
            ? "La búsqueda en tu cartera no se completó — no hay forma de saber si hay comparables. Probá de nuevo."
            : "No se encontraron comparables en tu cartera con estos criterios."
        }
        selectable={selecting}
        selected={selected}
        onToggle={toggle}
        sujeto={sujeto}
        fotosPorId={fotosPorId}
      />
      <Section
        title="Red de colaboración"
        icon={Network}
        items={roomixOrdenado}
        empty={
          roomixFallo
            ? "La búsqueda en la red de colaboración no se completó — no hay forma de saber si hay comparables. Probá de nuevo."
            : "No se encontraron comparables en la red de colaboración. (Para venta hay pocos avisos en la red; el grueso está en alquiler.)"
        }
        selectable={selecting}
        selected={selected}
        onToggle={toggle}
        sujeto={sujeto}
        fotosPorId={fotosPorId}
      />

      {/* Barra de acción flotante al seleccionar — via portal a <body> para escapar el
          contenedor de posicionamiento que crea el backdrop-blur de la Card del ACM
          (si no, "fixed" queda anclado a la Card y hay que scrollear hasta el final para verla). */}
      {selecting && mounted &&
        createPortal(
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl bg-card border border-accent/30 shadow-2xl shadow-black/30">
            <span className="text-sm font-semibold whitespace-nowrap">
              {selected.size} {selected.size === 1 ? "comparable" : "comparables"} seleccionado{selected.size === 1 ? "" : "s"}
            </span>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={cancelar}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={cargandoPrev || selected.size === 0}
              onClick={revisarConclusiones}
            >
              {cargandoPrev ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
              {cargandoPrev ? "Preparando…" : "Continuar"}
            </Button>
          </div>,
          document.body
        )}

      {/* Revisión de conclusiones antes de generar la ficha */}
      {revisando && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-card border border-accent/20 shadow-2xl">
              <div className="p-5 border-b border-accent/10">
                <h3 className="text-lg font-black flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-accent" /> Conclusiones del estudio
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Se calcularon con los comparables que elegiste. Podés editarlas, agregar las tuyas o sacar la sección
                  para que no aparezca en la ficha del cliente.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {/* Aviso antes de crear la ficha: alguno de los seleccionados tiene fotos que
                    NO muestran la propiedad (render de pozo, solo palier, planos). Nunca se
                    saca nada solo — el asesor decide si lo deja o lo quita. */}
                {advertenciasFotos.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 space-y-2.5">
                    <div className="flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-red-700 dark:text-red-400">
                        <p className="font-bold">
                          {advertenciasFotos.length === 1
                            ? "Un comparable seleccionado tiene fotos que no muestran la propiedad"
                            : `${advertenciasFotos.length} comparables seleccionados tienen fotos que no muestran la propiedad`}
                        </p>
                        <p className="mt-0.5">
                          Van a salir en la ficha del cliente igual, salvo que los saques. Comparar (o mostrarle al cliente)
                          fotos que no son de la propiedad puede confundirlo o restarle credibilidad al informe.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1.5">
                      {advertenciasFotos.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs bg-background/40 rounded-lg px-2.5 py-1.5">
                          <span className="truncate">
                            <span className="font-semibold">{a.titulo}</span>
                            {a.motivo ? <span className="text-muted-foreground"> — {a.motivo}</span> : null}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(a.id)}
                            className="shrink-0 text-red-600 font-bold hover:underline"
                          >
                            Sacar de la ficha
                          </button>
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1">
                      <Checkbox checked={entendidoAdvertencia} onCheckedChange={(v) => setEntendidoAdvertencia(v === true)} />
                      Entiendo, incluir en la ficha de todos modos
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setIncluirConclusiones((v) => !v)}
                    className="text-accent"
                    aria-label={incluirConclusiones ? "Sacar la sección de conclusiones" : "Incluir la sección de conclusiones"}
                  >
                    {incluirConclusiones ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground/50" />}
                  </button>
                  Incluir la sección de conclusiones en la ficha
                </label>

                {incluirConclusiones && (
                  <div className="space-y-3 pt-1">
                    {conclusiones.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">
                        Sin conclusiones. Agregá una o dejá la sección afuera.
                      </p>
                    )}
                    {conclusiones.map((t, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <textarea
                          value={t}
                          onChange={(e) =>
                            setConclusiones((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                          }
                          rows={3}
                          className="flex-1 rounded-xl border border-accent/20 bg-background/50 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <button
                          type="button"
                          onClick={() => setConclusiones((prev) => prev.filter((_, j) => j !== i))}
                          className="mt-1 p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          aria-label="Eliminar conclusión"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-accent/20"
                      onClick={() => setConclusiones((prev) => [...prev, ""])}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Agregar conclusión
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-accent/10 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setRevisando(false)} disabled={creating}>
                  Volver
                </Button>
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={creating || (advertenciasFotos.length > 0 && !entendidoAdvertencia)}
                  onClick={crearFicha}
                >
                  {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  {creating ? "Creando…" : "Crear ficha"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
