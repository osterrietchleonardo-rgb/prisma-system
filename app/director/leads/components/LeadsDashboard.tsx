"use client";

import { LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeadsDashboardData } from "@/lib/queries/leads-dashboard";
import { LeadsOverviewTab } from "./dashboard/LeadsOverviewTab";
import { LeadsPorAsesorTab } from "./dashboard/LeadsPorAsesorTab";
import { DataQualityTab } from "./dashboard/DataQualityTab";

/**
 * Las tres solapas de Leads Comerciales. Sin filtros propios: hasta el 15/9/2026 tenía uno de
 * fechas en "todo el historial" y uno de estados que Tokko no usa; ahora todo responde al filtro
 * de arriba del dashboard. Se sacó "Estructura de datos" (texto fijo, sin datos).
 */
export function LeadsDashboard({ data }: { data: LeadsDashboardData }) {
  return (
    <Tabs defaultValue="resumen" className="w-full">
      <TabsList className="mb-6 grid h-auto w-full grid-cols-3 gap-1 border border-accent/10 bg-card/40 p-1 backdrop-blur-md sm:inline-grid sm:w-auto">
        <TabsTrigger value="resumen" className="min-h-11 gap-2 whitespace-normal text-xs font-bold">
          <LayoutDashboard className="hidden h-3.5 w-3.5 sm:block" />
          Resumen
        </TabsTrigger>
        <TabsTrigger value="asesores" className="min-h-11 gap-2 whitespace-normal text-xs font-bold">
          <Users className="hidden h-3.5 w-3.5 sm:block" />
          Por asesor
        </TabsTrigger>
        <TabsTrigger value="calidad" className="min-h-11 gap-2 whitespace-normal text-xs font-bold">
          <ShieldCheck className="hidden h-3.5 w-3.5 sm:block" />
          Calidad de datos
        </TabsTrigger>
      </TabsList>

      <TabsContent value="resumen">
        <LeadsOverviewTab data={data} />
      </TabsContent>

      <TabsContent value="asesores">
        <LeadsPorAsesorTab data={data} />
      </TabsContent>

      <TabsContent value="calidad">
        <DataQualityTab data={data} />
      </TabsContent>
    </Tabs>
  );
}
