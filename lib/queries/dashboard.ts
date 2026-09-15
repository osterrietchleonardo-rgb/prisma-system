import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { transaccionesDe, gciDe, volumenDe, honorarioRealDe, desgloseDeCierres } from "@/lib/tracking/participacion"
import { todasLasFilas } from "@/lib/queries/todas-las-filas"

// El filtro de periodo manda las fechas como "yyyy-MM-dd" (DatePeriodFilter).
// Comparar eso contra un timestamptz con <= corta a la medianoche y se pierde
// el ultimo dia entero, asi que lo estiramos al final del dia.
function finDelDia(fecha: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T23:59:59.999` : fecha
}

/** Una fila de la tarjeta "Tiempos Respuesta": promedio y mediana de la espera, ya formateados. */
export interface TiempoRespuesta {
  promedio: string
  mediana: string
  /** Cuántas esperas entraron en la cuenta. */
  casos: number
}

export interface TiemposRespuesta {
  botFirst: TiempoRespuesta
  botBetween: TiempoRespuesta
  humanFirst: TiempoRespuesta
  humanBetween: TiempoRespuesta
  /** El período del filtro, 'yyyy-MM-dd', para que la aclaración diga qué días cuenta. */
  desde?: string
  hasta?: string
}

export async function getDashboardData(
  agencyId: string,
  agentId?: string,
  startDate?: string,
  endDate?: string,
  opts?: { incluirDesvinculados?: boolean }
) {
  const supabase = createClient()
  
  // 1. WhatsApp Conversations (Top of Funnel). De a tandas: la base corta en 1.000 filas.
  const waCounts = await todasLasFilas<{ agent_id: string | null; created_at: string }>((desde, hasta) => {
    let q = supabase
      .from("wa_conversations")
      .select("agent_id, created_at")
      .eq("agency_id", agencyId)
      .order("id", { ascending: true })
      .range(desde, hasta);
    if (startDate) q = q.gte("created_at", startDate);
    if (endDate) q = q.lte("created_at", endDate);
    return q;
  });

  const waCountsByAgent = (waCounts || []).reduce((acc: any, curr: any) => {
    if (curr.agent_id) {
        acc[curr.agent_id] = (acc[curr.agent_id] || 0) + 1;
    }
    return acc;
  }, {});

  const { count: waChatsCount } = await supabase
    .from("wa_conversations")
    .select("id", { count: 'exact' })
    .eq("agency_id", agencyId)
    .filter(agentId ? 'agent_id' : 'id', agentId ? 'eq' : 'not.is', agentId || null);

  // 2. Performance Logs (The main source for business metrics)
  // Del más nuevo al más viejo: "Movimientos Recientes" toma los primeros 10. Sin orden, la
  // base los devolvía en cualquier orden y los "recientes" no eran los recientes.
  const rawLogs = await todasLasFilas<any>((desde, hasta) => {
    let q = supabase
      .from("performance_logs")
      .select("*")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, hasta);
    if (agentId) q = q.eq("agent_id", agentId);
    if (startDate) q = q.gte("fecha_actividad", startDate);
    if (endDate) q = q.lte("fecha_actividad", endDate);
    return q;
  });
  const perfLogs = rawLogs?.filter(l => l.status !== 'eliminada') || [];

  // 3. Profiles — only asesores (directors are excluded from the leaderboard).
  //
  // Se traen TODOS, incluidos los desvinculados, porque esta lista tambien
  // resuelve el nombre del autor de cada actividad del feed (mas abajo). Si se
  // filtrara en la consulta, una actividad vieja de un ex-asesor apareceria sin
  // nombre: su historial es de la inmobiliaria y tiene que seguir legible.
  const { data: todosLosAsesores } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, estado")
    .eq("agency_id", agencyId)
    .eq("role", "asesor");

  // El ranking y el desplegable de asesor si los excluyen: ya no son del equipo.
  // Sus performance_logs igual siguen sumando a los KPIs de la agencia, que se
  // calculan por agency_id mas arriba y no dependen de esta lista.
  // La pagina de Asesores es la unica que los pide (tiene su filtro propio).
  const agencyProfiles = opts?.incluirDesvinculados
    ? todosLosAsesores
    : (todosLosAsesores ?? []).filter((p) => p.estado !== "eliminado");

  // 4. Cartera (propiedades sincronizadas de Tokko). Se traen también las dadas de baja: con
  //    su fecha de alta y de baja se reconstruye cuánta cartera había a fin de cada mes.
  //    Si está activa lo dice `is_active`, NO `status`: en producción `status` vale "Venta",
  //    "Alquiler" o "Temporary rent", nunca "Active" (15/9/2026: la tarjeta mostraba 0 de 349).
  const todasLasPropiedades = await todasLasFilas<any>((desde, hasta) =>
    supabase
      .from("properties")
      .select("is_active, assigned_agent, price, currency, alta:tokko_data->>created_at, baja:tokko_data->>deleted_at")
      .eq("agency_id", agencyId)
      .order("id", { ascending: true })
      .range(desde, hasta)
  );
  const properties = todasLasPropiedades.filter((p) => p.is_active);

  // 4.b Fichas ACM creadas.
  //
  // Metrica NUEVA e INDEPENDIENTE del prelisting: son dos cosas distintas y conviven.
  //  - prelisting = actividad que el asesor carga a mano en Tracking Performance (tiene monto,
  //    de ahi salen el Pipeline Potencial y el Ticket Promedio).
  //  - acm        = ficha del modulo ACM, se cuenta sola al generarla.
  // Lo unico que desaparecio es el NOMBRE "tasaciones", que estaba mal puesto: esa columna
  // contaba prelistings.
  //
  // shared_acm_reports tiene RLS ENCENDIDA Y SIN POLITICAS (ver la migracion): ni anon ni
  // authenticated la leen. Solo la service key. Por eso va con admin client, siempre acotado
  // por agency_id — nunca puede devolver fichas de otra inmobiliaria.
  const acmAdmin = createAdminClient()
  let acmQuery = acmAdmin
    .from("shared_acm_reports")
    .select("created_by")
    .eq("agency_id", agencyId)

  if (agentId) acmQuery = acmQuery.eq("created_by", agentId)
  if (startDate) acmQuery = acmQuery.gte("created_at", startDate)
  if (endDate) acmQuery = acmQuery.lte("created_at", finDelDia(endDate))

  const { data: acmRows, error: acmError } = await acmQuery
  if (acmError) {
    // Que falte el conteo de ACM no puede tumbar el dashboard entero: se muestra 0 y queda en el log.
    console.error("Dashboard: no se pudieron contar las fichas ACM:", acmError.message)
  }

  const acmByAgent = (acmRows || []).reduce((acc: Record<string, number>, r: any) => {
    if (r.created_by) acc[r.created_by] = (acc[r.created_by] || 0) + 1
    return acc
  }, {})
  // Total del alcance pedido (agencia entera, o solo el asesor si vino agentId).
  const acmTotal = (acmRows || []).length

  // Group metrics by category
  const metrics: any = {
    prospeccion: {
      waChats: waChatsCount || 0,
      active: perfLogs?.filter(l => l.type === 'prospeccion').length || 0,
      leads: { vendedor: 0, comprador: 0, locador: 0, locatario: 0 },
      channels: {} as Record<string, number>
    },
    prelisting: {
      volumen: perfLogs?.filter(l => l.type === 'prelisting').length || 0,
      pipeline: perfLogs?.filter(l => l.type === 'prelisting').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
    },
    prebuying: {
      volumen: perfLogs?.filter(l => l.type === 'prebuying').length || 0,
      poder: perfLogs?.filter(l => l.type === 'prebuying').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
    },
    captacion: {
      nuevas: perfLogs?.filter(l => l.type === 'captacion').length || 0,
      volumen: perfLogs?.filter(l => l.type === 'captacion').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
      exclusivas: perfLogs?.filter(l => l.type === 'captacion' && l.metadata?.condicion_captacion === 'Exclusiva').length || 0,
      honorarioTotal: perfLogs?.filter(l => l.type === 'captacion').reduce((acc, l) => acc + (Number(l.comision_generada) || 0), 0) || 0,
    },
    reserva: {
      volumen: perfLogs?.filter(l => l.type === 'reserva').length || 0,
      compromiso: perfLogs?.filter(l => l.type === 'reserva').reduce((acc, l) => acc + (Number(l.metadata?.monto_depositado) || 0), 0) || 0,
      gapSum: perfLogs?.filter(l => l.type === 'reserva').reduce((acc, l) => {
        const publicado = Number(l.metadata?.valor_publicacion_actual);
        const ofertado = Number(l.monto_operacion) || 0;
        if (publicado > 0) {
          return acc + ((ofertado - publicado) / publicado) * 100;
        }
        return acc;
      }, 0) || 0,
      // El GAP se promedia sólo entre las reservas que tienen precio publicado: dividir por
      // todas diluía el número con reservas que no aportaban nada a la suma.
      gapCount: perfLogs?.filter(l => l.type === 'reserva' && Number(l.metadata?.valor_publicacion_actual) > 0).length || 0,
    },
    cierre: {
      transacciones: transaccionesDe(perfLogs),
      // Una operación cuenta una sola vez, aunque la hayan cargado dos asesores
      // (uno por punta). Sumar fila por fila duplicaba la propiedad.
      volumenVentas: volumenDe(perfLogs),
      gci: gciDe(perfLogs),
      // Los mismos dos números abiertos por tipo de operación. Un alquiler y una
      // venta caían hasta acá en la misma bolsa; el dato para separarlos ya
      // estaba en `proceso`, sólo faltaba leerlo.
      desglose: desgloseDeCierres(perfLogs),
    },
    cartera: {
      activa: 0,
      volumen: 0,
      domSum: 0,
      domCount: 0
    }
  };

  // Process Prospeccion: antes leía metadata.tipo_lead (un campo que vivía
  // sólo en el formulario de Prospección); ahora ese dato lo absorbió
  // `proceso`, que existe en las seis etapas y es la fuente real.
  perfLogs?.filter(l => l.type === 'prospeccion').forEach(l => {
    const proceso = l.proceso;
    if (proceso === 'vendedor') metrics.prospeccion.leads.vendedor++;
    if (proceso === 'comprador') metrics.prospeccion.leads.comprador++;
    if (proceso === 'locador') metrics.prospeccion.leads.locador++;
    if (proceso === 'locatario') metrics.prospeccion.leads.locatario++;

    const origen = l.metadata?.origen || "Otro";
    metrics.prospeccion.channels[origen] = (metrics.prospeccion.channels[origen] || 0) + 1;
  });

  // ¿La propiedad es del asesor filtrado? Lista completa a propósito: si se filtra por un
  // asesor ya desvinculado (p. ej. un link guardado), su cartera tiene que seguir resolviéndose.
  const emailFiltrado = agentId ? todosLosAsesores?.find(prof => prof.id === agentId)?.email : null;
  const esDelAlcance = (p: any) => !agentId || (!!emailFiltrado && (p.assigned_agent as any)?.email === emailFiltrado);
  const ahora = Date.now();

  // Process Cartera (Tokko)
  properties.forEach(p => {
    if (!esDelAlcance(p)) return;
    metrics.cartera.activa++;
    // Sólo precios en dólares: sumar los pesos de un alquiler a los dólares de una venta no da nada.
    if (p.currency === 'USD') metrics.cartera.volumen += Number(p.price) || 0;
    // Días publicada: desde el alta en Tokko hasta hoy.
    const alta = p.alta ? Date.parse(p.alta) : NaN;
    if (!Number.isNaN(alta)) {
      metrics.cartera.domSum += (ahora - alta) / 86_400_000;
      metrics.cartera.domCount++;
    }
  });

  // Calculate Average Metrics
  const ticketPromedioTasacion = metrics.prelisting.volumen > 0 ? metrics.prelisting.pipeline / metrics.prelisting.volumen : 0;
  const ticketPromedioBusqueda = metrics.prebuying.volumen > 0 ? metrics.prebuying.poder / metrics.prebuying.volumen : 0;
  const hitRate = metrics.prelisting.volumen > 0 ? (metrics.captacion.nuevas / metrics.prelisting.volumen) * 100 : 0;
  const ratioExclusividad = metrics.captacion.nuevas > 0 ? (metrics.captacion.exclusivas / metrics.captacion.nuevas) * 100 : 0;
  // Honorario pactado ponderado por el valor de cada captación, mismo criterio que el Honorario
  // Real: un 2% sobre US$300.000 pesa más que un 5% sobre US$50.000. Si no hay montos
  // cargados, queda el promedio simple de los porcentajes.
  const capsConMonto = perfLogs.filter(l => l.type === 'captacion' && Number(l.monto_operacion) > 0);
  const montoCaps = capsConMonto.reduce((acc, l) => acc + Number(l.monto_operacion), 0);
  const honorarioPactado = montoCaps > 0
    ? capsConMonto.reduce((acc, l) => acc + Number(l.monto_operacion) * (Number(l.comision_generada) || 0), 0) / montoCaps
    : metrics.captacion.nuevas > 0 ? metrics.captacion.honorarioTotal / metrics.captacion.nuevas : 0;

  const tasaOferta = metrics.prebuying.volumen > 0 ? (metrics.reserva.volumen / metrics.prebuying.volumen) * 100 : 0;
  const gapNegociacion = metrics.reserva.gapCount > 0 ? metrics.reserva.gapSum / metrics.reserva.gapCount : 0;

  const tasaCierre = metrics.reserva.volumen > 0 ? (metrics.cierre.transacciones / metrics.reserva.volumen) * 100 : 0;
  // El honorario real es GCI ÷ volumen, no el promedio de los porcentajes de
  // cada fila. El promedio simple —que es lo que había acá— no pesa por el
  // tamaño de la operación: un 2% sobre US$159.000 y un 7% sobre US$40.000
  // promedian 4,5%, cuando lo realmente cobrado sobre lo vendido es 3,0%.
  // (Había además un `honorarioCobrado` con una fórmula a medio hacer y un
  // comentario "Wait, ..." al lado; nunca se usaba, porque los KPIs siempre
  // publicaron `honorarioReal`. Se fue con esto.)
  const honorarioReal = honorarioRealDe(perfLogs);

  // Global Efficiency
  const totalConsultas = metrics.prospeccion.waChats + metrics.prospeccion.active;
  const ratioConsultasCierres = metrics.cierre.transacciones > 0 ? totalConsultas / metrics.cierre.transacciones : 0;
  const tasaConversionGlobal = totalConsultas > 0 ? (metrics.cierre.transacciones / totalConsultas) * 100 : 0;

  // Final KPI Object
  const kpis = {
    // Top of Funnel
    waChats: metrics.prospeccion.waChats,
    prospeccionActiva: metrics.prospeccion.active,
    leadsVendedores: metrics.prospeccion.leads.vendedor,
    leadsCompradores: metrics.prospeccion.leads.comprador,
    leadsLocadores: metrics.prospeccion.leads.locador,
    leadsLocatarios: metrics.prospeccion.leads.locatario,
    channelDistribution: Object.entries(metrics.prospeccion.channels).map(([label, count]) => ({ label, count })),
    // Inicializado aqui para tipar la clave; se sobreescribe mas abajo con los valores reales
    responseTime: null as TiemposRespuesta | null,

    // Prelisting
    consultasWa: metrics.prospeccion.waChats,
    // `prelisting` es la vieja clave `tasaciones` renombrada: mismo dato (logs type='prelisting'),
    // nombre correcto. `acm` es la metrica nueva y va aparte.
    prelisting: metrics.prelisting.volumen,
    acm: acmTotal,
    pipelineCaptacion: metrics.prelisting.pipeline,
    ticketPromedioTasacion,
    
    // Prebuying
    compradores: metrics.prebuying.volumen,
    poderCompra: metrics.prebuying.poder,
    ticketPromedioBusqueda,
    
    // Captacion
    captaciones: metrics.captacion.nuevas,
    volumenInventario: metrics.captacion.volumen,
    hitRate,
    ratioExclusividad,
    honorarioPactado,
    
    // Reserva
    reservas: metrics.reserva.volumen,
    compromisoEconomico: metrics.reserva.compromiso,
    tasaOferta,
    gapNegociacion,
    
    // Cierre
    transacciones: metrics.cierre.transacciones,
    volumenVentas: metrics.cierre.volumenVentas,
    // Desglose venta / alquiler. `sinDefinir` son los cierres históricos que se
    // cargaron antes de que existiera `proceso`: la pantalla los muestra aparte
    // sólo cuando los hay, en vez de repartirlos a ojo entre los otros dos.
    cierresVenta: metrics.cierre.desglose.venta.transacciones,
    gciVenta: metrics.cierre.desglose.venta.gci,
    cierresAlquiler: metrics.cierre.desglose.alquiler.transacciones,
    gciAlquiler: metrics.cierre.desglose.alquiler.gci,
    cierresSinDefinir: metrics.cierre.desglose.sinDefinir.transacciones,
    gciSinDefinir: metrics.cierre.desglose.sinDefinir.gci,
    tasaCierre,
    honorarioCobrado: honorarioReal,
    gci: metrics.cierre.gci,
    // "Neto Asesores / Agency" se fue (15/9/2026): era un 50/50 fijo en el código y no existe
    // ninguna configuración del reparto. Decisión de Leonardo: sacarlo, no inventarlo.

    // Cartera
    carteraActiva: metrics.cartera.activa,
    volumenCartera: metrics.cartera.volumen,
    // Cierres del período sobre la cartera activa. Sin cartera no hay rotación que medir
    // (antes dividía por cero y la pantalla podía mostrar "NaN%").
    rotacion: metrics.cartera.activa > 0 ? (metrics.cierre.transacciones / metrics.cartera.activa) * 100 : 0,
    // Días que lleva publicada, en promedio, la cartera activa (alta en Tokko → hoy).
    // Antes era un 45 fijo escrito en el código.
    dom: metrics.cartera.domCount > 0 ? Math.round(metrics.cartera.domSum / metrics.cartera.domCount) : 0,
    
    // Global
    ratioConsultasCierres,
    tasaConversionGlobal,
    
    // Ratios específicos (Leads / Cierre)
    ratioWaCierre: metrics.cierre.transacciones > 0 ? metrics.prospeccion.waChats / metrics.cierre.transacciones : 0,
    ratioProspCierre: metrics.cierre.transacciones > 0 ? metrics.prospeccion.active / metrics.cierre.transacciones : 0,
    ratioTotalLeadsCierre: metrics.cierre.transacciones > 0 ? (metrics.prospeccion.waChats + metrics.prospeccion.active) / metrics.cierre.transacciones : 0,
  };

  // Re-calculate rotation using the better formula for global/leaderboard
  const advisorStats: Record<string, any> = {};
  agencyProfiles?.forEach(p => {
    const pLogs = perfLogs?.filter(l => l.agent_id === p.id) || [];
    const pProps = properties?.filter(prop => (prop.assigned_agent as any)?.email === p.email) || [];
    
    const waChats = waChatsCount && p.id === agentId ? waChatsCount : 0; // This is a bit tricky since waChatsCount is already filtered
    // Actually, waChatsCount at the top is already filtered by agentId if provided.
    // Let's do it better:
    
    const caps = pLogs.filter(l => l.type === 'captacion').length;
    const trans = transaccionesDe(pLogs);
    
    const prelisting = pLogs.filter(l => l.type === 'prelisting').length;
    const compradores = pLogs.filter(l => l.type === 'prebuying').length;
    const reservas = pLogs.filter(l => l.type === 'reserva').length;
    const prospeccion = pLogs.filter(l => l.type === 'prospeccion').length;
    
    // `properties` ya son sólo las activas (is_active). Filtrar por status 'Active' daba 0 siempre.
    const finalInv = pProps.length;
    const initialInv = Math.max(0, finalInv - caps + trans);
    const avgInv = (initialInv + finalInv) / 2;
    const rotacion = avgInv > 0 ? (trans / avgInv) * 100 : 0;

    advisorStats[p.id] = {
      id: p.id,
      name: p.full_name || "Asesor Sin Nombre",
      email: p.email,
      avatar_url: p.avatar_url,
      wa_chats: waCountsByAgent[p.id] || 0,
      prospeccion,
      prelisting,
      acm: acmByAgent[p.id] || 0,
      compradores,
      captaciones: caps,
      reservas,
      transacciones: trans,
      facturacion: pLogs.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const valor = Number(l.monto_operacion) || 0;
        const hon = Number(l.comision_generada) || 0;
        return acc + (valor * hon / 100);
      }, 0),
      cartera_activa: finalInv,
      rotacion: rotacion
    };
  });

  // AI Classification
  const { classifyAdvisor } = await import("@/lib/tracking/performance-evaluator");
  const { data: agency } = await supabase.from("agencies").select("performance_config").eq("id", agencyId).single();
  
  const advisors = await Promise.all(Object.values(advisorStats).map(async (stats: any) => {
    const classification = await classifyAdvisor(stats, agency?.performance_config);
    return {
      ...stats,
      classification: classification.category,
      classificationReason: classification.reason
    };
  }));

  // Evolution Data
  const months = [];
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  for (let i = 0; i < 6; i++) {
    // Día 1 de cada mes: con setMonth sobre un día 31 se salteaba un mes entero.
    const hoy = new Date();
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // Último instante del mes, para saber cuánta cartera había al cerrarlo.
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    months.push({ key, name: monthNames[d.getMonth()], fin });
  }

  const performanceEvolution = months.map(m => {
    const mLogs = perfLogs?.filter(l => {
        const date = new Date(l.fecha_actividad || l.created_at);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === m.key;
    }) || [];

    const mWaChats = (waCounts || []).filter(c => {
        const date = new Date(c.created_at);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === m.key;
    }).length;

    const mProspeccion = mLogs.filter(l => l.type === 'prospeccion').length;
    const mTransacciones = transaccionesDe(mLogs);

    // Cartera a fin de mes: dada de alta antes de que cierre el mes y, si hoy está dada de baja,
    // que la baja haya sido después. La fecha de baja de Tokko sólo vale para las inactivas:
    // las activas también la traen cargada (15/9/2026: las 349 activas de Central).
    const cartera = todasLasPropiedades.filter(p => {
      if (!esDelAlcance(p)) return false;
      const alta = p.alta ? Date.parse(p.alta) : NaN;
      if (Number.isNaN(alta) || alta > m.fin) return false;
      if (p.is_active) return true;
      const baja = p.baja ? Date.parse(p.baja) : NaN;
      return !Number.isNaN(baja) && baja > m.fin;
    }).length;

    return {
      name: m.name,
      cartera,
      rotacion: cartera > 0 ? (mTransacciones / cartera) * 100 : 0,
      captaciones: mLogs.filter(l => l.type === 'captacion').length,
      transacciones: mTransacciones,
      waChats: mWaChats,
      prospeccion: mProspeccion,
      ratioWaCierre: mTransacciones > 0 ? (mWaChats / mTransacciones) : 0,
      ratioProspCierre: mTransacciones > 0 ? (mProspeccion / mTransacciones) : 0,
      ratioTotalLeadsCierre: mTransacciones > 0 ? ((mWaChats + mProspeccion) / mTransacciones) : 0,
      effWaCierre: mWaChats > 0 ? (mTransacciones / mWaChats) * 100 : 0,
      effProspCierre: mProspeccion > 0 ? (mTransacciones / mProspeccion) * 100 : 0,
      effTotalCierre: (mWaChats + mProspeccion) > 0 ? (mTransacciones / (mWaChats + mProspeccion)) * 100 : 0,
      gci: mLogs.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const valor = Number(l.monto_operacion) || 0;
        const hon = Number(l.comision_generada) || 0;
        return acc + (valor * hon / 100);
      }, 0)
    };
  }).reverse();

  // 5. Tiempos de respuesta.
  // La base entrega como máximo 1.000 filas por consulta. Sin paginar, la tarjeta se calculaba
  // solo con los primeros días del período (15/9/2026: Central tenía 9.104 mensajes en 30 días
  // y la "1 h y pico" de la tarjeta salía de una sola respuesta).
  const PAGINA = 1000;
  const messages: any[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let msgQuery = supabase
      .from("wa_messages")
      .select("conversation_id, role, created_at, wa_conversations!inner(agent_id)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);

    if (agentId) msgQuery = msgQuery.eq("wa_conversations.agent_id", agentId);
    if (startDate) msgQuery = msgQuery.gte("created_at", startDate);
    // El filtro manda 'yyyy-MM-dd': sin extenderlo a fin de día se perdía el último día.
    if (endDate) msgQuery = msgQuery.lte("created_at", `${endDate}T23:59:59.999Z`);

    const { data, error } = await msgQuery;
    if (error || !data?.length) break;
    messages.push(...data);
    if (data.length < PAGINA) break;
  }

  const respTimes = {
    bot: { first: [] as number[], between: [] as number[] },
    human: { first: [] as number[], between: [] as number[] }
  };

  const convThreads: Record<string, any[]> = {};
  messages?.forEach((m: any) => {
    if (!convThreads[m.conversation_id]) convThreads[m.conversation_id] = [];
    convThreads[m.conversation_id].push(m);
  });

  Object.values(convThreads).forEach(thread => {
    let firstLeadMsgInConv: any = null;
    let pendingLeadMsg: any = null;
    let hasBotResponded = false;
    let hasHumanResponded = false;

    thread.forEach(m => {
      if (m.role === 'lead') {
        if (!firstLeadMsgInConv) firstLeadMsgInConv = m;
        if (!pendingLeadMsg) pendingLeadMsg = m;
      } else if (m.role === 'bot') {
        if (pendingLeadMsg) {
          const diff = new Date(m.created_at).getTime() - new Date(pendingLeadMsg.created_at).getTime();
          if (!hasBotResponded && pendingLeadMsg === firstLeadMsgInConv) {
            respTimes.bot.first.push(diff);
            hasBotResponded = true;
          } else {
            respTimes.bot.between.push(diff);
          }
          pendingLeadMsg = null;
        }
      } else if (m.role === 'human') {
        if (pendingLeadMsg) {
          const diff = new Date(m.created_at).getTime() - new Date(pendingLeadMsg.created_at).getTime();
          if (!hasHumanResponded && pendingLeadMsg === firstLeadMsgInConv) {
            respTimes.human.first.push(diff);
            hasHumanResponded = true;
          } else {
            respTimes.human.between.push(diff);
          }
          pendingLeadMsg = null;
        }
      }
    });
  });

  const calculateAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  // El promedio lo suben unas pocas esperas muy largas; la mediana muestra lo habitual.
  // Se muestran los dos porque cuentan cosas distintas (Central, 30 días: 10 h vs 1 h 34 m).
  const calculateMedian = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const formatDuration = (ms: number) => {
    if (ms <= 0) return "---";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ${min % 60}m`;
    return `${Math.floor(hr/24)}d ${hr%24}h`;
  };

  const tiempo = (arr: number[]): TiempoRespuesta => ({
    promedio: formatDuration(calculateAvg(arr)),
    mediana: formatDuration(calculateMedian(arr)),
    casos: arr.length,
  });

  kpis.responseTime = {
    botFirst: tiempo(respTimes.bot.first),
    botBetween: tiempo(respTimes.bot.between),
    humanFirst: tiempo(respTimes.human.first),
    humanBetween: tiempo(respTimes.human.between),
    desde: startDate,
    hasta: endDate,
  };

  return {
    kpis,
    charts: {
      performanceEvolution,
      channelDistribution: kpis.channelDistribution
    },
    advisors,
    activity: perfLogs?.slice(0, 10).map(l => ({
        ...l,
        // Lista completa: la actividad de un ex-asesor tiene que seguir
        // mostrando su nombre, no quedar huerfana.
        profiles: todosLosAsesores?.find(p => p.id === l.agent_id)
    })) || []
  }
}

