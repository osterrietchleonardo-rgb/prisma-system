"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface DashboardHeaderActionsProps {
  data: any
}

export function DashboardHeaderActions({ data }: DashboardHeaderActionsProps) {
  const handleExport = () => {
    // Basic CSV Generation from KPIs
    if (!data?.kpis) return;
    
    const kpis = data.kpis;
    let csvRows = [
      ["KPI", "Valor"],
      ["Leads Nuevos", kpis.newLeads],
      ["Visitas Pendientes", kpis.pendingVisits],
      ["Volumen de Ventas", kpis.salesVolume],
      ["", ""],
      ["DISTRIBUCIÓN POR FUENTE", "Cantidad"],
      ...(kpis.sourceDistribution?.map((d: any) => [d.label, d.count]) || []),
      ["", ""],
      ["DISTRIBUCIÓN POR OPERACIÓN", "Cantidad"],
      ...(kpis.operationDistribution?.map((d: any) => [d.label, d.count]) || []),
      ["", ""],
      ["DISTRIBUCIÓN POR TIPO", "Cantidad"],
      ...(kpis.typeDistribution?.map((d: any) => [d.label, d.count]) || [])
    ];
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + csvRows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dashboard_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex items-center gap-2">
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleExport}
        className="flex border-accent/20 bg-accent/5 transition-all hover:bg-accent/10"
      >
        <Download className="mr-2 h-4 w-4" />
        Exportar
      </Button>
    </div>
  )
}
