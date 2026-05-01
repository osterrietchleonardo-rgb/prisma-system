"use client"

import { useState, useEffect, useOptimistic } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { KanbanColumn } from "./kanban-column"
import { KanbanCard } from "./kanban-card"
import { Lead, KanbanStage, KANBAN_STAGES } from "./types"
import { createPortal } from "react-dom"
import { updateLeadStage } from "@/lib/queries/director"
import { toast } from "sonner"

interface KanbanBoardProps {
  initialLeads: Lead[]
  onCardClick: (lead: Lead) => void
  detailsUrl?: string
}

export function KanbanBoard({ initialLeads, onCardClick, detailsUrl = "/director/leads" }: KanbanBoardProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  
  // Sensors for better drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Avoid accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "Lead") {
      setActiveLead(event.active.data.current.lead)
    }
  }

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    const isActiveALead = active.data.current?.type === "Lead"
    const isOverALead = over.data.current?.type === "Lead"

    if (!isActiveALead) return

    if (isActiveALead && isOverALead) {
      setLeads((leads) => {
        const activeIndex = leads.findIndex((l) => l.id === activeId)
        const overIndex = leads.findIndex((l) => l.id === overId)

        if (leads[activeIndex].pipeline_stage !== leads[overIndex].pipeline_stage) {
          const updatedLeads = [...leads]
          updatedLeads[activeIndex] = {
            ...updatedLeads[activeIndex],
            pipeline_stage: leads[overIndex].pipeline_stage
          }
          return arrayMove(updatedLeads, activeIndex, overIndex - 1)
        }

        return arrayMove(leads, activeIndex, overIndex)
      })
    }

    // Impl dropping lead over a column
    const isOverAColumn = KANBAN_STAGES.some((s) => s.id === overId)

    if (isActiveALead && isOverAColumn) {
      setLeads((leads) => {
        const activeIndex = leads.findIndex((l) => l.id === activeId)
        const updatedLeads = [...leads]
        updatedLeads[activeIndex] = {
          ...updatedLeads[activeIndex],
          pipeline_stage: overId as string
        }
        return arrayMove(updatedLeads, activeIndex, activeIndex)
      })
    }
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const originalStage = activeLead?.pipeline_stage
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const finalStage = KANBAN_STAGES.some(s => s.id === overId) 
      ? overId 
      : leads.find(l => l.id === overId)?.pipeline_stage

    if (finalStage && originalStage !== finalStage) {
      try {
        await updateLeadStage(activeId, finalStage as string)
        setLeads(prev => prev.map(l => 
          l.id === activeId 
            ? { ...l, pipeline_stage: finalStage as string, updated_at: new Date().toISOString() } 
            : l
        ))
        toast.success(`Lead movido a ${KANBAN_STAGES.find(s => s.id === finalStage)?.title}`)
      } catch (error) {
        toast.error("Error al actualizar la etapa")
        setLeads(initialLeads) // Rollback
      }
    }
  }

  const handleCardClick = (lead: Lead) => {
    // This will open the LeadDetailSheet (to be implemented)
    console.log("Lead clicked:", lead)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* Este div inline-flex hace que el contenido sea más ancho que el padre,
          lo que activa el overflow-x-auto del contenedor en pipeline/page.tsx */}
      <div className="inline-flex gap-4 px-4 md:px-8 pb-4 h-full min-h-[500px] scrollbar-thin scrollbar-thumb-accent/20">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {KANBAN_STAGES.map((stage) => (
            <KanbanColumn
              key={stage.id}
              id={stage.id as KanbanStage}
              title={stage.title}
              icon={stage.icon}
              color={stage.color}
              leads={leads.filter((l) => l.pipeline_stage === stage.id)}
              onClickCard={onCardClick}
              detailsUrl={detailsUrl}
            />
          ))}
        </SortableContext>
      </div>

      {typeof document !== "undefined" && createPortal(
        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: "0.5",
              },
            },
          }),
        }}>
          {activeLead ? (
            <div className="w-[280px]">
              <KanbanCard lead={activeLead} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  )
}