// ------------------------------------ Pipeline Dashboard Data ------------------------------------
// Sólo lo generado en PRISMA: las conversaciones de WhatsApp y su etapa. Los leads que llegan
// sincronizados de Tokko NO entran (decisión de Leonardo, 15/9/2026): el "Cerrado" de Tokko es un
// contacto archivado, no una venta, y metía 1.077 "ganados" contra 1 solo cierre cargado en 2026.
// Solo agencia del director logueado. Nunca mezcla agencias.
export async function getPipelineDashboardData(agencyId: string) {
  const supabase = createClient()

  // De a tandas: Central ya tiene 2.340 conversaciones y la base corta en 1.000.
  const conversaciones = await todasLasFilas<{ pipeline_stage: string | null; funnel_status: string | null }>(
    (desde, hasta) =>
      supabase
        .from("wa_conversations")
        .select("pipeline_stage, funnel_status")
        .eq("agency_id", agencyId)
        .order("id", { ascending: true })
        .range(desde, hasta)
  )

  const STAGES = [
    "nuevo", "contacto", "calificado", "visita_agendada",
    "visita_realizada", "propuesta", "negociacion", "cerrado", "perdido",
  ] as const

  // Si el embudo ya la dio por ganada o perdida, esa es su etapa aunque pipeline_stage diga otra.
  const porEtapa: Record<string, number> = {}
  for (const row of conversaciones) {
    const stage = row.funnel_status === "closed_lost"
      ? "perdido"
      : row.funnel_status === "closed_won"
        ? "cerrado"
        : (row.pipeline_stage || "nuevo")
    porEtapa[stage] = (porEtapa[stage] || 0) + 1
  }

  const stages = STAGES.filter(s => porEtapa[s]).map(s => ({ id: s, total: porEtapa[s] }))

  const total = conversaciones.length
  const totalCerrado = porEtapa["cerrado"] || 0
  const totalPerdido = porEtapa["perdido"] || 0
  const tasaCierreReal = totalCerrado + totalPerdido > 0
    ? Math.round((totalCerrado / (totalCerrado + totalPerdido)) * 100)
    : null

  return {
    stages,
    summary: {
      total,
      total_activos: total - totalCerrado - totalPerdido,
      total_cerrado: totalCerrado,
      total_perdido: totalPerdido,
      tasa_cierre_real: tasaCierreReal,
    }
  }
}
