"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PerformanceLogForm } from "@/components/tracking/PerformanceLogForm";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard | null;
  targetStage: ActivityType | null;
  isDirector?: boolean;
  onSaved: () => void;
}

export function PipelineStageDialog({ open, onOpenChange, card, targetStage, isDirector, onSaved }: Props) {
  if (!card || !targetStage) return null;

  const stage = PIPELINE_STAGES.find((s) => s.id === targetStage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle className="text-2xl font-bold tracking-tight">
              Pasar a {stage?.title}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              {card.clientName} todavía no tiene actividad en esta etapa. Completá los datos
              y queda registrada como cualquier otra actividad.
            </SheetDescription>
          </SheetHeader>

          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 pt-6">
            <PerformanceLogForm
              isDirector={isDirector}
              forcedType={targetStage}
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
