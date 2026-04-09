"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LeadForm } from "./LeadForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import React from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LeadDrawer({ open, onOpenChange, onSuccess }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-2xl font-bold tracking-tight">Nuevo Lead</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground mt-1">
                  Gestioná prospectos y analizá el desempeño comercial.
                </SheetDescription>
              </div>
              {/* Desktop Close is often handled by Sheet, but custom UI for polish */}
            </div>
          </SheetHeader>
          
          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 pt-6">
            <LeadForm 
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

import { Separator } from "@/components/ui/separator";
