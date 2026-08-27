import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { calcularScore } from "@/lib/seguimiento/prioridad"
import { decidirConAgente, estimarCostoUSD } from "@/lib/seguimiento/agente"
import { crearHerramientas } from "@/lib/seguimiento/herramientas"
import { renderizarSemilla } from "@/lib/seguimiento/semilla"
import { registrarEvento } from "@/lib/seguimiento/eventos"
import { sincronizarCompromisos, crearCompromisoEscalar } from "@/lib/seguimiento/compromisos"
import { avisarPorEscalar } from "@/lib/seguimiento/avisos"
import { aplicarSinEnvio, ejecutarDecision } from "@/lib/seguimiento/ejecutor"
import { plantillaDesdeFila, type PlantillaDisponible } from "@/lib/seguimiento/plantillas"
import type { Candidato, CompromisoActivo, ConfigAgencia } from "@/lib/seguimiento/tipos"

export const maxDuration = 300
// 200 y no 40: la Capa 1 ordena por next_follow_up_at y el dedupe saca los ya decididos.
// Con 40, una vez decididos los primeros 40 la cola quedaba vacía y el resto del backlog
// nunca entraba (la noche del 24/8: 15 corridas con 0 leads y 50 candidatos sin decidir).
const MAX_CANDIDATOS = 200
const MAX_LLM = 8 // solo los mejores llegan al agente; el resto, próxima corrida
// 200 s y no 240: el freno solo evita EMPEZAR leads nuevos; un lead arrancado a los 239 s
// terminaba a los 271 s (corrida de las 15:30 del 25/8), a 29 s del timeout de Vercel.
const DEADLINE_MS = 200_000
const DEDUPE_HORAS = 20 // no re-decidir un lead ya decidido hace poco
const TOPE_COSTO_USD = 0.1 // acordado con Leonardo el 25/8: por encima se registra alerta

