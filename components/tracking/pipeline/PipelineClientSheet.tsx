"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, MapPin, ArrowRight } from "lucide-react";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { PerformanceLog, PipelineMove } from "@/lib/tracking/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard | null;
  moves: PipelineMove[];
  onEditLog: (log: PerformanceLog) => void;
}

const tituloEtapa = (id: string) => PIPELINE_STAGES.find((s) => s.id === id)?.title ?? id;

export function PipelineClientSheet({ open, onOpenChange, card, moves, onEditLog }: Props) {
  if (!card) return null;

  // Actividades y movimientos manuales, intercalados por cuándo se registraron.
  const eventos = [
    ...card.logs.map((log) => ({ kind: "log" as const, at: log.created_at, log })),
    ...moves
      .filter((m) => m.client_key === card.clientKey)
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
