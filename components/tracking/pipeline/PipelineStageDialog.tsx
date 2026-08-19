"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PerformanceLogForm } from "@/components/tracking/PerformanceLogForm";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";
import { labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard | null;
  targetStage: ActivityType | null;
  proceso: ProcesoNegocio | null;
  /** true cuando se está abriendo el segundo proceso del cliente, no moviendo la tarjeta. */
  esProcesoNuevo: boolean;
  isDirector?: boolean;
  onSaved: () => void;
}

export function PipelineStageDialog({
  open,
  onOpenChange,
  card,
  targetStage,
  proceso,
  esProcesoNuevo,
  isDirector,
  onSaved,
}: Props) {
  if (!card || !targetStage) return null;

  const stage = PIPELINE_STAGES.find((s) => s.id === targetStage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle className="text-2xl font-bold tracking-tight">
              {esProcesoNuevo ? `Abrir proceso de ${labelDeProceso(proceso)}` : `Pasar a ${stage?.title}`}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              {esProcesoNuevo
                ? `${card.clientName} pasa a tener dos procesos en paralelo. La tarjeta que ya tenías no se mueve de donde está.`
                : `${card.clientName} todavía no tiene actividad en esta etapa. Completá los datos y queda registrada como cualquier otra actividad.`}
            </SheetDescription>
          </SheetHeader>

          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 pt-6">
            <PerformanceLogForm
              isDirector={isDirector}
              forcedType={targetStage}
              forcedProceso={proceso}
              lockedClient={{
                label: card.clientName,
                leadId: card.leadId,
                waContactId: card.waContactId,
              }}
              defaults={{ propertyId: card.propertyId, propiedadRef: card.propiedadRef }}
              onSuccess={() => {
                onSaved();
                onOpenChange(false);
              }}
            />
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
