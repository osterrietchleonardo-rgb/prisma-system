"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { PIPELINE_STAGES, buildPipeline, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType, PerformanceLog, PipelineMove } from "@/lib/tracking/types";
import { movePipelineCard } from "@/actions/tracking/movePipelineCard";
import { PipelineColumnView } from "./PipelineColumn";
import { PipelineCardItem } from "./PipelineCard";
import { PipelineStageDialog } from "./PipelineStageDialog";
import { PipelineClientSheet } from "./PipelineClientSheet";
import { etapasPermitidas, labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";

interface Props {
  /** Actividades ya filtradas por asesor, SIN filtrar por fecha/tipo/estado. */
  logs: PerformanceLog[];
  moves: PipelineMove[];
  isDirector?: boolean;
  /** Filtra qué tarjetas se ven, nunca en qué columna caen. */
  cardFilter: (card: PipelineCard) => boolean;
  onRefresh: () => void;
  onEditLog: (log: PerformanceLog) => void;
}

export function PipelineBoard({ logs, moves, isDirector, cardFilter, onRefresh, onEditLog }: Props) {
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const [openCard, setOpenCard] = useState<PipelineCard | null>(null);
  const [pending, setPending] = useState<{
    card: PipelineCard;
    stage: ActivityType;
    proceso: ProcesoNegocio | null;
    esProcesoNuevo: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { cards, sinCliente } = useMemo(() => buildPipeline(logs, moves), [logs, moves]);
  const visibles = useMemo(() => cards.filter(cardFilter), [cards, cardFilter]);

  /**
   * LA REGLA (spec 4.4). Vale igual para adelante que para atrás:
   * - Si la etapa destino YA tiene actividad de ese cliente → solo se registra
   *   el movimiento. No crea actividad, no toca métricas.
   * - Si NO la tiene → se abre el popup con los campos de esa etapa.
   */
  const resolverMovimiento = async (card: PipelineCard, destino: ActivityType) => {
    if (destino === card.stage) return;

    // Una tarjeta de compra no tiene nada que hacer en Prelisting ni Captación,
    // y una de venta no lo tiene en Prebuying: son columnas del otro lado del
    // negocio. La tarjeta vuelve sola porque su posición se recalcula desde los
    // datos, así que alcanza con explicar por qué y no refrescar.
    if (!etapasPermitidas(card.proceso).includes(destino)) {
      toast.error(
        `${PIPELINE_STAGES.find((s) => s.id === destino)?.title} es del otro lado del negocio: ` +
          `esta tarjeta es de ${labelDeProceso(card.proceso)}.`
      );
      return;
    }

    if (!card.stagesConActividad.includes(destino)) {
      setPending({ card, stage: destino, proceso: card.proceso, esProcesoNuevo: false });
      return;
    }

    const res = await movePipelineCard({
      clientKey: card.clientKey,
      proceso: card.proceso,
      leadId: card.leadId,
      waContactId: card.waContactId,
      fromStage: card.stage,
      toStage: destino,
    });

    if (!res.success) {
      // La tarjeta vuelve sola a su lugar porque la posición se recalcula
      // desde los datos: al no refrescar, nada cambió.
      toast.error(res.error || "No se pudo mover la tarjeta");
      return;
    }

    toast.success(`${card.clientName} pasó a ${PIPELINE_STAGES.find((s) => s.id === destino)?.title}`);
    onRefresh();
  };

  /**
   * Abrir el segundo proceso de un cliente = cargarle la primera actividad del
   * otro lado. La etapa de arranque de cada lado es su etapa exclusiva.
   */
  const abrirProceso = (card: PipelineCard, proceso: ProcesoNegocio) => {
    setPending({
      card,
      stage: proceso === "venta" ? "prelisting" : "prebuying",
      proceso,
      esProcesoNuevo: true,
    });
  };

  const onDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === "PipelineCard") {
      setActiveCard(e.active.data.current.card as PipelineCard);
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const card = activeCard;
    setActiveCard(null);
    if (!card || !e.over) return;

    const overId = String(e.over.id);
    const destino = PIPELINE_STAGES.some((s) => s.id === overId)
      ? (overId as ActivityType)
      : cards.find((c) => c.cardKey === overId)?.stage;

    if (destino) await resolverMovimiento(card, destino);
  };

  return (
    <div className="space-y-4">
      {sinCliente > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            <strong className="text-foreground">
              {sinCliente} {sinCliente === 1 ? "actividad" : "actividades"} sin cliente vinculado
            </strong>{" "}
            {sinCliente === 1 ? "no aparece" : "no aparecen"} en el tablero. Se siguen viendo en la
            vista Lista: editalas y vinculales un cliente para que armen su tarjeta.
          </p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {/*
          Alto fijo a propósito: el tablero entero entra en pantalla y el scroll
          pasa DENTRO de cada columna. Si el alto fuera automático, al acumularse
          tarjetas la columna crecería hacia abajo, scrollearía la página y los
          encabezados de las etapas se irían de la vista.
        */}
        <div className="overflow-x-auto pb-4 h-[calc(100vh-22rem)] min-h-[26rem]">
          <div className="inline-flex gap-3 h-full">
            {PIPELINE_STAGES.map((stage) => (
              <PipelineColumnView
                key={stage.id}
                stage={stage}
                cards={visibles.filter((c) => c.stage === stage.id)}
                onOpenCard={setOpenCard}
                onMoveCard={resolverMovimiento}
                showAgent={isDirector}
              />
            ))}
          </div>
        </div>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay>
              {activeCard ? (
                <div className="w-[280px]">
                  <PipelineCardItem card={activeCard} onOpen={() => {}} onMoveTo={() => {}} />
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>

      <PipelineStageDialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        card={pending?.card ?? null}
        targetStage={pending?.stage ?? null}
        proceso={pending?.proceso ?? null}
        esProcesoNuevo={pending?.esProcesoNuevo ?? false}
        isDirector={isDirector}
        onSaved={() => { setPending(null); onRefresh(); }}
      />

      <PipelineClientSheet
        open={!!openCard}
        onOpenChange={(open) => { if (!open) setOpenCard(null); }}
        card={openCard}
        moves={moves}
        onEditLog={(log) => { setOpenCard(null); onEditLog(log); }}
      />
    </div>
  );
}
