import { Lead, DashboardFilters, KPIData } from "./types";
import { isWithinInterval, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isAfter, isBefore, parseISO, isValid } from "date-fns";

export function getPeriodIntervals(filter: DashboardFilters) {
  const now = new Date();
  let currentStart = now;
  let currentEnd = now;
  let previousStart = now;
  let previousEnd = now;

  // Defaults and parsing
  switch (filter.period) {
    case "week":
      currentStart = startOfWeek(now, { weekStartsOn: 1 });
      currentEnd = endOfWeek(now, { weekStartsOn: 1 });
      previousStart = subDays(currentStart, 7);
      previousEnd = subDays(currentEnd, 7);
      break;
    case "month":
      currentStart = startOfMonth(now);
      currentEnd = endOfMonth(now);
      previousStart = subMonths(currentStart, 1);
      previousEnd = subMonths(currentEnd, 1);
      break;
    case "3months":
      currentStart = subMonths(now, 3);
      currentEnd = now;
      previousStart = subMonths(currentStart, 3);
      previousEnd = subMonths(currentEnd, 3);
      break;
    case "custom":
      if (filter.startDate && filter.endDate) {
        currentStart = new Date(filter.startDate);
        currentEnd = new Date(filter.endDate);
        const days = Math.abs(currentEnd.getTime() - currentStart.getTime()) / (1000 * 3600 * 24);
        previousStart = subDays(currentStart, days);
        previousEnd = subDays(currentEnd, days);
      }
      break;
  }

  return { currentStart, currentEnd, previousStart, previousEnd };
}

export function calculateKPIs(leads: Lead[], filter: DashboardFilters): { 
  kpis: KPIData, 
  filteredLeads: Lead[],
  funnelData: any[],
  originData: any[],
  performanceRadar: any[],
  lineChartData: any[]
} {
  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodIntervals(filter);

  const currentLeads = leads.filter(l => {
    const d = new Date(l.fecha_primer_contacto);
    return isAfter(d, currentStart) && isBefore(d, currentEnd);
  });

  const previousLeads = leads.filter(l => {
    const d = new Date(l.fecha_primer_contacto);
    return isAfter(d, previousStart) && isBefore(d, previousEnd);
  });

  const kpis: KPIData = {
    leadsCaptadosActual: currentLeads.length,
    leadsCaptadosAnterior: previousLeads.length,
    leadsCaptadosVar: 0,
    operacionesActual: currentLeads.filter(l => l.estado === "cerrado").length,
    operacionesAnterior: previousLeads.filter(l => l.estado === "cerrado").length,
    operacionesVar: 0,
    comisionActual: currentLeads.reduce((acc, l) => acc + (l.comision_generada || 0), 0),
    comisionAnterior: previousLeads.reduce((acc, l) => acc + (l.comision_generada || 0), 0),
    comisionVar: 0,
    scorePromedioActual: 0,
    scorePromedioAnterior: 0,
    scorePromedioVar: 0
  };

  const getVar = (act: number, prev: number) => prev === 0 ? (act > 0 ? 100 : 0) : ((act - prev) / prev) * 100;
  
  kpis.leadsCaptadosVar = getVar(kpis.leadsCaptadosActual, kpis.leadsCaptadosAnterior);
  kpis.operacionesVar = getVar(kpis.operacionesActual, kpis.operacionesAnterior);
  kpis.comisionVar = getVar(kpis.comisionActual, kpis.comisionAnterior);

  const scoreAct = currentLeads.filter(l => l.wa_score_general);
  kpis.scorePromedioActual = scoreAct.length > 0 ? scoreAct.reduce((acc, l) => acc + (l.wa_score_general || 0), 0) / scoreAct.length : 0;
  
  const scorePrev = previousLeads.filter(l => l.wa_score_general);
  kpis.scorePromedioAnterior = scorePrev.length > 0 ? scorePrev.reduce((acc, l) => acc + (l.wa_score_general || 0), 0) / scorePrev.length : 0;
  kpis.scorePromedioVar = getVar(kpis.scorePromedioActual, kpis.scorePromedioAnterior);

  // Funnel Data
  const visitas = currentLeads.filter(l => l.visita_realizada).length;
  const propuestas = currentLeads.filter(l => l.propuesta_enviada).length;
  const funnelData = [
    { name: "Leads Captados", value: kpis.leadsCaptadosActual },
    { name: "Visitas", value: visitas },
    { name: "Propuestas", value: propuestas },
    { name: "Cerrados", value: kpis.operacionesActual },
  ];

  // Origin Pie
  const originMap: Record<string, number> = {};
  currentLeads.forEach(l => {
    if (l.canal_origen) {
      originMap[l.canal_origen] = (originMap[l.canal_origen] || 0) + 1;
    }
  });
  const originData = Object.keys(originMap).map(k => ({ name: k, value: originMap[k] }));

  // Radar Performance
  const leadsWithScore = currentLeads.filter(l => l.wa_score_general);
  const avgScore = leadsWithScore.length > 0 ? leadsWithScore.reduce((a, l) => a + (l.wa_score_general || 0), 0) / leadsWithScore.length : 0;
  
  // Velocidad de respuesta (10 - min(wa_tiempo_respuesta_promedio_min/60, 10))
  const respTimes = currentLeads.filter(l => l.wa_tiempo_respuesta_promedio_min !== null);
  const avgResp = respTimes.length > 0 ? respTimes.reduce((a, l) => a + (l.wa_tiempo_respuesta_promedio_min || 0), 0) / respTimes.length : 0;
  const velocidadScore = 10 - Math.min(avgResp / 60, 10);

  // Ratio de conversación (min(wa_ratio * 2.5, 10))
  const ratios = currentLeads.filter(l => l.wa_ratio !== null);
  const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + (b.wa_ratio || 0), 0) / ratios.length : 0;
  const converScore = Math.min(avgRatio * 2.5, 10);

  // Tasa visita
  const tasaVisita = currentLeads.length > 0 ? (visitas / currentLeads.length) * 10 : 0;
  
  // Tasa de Cierre
  const tasaCierre = currentLeads.length > 0 ? (kpis.operacionesActual / currentLeads.length) * 10 : 0;

  const performanceRadar = [
    { subject: 'Score General', A: avgScore, fullMark: 10 },
    { subject: 'Velocidad', A: velocidadScore, fullMark: 10 },
    { subject: 'Conversación', A: converScore, fullMark: 10 },
    { subject: 'Tasa Visita', A: Math.min(tasaVisita, 10), fullMark: 10 },
    { subject: 'Tasa Cierre', A: Math.min(tasaCierre, 10), fullMark: 10 },
  ];

  // Line Chart simple grouping by date
  const lineChartData: any[] = [];
  const daysMap: Record<string, { leads: number, cerrados: number }> = {};
  currentLeads.forEach(l => {
    if (!l.fecha_primer_contacto) return;
    const dp = l.fecha_primer_contacto.split("T")[0];
    if (!daysMap[dp]) daysMap[dp] = { leads: 0, cerrados: 0 };
    daysMap[dp].leads++;
    if (l.estado === "cerrado") daysMap[dp].cerrados++;
  });
  Object.keys(daysMap).sort().forEach(d => {
    lineChartData.push({ date: d, leads: daysMap[d].leads, cerrados: daysMap[d].cerrados });
  });

  return { kpis, filteredLeads: currentLeads, funnelData, originData, performanceRadar, lineChartData };
}
