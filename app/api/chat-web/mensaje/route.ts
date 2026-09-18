/**
 * Chat web · El endpoint donde escribe el visitante del sitio.
 *
 * Es la ÚNICA dirección de PRISMA que atiende a cualquiera de internet, sin cuenta ni sesión.
 * El orden de los controles importa y es este:
 *   1. ¿De qué web viene? (Origin contra los dominios de la agencia). Sin eso, nada.
 *   2. ¿Está prendido el widget y quedan mensajes y presupuesto? (lib/chat-web/puerta.ts)
 *   3. ¿No está escribiendo a una velocidad imposible? (ritmo, contra los mensajes guardados)
 *   4. Recién ahí piensa el asistente.
 *
 * Nunca devuelve un error crudo al visitante: del otro lado hay alguien que quiere comprar o
 * vender una casa. Si algo se rompe, se le contesta y se lo invita a dejar su contacto.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateEmbedding } from "@/lib/gemini"
import { conversar, type Herramientas, type Mensaje } from "@/lib/chat-web/agente"
import { armarContexto, resumenParaElAgente } from "@/lib/chat-web/buscar"
import { buscarPaginas } from "@/lib/chat-web/almacen-supabase"
import { armarAvisoDerivacion, enviarDerivacionPorEmail, telefonoUsable, type ObjetivoDerivacion } from "@/lib/chat-web/derivar"
import { decidirAtencion, revisarOrigen, revisarProcedencia, type WidgetPublico } from "@/lib/chat-web/puerta"
import { derivarDentroDePrisma } from "@/lib/chat-web/derivar-a-prisma"
import { avisarPorWhatsApp } from "@/lib/chat-web/avisar-a-quien-atiende"
import { linkAlChat } from "@/lib/seguimiento/avisos"

export const maxDuration = 60

/** Lo que el visitante puede escribir de una vez. */
const MAX_TEXTO = 1000
/** Cuántos mensajes de ida y vuelta se le pasan al asistente como memoria. */
const MEMORIA = 16
/** Ritmo: más que esto en cinco minutos no es una persona conversando. */
const MAX_EN_5_MIN = 15

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com"

