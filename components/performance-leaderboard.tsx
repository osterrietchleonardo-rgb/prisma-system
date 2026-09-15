"use client";

import React, { useMemo } from "react";
import { useOrdenTabla } from "@/hooks/use-orden-tabla";
import { AvisoOrden, IconoOrden } from "@/components/dashboard/orden-tabla";
import { 
  Trophy, 
  Sparkles,
  Percent,
  TrendingUp,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Search,
  Home,
  Target,
  DollarSign,
  Briefcase,
  Zap,
  Lock,
  ClipboardList
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AdvisorSummary {
  id: string;
  name: string;
  wa_chats: number;
  prospeccion: number;
  /** Logs de actividad `prelisting` cargados en Tracking Performance. La columna se llamaba "Tasac.". */
  prelisting: number;
  /** Fichas del módulo ACM. Métrica aparte del prelisting: se cuenta sola al generar la ficha. */
  acm: number;
  compradores: number;
  captaciones: number;
  reservas: number;
  transacciones: number;
  /**
   * `null` = la facturación de ese asesor está oculta para quien mira.
   * El asesor solo ve el número de su propia fila; el resto llega en null
   * DESDE EL SERVIDOR (no se manda y se tapa: nunca viaja al navegador).
   */
  facturacion: number | null;
  cartera_activa: number;
  rotacion: number;
  classification: string;
  /** `null` cuando el motivo está oculto: el texto suele citar la facturación exacta. */
  classificationReason: string | null;
}

interface PerformanceLeaderboardProps {
  advisors: AdvisorSummary[];
}

type ClaveRanking =
  | "name" | "wa_chats" | "prospeccion" | "prelisting" | "acm" | "compradores" | "captaciones"
  | "reservas" | "transacciones" | "cartera_activa" | "rotacion" | "facturacion" | "classification";

const ETIQUETA_COLUMNA: Record<ClaveRanking, string> = {
  name: "Asesor", wa_chats: "Chats", prospeccion: "Prospección", prelisting: "Prelistings", acm: "ACM",
  compradores: "Compradores", captaciones: "Captaciones", reservas: "Reservas", transacciones: "Cierres",
  cartera_activa: "Cartera", rotacion: "Rotación", facturacion: "Facturación", classification: "Clasificación",
};

// Una facturación oculta (null) queda al final: no se puede ordenar lo que no se ve.
const valorRanking = (a: AdvisorSummary, k: ClaveRanking) => a[k];

export function PerformanceLeaderboard({ advisors }: PerformanceLeaderboardProps) {
  // Orden original: por facturación descendente. Si alguna viene oculta (null) no se puede
  // ordenar acá sin inventar posiciones, así que se respeta el orden que ya mandó el servidor
  // —que sí conoce los montos reales y las ordenó bien antes de taparlas.
  const sortedAdvisors = useMemo(() => {
    const hayFacturacionOculta = advisors.some((a) => a.facturacion === null);
    return hayFacturacionOculta
      ? advisors
      : [...advisors].sort((a, b) => (b.facturacion ?? 0) - (a.facturacion ?? 0));
  }, [advisors]);

  // La "Posición #n" es la del ranking por facturación, no la del orden que eligió el usuario.
  const posicion = useMemo(() => new Map(sortedAdvisors.map((a, i) => [a.id, i + 1])), [sortedAdvisors]);
  const { ordenadas, orden, alternar, restablecer } = useOrdenTabla(sortedAdvisors, valorRanking);

  const getBadgeColor = (classification: string) => {
    const cls = classification?.toLowerCase() || "";
    if (cls.includes('elite') || cls.includes('top') || cls.includes('estrella')) return "bg-yellow-500/20 text-yellow-800 dark:text-yellow-500 border-yellow-500/50";
    if (cls.includes('sólido') || cls.includes('solido') || cls.includes('consistente')) return "bg-blue-500/20 text-blue-800 dark:text-blue-500 border-blue-500/50";
    if (cls.includes('desarrollo') || cls.includes('aprendizaje')) return "bg-orange-500/20 text-orange-800 dark:text-orange-500 border-orange-500/50";
    return "bg-slate-500/20 text-slate-800 dark:text-slate-400 border-slate-500/50";
  };

  const ariaSort = (k: ClaveRanking) =>
    orden?.clave === k ? (orden.dir === "asc" ? "ascending" : "descending") : "none";

  // Cada encabezado es un botón: un clic ordena, otro invierte, el tercero vuelve al original.
  const MetricHeader = ({ icon: Icon, label, tooltip, clave }: { icon: any, label: string, tooltip: string, clave: ClaveRanking }) => (
    <th className="px-3 py-4 font-bold text-center" aria-sort={ariaSort(clave)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={() => alternar(clave)}
            className="flex flex-col items-center gap-1 mx-auto group min-h-11 min-w-11 justify-center"
          >
            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            <span className="flex items-center gap-0.5 text-[9px] uppercase tracking-tighter opacity-70 group-hover:opacity-100">
              {label}
              <IconoOrden activo={orden?.clave === clave} dir={orden?.dir} />
            </span>
          </TooltipTrigger>
          <TooltipContent className="bg-popover/95 backdrop-blur-md border-accent/20">
            <p className="text-xs font-semibold">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </th>
  );

  return (
    <Card className="performance-leaderboard-container border-accent/10 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl w-full">
      <CardHeader className="border-b border-accent/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg shadow-inner">
              <Trophy className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle className="text-lg">Ranking de Asesores</CardTitle>
              <CardDescription>Métricas detalladas por etapa del embudo comercial.</CardDescription>
            </div>
          </div>
        </div>
        <div className="pt-2">
          <AvisoOrden
            etiqueta={orden ? ETIQUETA_COLUMNA[orden.clave] : null}
            dir={orden?.dir}
            esTexto={orden?.clave === "name" || orden?.clave === "classification"}
            onRestablecer={restablecer}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-left min-w-[1080px]">
            <thead className="bg-muted/30 text-muted-foreground border-b border-accent/5">
              <tr>
                <th className="px-6 py-4 font-bold min-w-[200px] sticky left-0 bg-muted/95 backdrop-blur-md z-20 border-r border-accent/10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]" aria-sort={ariaSort("name")}>
                  <button type="button" onClick={() => alternar("name")} className="flex min-h-11 items-center gap-1.5 hover:text-accent">
                    Asesor <IconoOrden activo={orden?.clave === "name"} dir={orden?.dir} />
                  </button>
                </th>
                <MetricHeader clave="wa_chats" icon={MessageSquare} label="Chats" tooltip="WhatsApp Recibidos" />
                <MetricHeader clave="prospeccion" icon={TrendingUp} label="Prosp." tooltip="Prospección Activa" />
                <MetricHeader clave="prelisting" icon={FileText} label="Prelist." tooltip="Prelistings cargados en Tracking Performance" />
                <MetricHeader clave="acm" icon={ClipboardList} label="ACM" tooltip="Fichas ACM generadas" />
                <MetricHeader clave="compradores" icon={Search} label="Comp." tooltip="Compradores Calificados" />
                <MetricHeader clave="captaciones" icon={Home} label="Capt." tooltip="Propiedades Captadas" />
                <MetricHeader clave="reservas" icon={Target} label="Res." tooltip="Reservas Logradas" />
                <MetricHeader clave="transacciones" icon={Zap} label="Cierre" tooltip="Cierres Totales" />
                <MetricHeader clave="cartera_activa" icon={Briefcase} label="Cart." tooltip="Cartera activa: propiedades publicadas asignadas al asesor" />
                <MetricHeader clave="rotacion" icon={Percent} label="Rot." tooltip="% Rotación: cierres del período ÷ cartera promedio" />
                <MetricHeader clave="facturacion" icon={DollarSign} label="Fact." tooltip="GCI (Facturación Bruta)" />
                <th className="px-6 py-4 font-bold text-right" aria-sort={ariaSort("classification")}>
                  <button type="button" onClick={() => alternar("classification")} className="ml-auto flex min-h-11 items-center gap-1.5 hover:text-accent">
                    Clasificación IA <IconoOrden activo={orden?.clave === "classification"} dir={orden?.dir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5">
              {ordenadas.map((advisor) => (
                <tr key={advisor.id} className="group hover:bg-accent/5 transition-all duration-200">
                  <td className="px-6 py-4 sticky left-0 bg-card/95 backdrop-blur-md z-10 border-r border-accent/10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent ring-1 ring-accent/20">
                        {advisor.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground/90 truncate max-w-[120px]">{advisor.name}</span>
                        <span className="text-[10px] text-muted-foreground">Posición #{posicion.get(advisor.id)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-blue-600 dark:text-blue-400">{advisor.wa_chats}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{advisor.prospeccion}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-amber-700 dark:text-amber-400">{advisor.prelisting}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-teal-700 dark:text-teal-400">{advisor.acm}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-purple-600 dark:text-purple-400">{advisor.compradores}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{advisor.captaciones}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-orange-700 dark:text-orange-400">{advisor.reservas}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-red-600 dark:text-red-400">{advisor.transacciones}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <Badge variant="secondary" className="bg-slate-500/10 text-slate-700 dark:text-slate-400 border-none font-mono text-[10px]">
                      {advisor.cartera_activa}
                    </Badge>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className={cn(
                      "font-mono text-[11px] font-bold",
                      advisor.rotacion >= 10 ? "text-green-700 dark:text-green-400" : 
                      advisor.rotacion >= 5 ? "text-blue-600 dark:text-blue-400" : "text-orange-700 dark:text-orange-400"
                    )}>
                      {advisor.rotacion.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    {advisor.facturacion === null ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground whitespace-nowrap">
                        <Lock className="h-3 w-3" />
                        Privado
                      </span>
                    ) : (
                      <span className="font-bold text-accent whitespace-nowrap">
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(advisor.facturacion)}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={`${getBadgeColor(advisor.classification)} gap-1.5 cursor-help py-1 px-3 border-accent/20 shadow-sm transition-transform active:scale-95`}>
                            <Sparkles className="h-3 w-3" />
                            <span className="whitespace-nowrap">{advisor.classification || "Sin Clasificar"}</span>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[280px] bg-card/95 border-accent/20 backdrop-blur-xl p-4 shadow-2xl">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 border-b border-accent/10 pb-2">
                              <TrendingUp className="h-3 w-3 text-accent" />
                              <p className="text-[10px] uppercase font-bold text-accent tracking-tighter">Análisis de Desempeño</p>
                            </div>
                            {advisor.classificationReason ? (
                              <p className="text-xs text-muted-foreground leading-relaxed italic">
                                "{advisor.classificationReason}"
                              </p>
                            ) : (
                              // El motivo cita la facturación exacta ("Facturación US$12.500 y 3
                              // transacciones..."), así que se oculta junto con ella.
                              <p className="text-xs text-muted-foreground leading-relaxed italic">
                                El detalle de esta clasificación es privado.
                              </p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                </tr>
              ))}
              {sortedAdvisors.length === 0 && (
                <tr>
                  {/* 13 columnas: Asesor + 11 métricas + Clasificación */}
                  <td colSpan={13} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <LayoutDashboard className="h-10 w-10 opacity-20" />
                      <p className="italic text-sm font-light">No hay actividad registrada en este período.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Utility to merge classes
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
