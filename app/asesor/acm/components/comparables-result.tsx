"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AcmComparable, ChecklistItem, Sujeto, Operacion } from "@/lib/tasacion/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Check, X, Minus, ChevronDown, ExternalLink, Building2, Network, ArrowLeft, MapPin, Ruler, DoorOpen,
  FileText, Loader2, CheckSquare, Square,
} from "lucide-react";

interface Props {
  sujeto: Sujeto;
  operacion: Operacion;
  cartera: AcmComparable[];
  roomix: AcmComparable[];
  conSemantica: boolean;
  onVolver: () => void;
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
  c, selectable, selected, onToggle,
}: {
  c: AcmComparable; selectable?: boolean; selected?: boolean; onToggle?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
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
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-2xl font-black leading-none ${pctColor(c.match_pct)}`}>{c.match_pct}%</p>
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
                {/* Las dimensiones con peso 0 son filtros duros (tipo, operación, zona/barrio). */}
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
  title, icon: Icon, items, empty, selectable, selected, onToggle,
}: {
  title: string; icon: any; items: AcmComparable[]; empty: string;
  selectable?: boolean; selected?: Set<string>; onToggle?: (id: string) => void;
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
            <ComparableCard key={c.id} c={c} selectable={selectable} selected={selected?.has(c.id)} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_FICHA = 12;

export function ComparablesResult({ sujeto, operacion, cartera, roomix, conSemantica, onVolver }: Props) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const byId = useMemo(() => {
    const m = new Map<string, AcmComparable>();
    for (const c of [...cartera, ...roomix]) m.set(c.id, c);
    return m;
  }, [cartera, roomix]);

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
  };

  const crearFicha = async () => {
    const comparables = [...selected].map((id) => byId.get(id)).filter(Boolean) as AcmComparable[];
    if (comparables.length === 0) {
      toast.error("Seleccioná al menos un comparable.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/acm/ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operacion, sujeto, comparables }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo crear la ficha.");
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

      {selecting && (
        <div className="text-sm text-muted-foreground p-3 rounded-xl bg-card/30 border border-accent/10">
          Marcá los comparables que querés incluir en la ficha para tu cliente. Cada uno ocupará una hoja con todas sus fotos y
          características.
        </div>
      )}

      <Section
        title="Cartera de tu agencia"
        icon={Building2}
        items={cartera}
        empty="No se encontraron comparables en tu cartera con estos criterios."
        selectable={selecting}
        selected={selected}
        onToggle={toggle}
      />
      <Section
        title="Red de colaboración"
        icon={Network}
        items={roomix}
        empty="No se encontraron comparables en la red de colaboración. (Para venta hay pocos avisos en la red; el grueso está en alquiler.)"
        selectable={selecting}
        selected={selected}
        onToggle={toggle}
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
              disabled={creating || selected.size === 0}
              onClick={crearFicha}
            >
              {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
              {creating ? "Creando…" : "Crear ficha"}
            </Button>
          </div>,
          document.body
        )}
    </div>
  );
}
