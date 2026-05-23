"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PerformanceLogForm } from "./PerformanceLogForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import React from "react";

import { PerformanceLog } from "@/lib/tracking/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  logToEdit?: PerformanceLog | null;
}

export function PerformanceLogDrawer({ open, onOpenChange, onSuccess, logToEdit }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-2xl font-bold tracking-tight">
                  {logToEdit ? "Editar Actividad" : "Registrar Actividad"}
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground mt-1">
                  {logToEdit 
                    ? "Modificá los datos de la actividad de performance seleccionada." 
                    : "Cargá tus captaciones y cierres para alimentar tus métricas de performance."}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 pt-6">
            <PerformanceLogForm 
              logToEdit={logToEdit}
              onSuccess={() => {
                onSuccess();
                onOpenChange(false);
              }} 
            />
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
