"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, MapPin, ArrowRight } from "lucide-react";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { PerformanceLog, PipelineMove } from "@/lib/tracking/types";
import { badgeDeProceso, labelDeProceso, procesosPosiblesParaTarjeta, type ProcesoNegocio } from "@/lib/tracking/proceso";
import { asignarProcesoATarjeta } from "@/actions/tracking/asignarProcesoATarjeta";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard | null;
  /** Todos los procesos que ese cliente tiene abiertos, para ofrecer el que falta. */
  procesosDelCliente: ProcesoNegocio[];
  onAbrirProceso: (card: PipelineCard, proceso: ProcesoNegocio) => void;
  moves: PipelineMove[];
  onEditLog: (log: PerformanceLog) => void;
  /** Se llama después de clasificar con éxito una tarjeta "Sin definir". */
  onResuelto: () => void;
}

const tituloEtapa = (id: string) => PIPELINE_STAGES.find((s) => s.id === id)?.title ?? id;

const TODOS_LOS_PROCESOS: ProcesoNegocio[] = ["vendedor", "comprador", "locador", "locatario"];

export function PipelineClientSheet({
  open,
  onOpenChange,
  card,
  procesosDelCliente,
  onAbrirProceso,
  moves,
  onEditLog,
  onResuelto,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [eligiendo, setEligiendo] = useState<ProcesoNegocio | null>(null);

  if (!card) return null;

  // Los procesos que sirven para TODAS las actividades de esta tarjeta: la
  // intersección, no una lista por fila. Vacía cuando la tarjeta mezcla los
  // dos lados del negocio (p. ej. una prelisting y una prebuying juntas,
  // nunca clasificadas) — un estado real que hay que resolver a mano desde
  // la vista Lista, no acá.
  const posiblesParaResolver = procesosPosiblesParaTarjeta(card.logs.map((log) => log.type));

  const resolverTarjeta = (proceso: ProcesoNegocio) => {
    setEligiendo(proceso);
    startTransition(async () => {
      const res = await asignarProcesoATarjeta(
        card.logs.map((log) => log.id),
        proceso
      );
      setEligiendo(null);
      if (!res.success) {
        toast.error(res.error || "No se pudo clasificar la tarjeta");
        return;
      }
      toast.success(`Tarjeta clasificada como ${labelDeProceso(proceso)}`);
      onResuelto();
    });
  };

  // Actividades y movimientos manuales, intercalados por cuándo se registraron.
  const eventos = [
    ...card.logs.map((log) => ({ kind: "log" as const, at: log.created_at, log })),
    ...moves
      // Sólo los movimientos de ESTA tarjeta: los del otro proceso del mismo
      // cliente son otra historia y se ven abriendo la otra tarjeta.
      .filter((m) => m.client_key === card.clientKey && (m.proceso ?? null) === card.proceso)
      .map((move) => ({ kind: "move" as const, at: move.created_at, move })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle className="text-2xl font-bold tracking-tight">{card.clientName}</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              Está en <strong>{tituloEtapa(card.stage)}</strong> · {card.activityCount}{" "}
              {card.activityCount === 1 ? "actividad" : "actividades"}
            </SheetDescription>

            <div className="flex flex-wrap items-center gap-2 pt-3">
              <span
                className={cn(
                  "inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wider border",
                  badgeDeProceso(card.proceso).className
                )}
              >
                {badgeDeProceso(card.proceso).label}
              </span>

              {TODOS_LOS_PROCESOS
                .filter((p) => p !== card.proceso && !procesosDelCliente.includes(p))
                .map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => onAbrirProceso(card, p)}
                  >
                    Abrir proceso de {labelDeProceso(p)}
                  </Button>
                ))}

              {TODOS_LOS_PROCESOS
                .filter((p) => p !== card.proceso && procesosDelCliente.includes(p))
                .map((p) => (
                  <span key={p} className="text-[11px] text-muted-foreground">
                    También tiene un proceso de {labelDeProceso(p)} abierto.
                  </span>
                ))}
            </div>

            {card.proceso === null && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Esta tarjeta es de:</p>
                {posiblesParaResolver.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {posiblesParaResolver.map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={isPending}
                          onClick={() => resolverTarjeta(p)}
                        >
                          {isPending && eligiendo === p ? "Clasificando…" : labelDeProceso(p)}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Sólo clasifica las actividades viejas de esta tarjeta; no las marca como
                      modificadas ni les toca la calificación de IA.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Esta tarjeta mezcla actividades de los dos lados del negocio (por ejemplo, una
                    de Prelisting y una de Prebuying juntas): no hay un único proceso que sirva
                    para todas. Resolvela actividad por actividad desde la vista Lista.
                  </p>
                )}
              </div>
            )}
          </SheetHeader>

          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 py-6">
            <div className="space-y-3">
              {eventos.map((ev) =>
                ev.kind === "log" ? (
                  <div key={`log-${ev.log.id}`} className="rounded-xl border border-white/5 bg-card/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="capitalize">{tituloEtapa(ev.log.type)}</Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(ev.log.fecha_actividad).toLocaleDateString("es-AR")}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onEditLog(ev.log)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {(ev.log.properties?.title || ev.log.propiedad_ref) && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{ev.log.properties?.title || ev.log.propiedad_ref}</span>
                      </p>
                    )}

                    {ev.log.monto_operacion ? (
                      <p className="text-xs font-semibold">
                        USD {Number(ev.log.monto_operacion).toLocaleString("es-AR")}
                      </p>
                    ) : null}

                    {Object.entries(ev.log.metadata || {}).length > 0 && (
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        {Object.entries(ev.log.metadata).map(([k, v]) => (
                          <p key={k}>
                            <span className="capitalize">{k.replace(/_/g, " ")}:</span> {String(v)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div key={`move-${ev.move.id}`} className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                    <ArrowRight className="w-3 h-3 shrink-0" />
                    <span>
                      Movido {ev.move.from_stage ? `de ${tituloEtapa(ev.move.from_stage)} ` : ""}
                      a <strong>{tituloEtapa(ev.move.to_stage)}</strong> el{" "}
                      {new Date(ev.move.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
