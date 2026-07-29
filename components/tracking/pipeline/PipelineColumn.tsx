"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { PipelineCardItem } from "./PipelineCard";
import type { PipelineCard, PipelineStageDef } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";

interface Props {
  stage: PipelineStageDef;
  cards: PipelineCard[];
  onOpenCard: (card: PipelineCard) => void;
  onMoveCard: (card: PipelineCard, stage: ActivityType) => void;
  showAgent?: boolean;
}

export function PipelineColumnView({ stage, cards, onOpenCard, onMoveCard, showAgent }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const Icon = stage.icon;

  return (
    <div className="flex flex-col w-[280px] shrink-0 h-full bg-accent/5 rounded-xl border border-accent/10">
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg text-white", stage.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-sm leading-tight">{stage.title}</h3>
        </div>
        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{cards.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 overflow-y-auto scrollbar-hide min-h-[300px] transition-colors rounded-b-xl",
          isOver && "bg-accent/10"
        )}
      >
        <SortableContext items={cards.map((c) => c.clientKey)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <PipelineCardItem
              key={card.clientKey}
              card={card}
              onOpen={onOpenCard}
              onMoveTo={onMoveCard}
              showAgent={showAgent}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="h-full flex items-center justify-center p-8 text-center opacity-30">
            <p className="text-xs font-medium">Sin clientes en esta etapa</p>
          </div>
        )}
      </div>
    </div>
  );
}