function cors(origin: string | null, permitido: boolean) {
  const h = new Headers({ "Content-Type": "application/json" })
  if (permitido && origin) {
    h.set("Access-Control-Allow-Origin", origin)
    h.set("Vary", "Origin")
    h.set("Access-Control-Allow-Headers", "Content-Type")
    h.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  }
  return h
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin")
  const { searchParams } = new URL(req.url)
  const widgetId = searchParams.get("widget")
  if (!origin || !widgetId) return new Response(null, { status: 403 })
  const db = createAdminClient()
  const { data: w } = await db.from("web_widgets").select("dominios").eq("id", widgetId).maybeSingle()
  const permitido = revisarOrigen(origin, (w?.dominios as string[]) ?? [])
  return new Response(null, { status: permitido ? 204 : 403, headers: cors(origin, permitido) })
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin")
  const db = createAdminClient()

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const widgetId = String(cuerpo.widgetId ?? "")
  const visitanteId = String(cuerpo.visitanteId ?? "").slice(0, 64)
  const texto = String(cuerpo.texto ?? "").trim().slice(0, MAX_TEXTO)
  const paginaOrigen = String(cuerpo.paginaOrigen ?? "").slice(0, 300)

  if (!widgetId || !visitanteId || !texto)
    return new NextResponse(JSON.stringify({ error: "Pedido incompleto." }), { status: 400, headers: cors(origin, false) })

  const { data: fila } = await db
    .from("web_widgets")
    .select("id, agency_id, activo, dominios, whatsapp_destino, email_destino, perfil_equipo_id, destinos_por_objetivo, secciones")
    .eq("id", widgetId)
    .maybeSingle()

  // 1. ¿De qué web viene? La ventana la sirve PRISMA, así que el pedido puede venir del sitio del
  // cliente (sin marco) o de nuestra propia ventana informando en qué página está puesta.
  // Sin poder saberlo, no se contesta NADA, ni siquiera que el widget existe.
  const procede = revisarProcedencia({
    origin,
    propio: new URL(req.url).origin,
    pagina: paginaOrigen,
    dominios: (fila?.dominios as string[]) ?? [],
  })
  if (!fila || !procede)
    return new NextResponse(JSON.stringify({ error: "No autorizado." }), { status: 403, headers: cors(origin, false) })

  const widget: WidgetPublico = {
    id: fila.id as string,
    agency_id: fila.agency_id as string,
    activo: fila.activo as boolean,
    dominios: fila.dominios as string[],
    whatsapp_destino: (fila.whatsapp_destino as string | null) ?? null,
  }
  const cabeceras = cors(origin, true)

  // La conversación de este visitante (una por widget + visitante).
  const { data: existente } = await db
    .from("web_conversaciones")
    .select("id, datos, objetivo, mensajes_count, costo_usd, estado")
    .eq("widget_id", widget.id)
    .eq("visitante_id", visitanteId)
    .maybeSingle()

  let conversacionId = existente?.id as string | undefined
  if (!conversacionId) {
    const { data: nueva, error } = await db
      .from("web_conversaciones")
      .insert({ widget_id: widget.id, agency_id: widget.agency_id, visitante_id: visitanteId, pagina_origen: paginaOrigen })
      .select("id")
      .single()
    if (error || !nueva)
      return new NextResponse(JSON.stringify({ texto: "Ahora no puedo atenderte. Probá de nuevo en un rato." }), {
        status: 200, headers: cabeceras,
      })
    conversacionId = nueva.id as string
  }

  const guardarMensaje = (rol: "visitante" | "asistente" | "sistema", t: string, extra: Record<string, unknown> = {}) =>
    db.from("web_mensajes").insert({ conversacion_id: conversacionId, agency_id: widget.agency_id, rol, texto: t, ...extra })

  await guardarMensaje("visitante", texto)

  // 2. ¿Se puede atender? (prendido, mensajes, plata)
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: delDia } = await db
    .from("web_conversaciones")
    .select("costo_usd")
    .eq("agency_id", widget.agency_id)
    .gte("last_message_at", `${hoy}T00:00:00Z`)
  const gastoDelDiaUSD = (delDia ?? []).reduce((suma, c) => suma + Number(c.costo_usd ?? 0), 0)

  const atencion = decidirAtencion({
    widget,
    conversacion: {
      mensajes: Number(existente?.mensajes_count ?? 0),
      costoUSD: Number(existente?.costo_usd ?? 0),
    },
    gastoDelDiaUSD,
  })

  const contestar = async (
    respuesta: string,
    extra: { pasos?: unknown; costo_usd?: number; actualizacion?: Record<string, unknown> } = {}
  ) => {
    // `actualizacion` es de la conversación, NO del mensaje: si se cuela acá, el insert falla
    // por una columna que no existe y el visitante se queda sin respuesta.
    const { actualizacion, ...camposDelMensaje } = extra
    await guardarMensaje("asistente", respuesta, camposDelMensaje as Record<string, unknown>)
    await db
      .from("web_conversaciones")
      .update({
        mensajes_count: Number(existente?.mensajes_count ?? 0) + 2,
        last_message_at: new Date().toISOString(),
        ...(actualizacion ?? {}),
      })
      .eq("id", conversacionId)
    return new NextResponse(JSON.stringify({ texto: respuesta }), { status: 200, headers: cabeceras })
  }

  if (!atencion.ok) return contestar(atencion.paraElVisitante)

  // 3. Ritmo: más de 15 mensajes en cinco minutos no es una persona conversando.
  const hace5min = new Date(Date.now() - 5 * 60_000).toISOString()
  const { count } = await db
    .from("web_mensajes")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", conversacionId)
    .gte("created_at", hace5min)
  if ((count ?? 0) > MAX_EN_5_MIN)
    return contestar("Vamos un poquito más despacio así te puedo ayudar bien. ¿Qué estabas necesitando?")

  // La conversación hasta acá, para que el asistente tenga memoria.
  const { data: historia } = await db
    .from("web_mensajes")
    .select("rol, texto")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .limit(MEMORIA)
  const mensajes: Mensaje[] = (historia ?? [])
    .reverse()
    .filter((m) => m.rol === "visitante" || m.rol === "asistente")
    .map((m) => ({ rol: m.rol as "visitante" | "asistente", texto: m.texto as string }))

  // Las herramientas de verdad.
  const datosAcumulados: Record<string, string> = { ...((existente?.datos as Record<string, string>) ?? {}) }
  let pidioDerivar = null as string | null

  const herramientas: Herramientas = {
    buscar_en_el_sitio: async ({ consulta }) => {
      try {
        const vector = await generateEmbedding(String(consulta ?? "").slice(0, 400), "RETRIEVAL_QUERY")
        const r = await buscarPaginas(widget.id, vector, 4)
        return {
          texto: `${resumenParaElAgente(r)}\n\n${armarContexto(r.paginas, 2500)}`.trim(),
          links: r.paginas.map((p) => p.url),
        }
      } catch {
        return { texto: "No pude buscar en el sitio ahora. No afirmes que la información no existe.", links: [] }
      }
    },

    buscar_propiedades: async (input) => {
      const zona = String(input.zona ?? "").trim()
      let q = db
        .from("properties")
        .select("title, property_type, bedrooms, price, currency, address, city")
        .eq("agency_id", widget.agency_id)
        .eq("is_active", true)
        .limit(5)
      if (zona) q = q.ilike("city", `%${zona}%`)
      const { data, error } = await q
      if (error) return { texto: "No pude mirar la cartera ahora.", links: [] }
      if (!data?.length)
        return {
          texto: "No hay propiedades cargadas que coincidan con eso. Decilo y ofrecé que alguien del equipo lo busque.",
          links: [],
        }
      const lista = data
        .map(
          (p) =>
            `- ${p.title ?? p.property_type ?? "Propiedad"}${p.bedrooms ? `, ${p.bedrooms} amb` : ""}${
              p.price ? `, ${p.currency ?? ""} ${p.price}` : ""
            }${p.city ? ` — ${p.city}` : ""}`
        )
        .join("\n")
      return { texto: `Propiedades de la cartera (DATOS, sin links: no pases direcciones web):\n${lista}`, links: [] }
    },

    guardar_datos: async (input) => {
      for (const campo of ["nombre", "telefono", "email", "zona", "presupuesto", "detalle"]) {
        const v = String(input[campo] ?? "").trim()
        if (v) datosAcumulados[campo] = v.slice(0, 200)
      }
      return { texto: "Datos guardados.", links: [] }
    },

    derivar_a_whatsapp: async ({ resumen }) => {
      pidioDerivar = String(resumen ?? "").slice(0, 600)
      return { texto: "Listo: el equipo ya tiene los datos y te van a escribir.", links: [] }
    },
  }

  const { data: agencia } = await db.from("agencies").select("name").eq("id", widget.agency_id).maybeSingle()
  const { data: ajustes } = await db
    .from("whatsapp_ai_settings")
    .select("bot_name, knowledge_text")
    .eq("agency_id", widget.agency_id)
    .maybeSingle()

  let resultado
  try {
    resultado = await conversar({
      mensajes,
      contexto: {
        nombreAgencia: (agencia?.name as string) ?? "la inmobiliaria",
        nombreBot: (ajustes?.bot_name as string) ?? "el asistente",
        secciones: ((fila.secciones as Array<{ nombre: string; url: string; resumen: string }>) ?? []),
        conocimiento: (ajustes?.knowledge_text as string) ?? "",
        paginaActual: paginaOrigen,
      },
      herramientas,
    })
  } catch (e) {
    console.error("[chat-web] conversar:", e instanceof Error ? e.message : e)
    return contestar(
      "Perdoname, se me trabó el sistema. Dejame tu teléfono o tu email y te contacta alguien del equipo."
    )
  }

  // Lo que el asistente haya sacado en limpio se suma a la ficha.
  for (const [k, v] of Object.entries(resultado.respuesta.datos ?? {})) if (v) datosAcumulados[k] = String(v).slice(0, 200)

  const actualizacion: Record<string, unknown> = {
    datos: datosAcumulados,
    objetivo: resultado.respuesta.objetivo,
    costo_usd: Number(existente?.costo_usd ?? 0) + resultado.costoUSD,
  }

  // La derivación. A dónde va depende del REPARTO que cargó el director (Leonardo, 17/9):
  // cada tipo de consulta tiene un solo destino, el contacto de afuera o el asesor de PRISMA.
  if (pidioDerivar) {
    const objetivo = resultado.respuesta.objetivo as ObjetivoDerivacion
    const ruteo = (fila.destinos_por_objetivo as Record<string, string>) ?? {}
    const nombreAgencia = (agencia?.name as string) ?? "la inmobiliaria"
    const telefono = telefonoUsable(datosAcumulados.telefono)
    const perfilId = fila.perfil_equipo_id as string | null

    // El asesor elegido tiene que seguir activo: si se desvinculó, el lead vuelve al contacto de
    // afuera en vez de ir a alguien que ya no está.
    let asesor: { id: string; nombre: string; email: string | null; telefono: string | null } | null = null
    if (ruteo[objetivo] === "asesor" && perfilId) {
      const { data } = await db
        .from("profiles")
        .select("id, full_name, email, phone, estado, deleted_at")
        .eq("id", perfilId)
        .maybeSingle()
      if (data && data.estado === "activo" && !data.deleted_at)
        asesor = {
          id: data.id as string,
          nombre: (data.full_name as string | null) ?? "",
          email: (data.email as string | null) ?? null,
          telefono: (data.phone as string | null) ?? null,
        }
    }

    // Si le toca al asesor, la conversación se abre DENTRO de PRISMA: se le escribe al visitante
    // con la plantilla aprobada y el chat queda en su bandeja.
    let chatEnPrisma: string | undefined
    let dentro: Awaited<ReturnType<typeof derivarDentroDePrisma>> | null = null
    if (asesor && telefono) {
      try {
        dentro = await derivarDentroDePrisma(db, {
          agencyId: widget.agency_id,
          perfilId: asesor.id,
          telefono,
          nombre: datosAcumulados.nombre ?? "",
          deQueConsulto: pidioDerivar.slice(0, 180),
        })
        if (dentro.conversationId)
          chatEnPrisma = linkAlChat({ role: "asesor" }, dentro.conversationId, appUrl())
      } catch (e) {
        console.error("[chat-web] derivarDentroDePrisma:", e instanceof Error ? e.message : e)
      }
    }

    const aviso = armarAvisoDerivacion({
      nombreAgencia,
      nombreBot: (ajustes?.bot_name as string) ?? "el asistente",
      objetivo,
      resumen: pidioDerivar,
      datos: datosAcumulados,
      paginaOrigen,
      chatEnPrisma,
    })

    // A quién se le avisa: al asesor si le tocaba a él; si no tiene email (o no le tocaba), al
    // contacto principal. Nunca a los dos, para no duplicar; nunca a nadie, tampoco.
    const para: Array<string | null | undefined> = asesor?.email
      ? [asesor.email]
      : [fila.email_destino as string | null]
    const envio = await enviarDerivacionPorEmail({ aviso, para, nombreAgencia })

    // Y el aviso que SUENA: un email se lee tarde y este contacto se enfria en minutos
    // (Leonardo, 17/9). Va a una sola persona, la que le toca, con el link donde seguir.
    const avisoWa = await avisarPorWhatsApp(db, {
      agencyId: widget.agency_id,
      telefonoDestino: asesor ? asesor.telefono : widget.whatsapp_destino,
      nombreDestino: asesor ? asesor.nombre : "",
      objetivo,
      datos: datosAcumulados,
      detalle: pidioDerivar,
      // Al asesor, el chat DENTRO de PRISMA; al contacto de afuera, el WhatsApp del visitante.
      link: chatEnPrisma ?? aviso.linkWhatsApp,
    })

    await guardarMensaje("sistema", `Derivado al equipo: ${aviso.asunto}`, {
      pasos: [
        {
          herramienta: "derivar_a_whatsapp",
          destino: asesor ? `prisma:${asesor.id}` : widget.whatsapp_destino ?? "externo",
          telefono,
          email: envio.resultado,
          email_id: envio.id,
          whatsapp: avisoWa.resultado,
          whatsapp_wamid: avisoWa.wamid,
          // Qué pasó del lado de PRISMA: el chat, si quedó asignado, y si la plantilla salió.
          chat_prisma: dentro?.conversationId ?? null,
          asignado: dentro?.asignado ?? null,
          ya_era_de: dentro?.yaEraDe ?? null,
          plantilla: dentro?.plantilla ?? null,
        },
      ],
    })
    actualizacion.estado = "derivada"
    actualizacion.derivada_en = new Date().toISOString()
    actualizacion.derivada_a = asesor ? `prisma:${asesor.id}` : widget.whatsapp_destino ?? null
  }

  return contestar(resultado.respuesta.texto, {
    pasos: resultado.pasos,
    costo_usd: resultado.costoUSD,
    actualizacion,
  })
}
