"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreVertical, MapPin, Phone, Activity } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";
import { formatPhoneInternational } from "@/lib/whatsapp/phone";

interface Props {
  card: PipelineCard;
  onOpen: (card: PipelineCard) => void;
  onMoveTo: (card: PipelineCard, stage: ActivityType) => void;
  showAgent?: boolean;
}

export function PipelineCardItem({ card, onOpen, onMoveTo, showAgent }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.clientKey, data: { type: "PipelineCard", card } });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-white/5 bg-card/60 p-3 space-y-2 backdrop-blur-sm transition-all",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* El área de arrastre es el cuerpo, no el menú. */}
        <button
          type="button"
          onClick={() => onOpen(card)}
          className="text-left flex-1 min-w-0"
          {...attributes}
          {...listeners}
        >
          <p className="font-bold text-sm truncate">{card.clientName}</p>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mover a otra etapa"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Mover a…</DropdownMenuLabel>
            {PIPELINE_STAGES.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                disabled={stage.id === card.stage}
                onClick={() => onMoveTo(card, stage.id)}
              >
                {stage.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {card.clientPhone && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Phone className="w-3 h-3 shrink-0" />
          <span className="truncate">{formatPhoneInternational(card.clientPhone) ?? card.clientPhone}</span>
        </p>
      )}

      {card.propertyLabel && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.propertyLabel}</span>
        </p>
      )}

      <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          {card.activityCount} {card.activityCount === 1 ? "actividad" : "actividades"}
        </span>
        {card.lastActivityDate && (
          <span>{new Date(card.lastActivityDate).toLocaleDateString("es-AR")}</span>
        )}
      </div>

      {showAgent && card.agentName && (
        <p className="text-[10px] font-medium text-accent/80 truncate">{card.agentName}</p>
      )}
    </div>
  );
}