export async function POST(req: Request) {
  if (req.headers.get("x-api-key") !== process.env.SEGUIMIENTO_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (process.env.SEGUIMIENTO_MODO === "apagado")
    // kill-switch global
    return NextResponse.json({ skipped: "kill_switch_global" })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { tarea = "seguimiento" } = await req.json().catch(() => ({}))
  // El dispatch es un endpoint propio: se le pega al MISMO servidor que corre esto (preview o prod)
  const origen = new URL(req.url).origin
  if (tarea !== "seguimiento")
    return NextResponse.json({ error: `tarea desconocida: ${tarea}` }, { status: 400 })
  // Task 16 suma "visitas"; Task 19 suma "escalamiento"

  // ── Task 13: vencer lo vencido y crear los compromisos de visita que falten ──
  await sincronizarCompromisos(db)

  // ── Capa 1: elegibilidad en SQL ──
  const { data: candidatos, error } = await db.rpc("seguimiento_candidatos", {
    p_limit: MAX_CANDIDATOS,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: configs } = await db.from("seguimiento_config").select("*")
  const configPorAgencia = new Map<string, ConfigAgencia>(
    (configs ?? []).map((c) => [c.agency_id, c])
  )
  const { data: agencias } = await db.from("agencies").select("id, name")
  const nombreAgencia = new Map<string, string>((agencias ?? []).map((a) => [a.id, a.name ?? "PRISMA"]))

  // ── Capa 2: puntuar, ordenar ──
  const puntuados = await Promise.all(
    ((candidatos as Candidato[]) ?? []).map(async (c) => {
      const { data: comps } = await db
        .from("compromisos")
        .select("tipo, descripcion, asumido_por, vence_en")
        .eq("conversation_id", c.id)
        .eq("estado", "activo")
      const compromisos = (comps ?? []) as CompromisoActivo[]
      return { c, compromisos, score: calcularScore(c, compromisos) }
    })
  )
  puntuados.sort((a, b) => b.score - a.score)

  // ── Dedupe: fuera los leads con decisión reciente (clave en sombra) ──
  const idsPuntuados = puntuados.map((x) => x.c.id)
  const { data: recientes } = await db
    .from("seguimiento_decisiones")
    .select("conversation_id")
    .in("conversation_id", idsPuntuados)
    .gte("creado_en", new Date(Date.now() - DEDUPE_HORAS * 3600e3).toISOString())
  const yaDecididos = new Set((recientes ?? []).map((r) => r.conversation_id))
  const cola = puntuados.filter((x) => !yaDecididos.has(x.c.id)).slice(0, MAX_LLM)

  // ── Plantillas de seguimiento APROBADAS por agencia (el agente solo elige entre estas) ──
  const { data: filasPlantillas } = await db
    .from("wa_templates")
    .select("agency_id, template_name, components")
    .eq("status", "APPROVED")
    .like("template_name", "%\\_seg\\_%")
  const plantillasPorAgencia = new Map<string, PlantillaDisponible[]>()
  for (const f of filasPlantillas ?? []) {
    const p = plantillaDesdeFila(f)
    if (!p) continue
    plantillasPorAgencia.set(f.agency_id, [...(plantillasPorAgencia.get(f.agency_id) ?? []), p])
  }

  // ── Capa 3: el agente decide, uno por uno (secuencial: previsible) ──
  const inicio = Date.now()
  const resultados: Array<{ conversation_id: string; accion: string; razon: string; aviso?: string; resultado?: string }> = []
  for (const { c, compromisos, score } of cola) {
    if (Date.now() - inicio > DEADLINE_MS) break // lo que queda espera la próxima corrida
    const config = configPorAgencia.get(c.agency_id)
    if (!config || config.modo === "apagado") continue

    const ahoraISO = new Date().toLocaleString("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
    const { data: contacto } = await db
      .from("wa_contacts")
      .select("clasificacion")
      .eq("agency_id", c.agency_id)
      .eq("phone", c.contact_phone)
      .maybeSingle()
    const disponibles = plantillasPorAgencia.get(c.agency_id) ?? []
    const semilla = renderizarSemilla(
      c,
      score,
      compromisos.length,
      ahoraISO,
      contacto?.clasificacion ?? null,
      disponibles
    )
    const herramientas = crearHerramientas(db, c)

    try {
      const { decision, pasos, tokens } = await decidirConAgente(semilla, herramientas)
      // la plantilla elegida tiene que existir aprobada en ESTA agencia; si no, queda bloqueada
      const plantillaValida = !decision.plantilla || disponibles.some((p) => p.nombre === decision.plantilla)
      const { data: fila } = await db
        .from("seguimiento_decisiones")
        .insert({
          agency_id: c.agency_id,
          conversation_id: c.id,
          modo: config.modo,
          canal: "whatsapp", // fase 1: único canal; la columna existe para las fases 2+
          accion: decision.accion,
          plantilla: decision.plantilla,
          frase_cierre: decision.frase_cierre,
          proximo_intento_horas: decision.proximo_intento_horas,
          razon: decision.razon,
          confianza: decision.confianza,
          score,
          contexto_snapshot: { pasos, tokens, metricas: c.metricas }, // el trace: qué miró
          decision_cruda: decision, // incluye la evidencia
          ejecutada: false,
          resultado: plantillaValida ? null : "bloqueada_plantilla_no_disponible",
          costo_usd: estimarCostoUSD(tokens),
        })
        .select("id")
        .single()
      await registrarEvento(
        db,
        c.agency_id,
        c.id,
        "decision",
        `[${config.modo}] ${decision.accion}: ${decision.razon}`,
        { score, confianza: decision.confianza, herramientas: pasos.map((p) => p.herramienta) }
      )
      resultados.push({ conversation_id: c.id, accion: decision.accion, razon: decision.razon })
      const costo = estimarCostoUSD(tokens)
      if (costo > TOPE_COSTO_USD)
        await registrarEvento(db, c.agency_id, c.id, "costo_alto",
          `Decisión por encima del tope: US$${costo.toFixed(4)} (tope ${TOPE_COSTO_USD})`, { tokens })
      // ── Task 14: escalar ⇒ el asesor asume "respuesta_pendiente" (24 h) y se le avisa en
      //    el mismo acto (email + WhatsApp si tiene celular). En sombra: compromiso sí,
      //    aviso simulado (queda registrado a quién habría ido).
      if (decision.accion === "escalar") {
        const comp = await crearCompromisoEscalar(db, c, decision.razon, fila?.id ?? null)
        if (comp === "creado")
          await registrarEvento(db, c.agency_id, c.id, "compromiso_creado",
            `El asesor asume responder en 24 h: ${decision.razon}`, { decision_id: fila?.id ?? null })
        const aviso = await avisarPorEscalar(db, c, decision, config, fila?.id ?? null,
          nombreAgencia.get(c.agency_id) ?? "PRISMA")
        resultados[resultados.length - 1].aviso = aviso
      }
      // ── Task 15: SOLO en modo activo se ejecuta. Contactar (y el mensaje empático de una
      //    escalada) pasan por el ejecutor con todos los guardrails; posponer/abandonar solo
      //    mueven el estado. En sombra, nada de esto corre: la decisión queda registrada.
      if (config.modo === "activo" && fila?.id && plantillaValida) {
        try {
          if (decision.accion === "contactar" || (decision.accion === "escalar" && decision.plantilla)) {
            const r = await ejecutarDecision(db, decision, c, config, fila.id, {
              origen,
              dispatchSecret: process.env.DISPATCH_SECRET,
              bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            })
            resultados[resultados.length - 1].resultado = r.resultado
          } else if (decision.accion === "posponer" || decision.accion === "abandonar") {
            resultados[resultados.length - 1].resultado = await aplicarSinEnvio(db, decision, c, fila.id)
          }
        } catch (e) {
          await registrarEvento(db, c.agency_id, c.id, "error", `ejecutor falló: ${String(e).slice(0, 200)}`)
          await db.from("seguimiento_decisiones").update({ resultado: `error_${String(e).slice(0, 60)}` }).eq("id", fila.id)
        }
      }
    } catch (e) {
      // Degradación elegante: si el agente falla, NO se manda nada y se registra
      await registrarEvento(db, c.agency_id, c.id, "error", `agente falló: ${String(e).slice(0, 200)}`)
    }
  }

  return NextResponse.json({ procesados: cola.length, decisiones: resultados })
}
