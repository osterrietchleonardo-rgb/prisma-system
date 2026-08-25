import type { SupabaseClient } from "@supabase/supabase-js"
import type { Candidato } from "./tipos"

/** Contrato de las herramientas del agente. TODAS de solo lectura. Inyectable para test. */
export interface Herramientas {
  leer_mensajes(input: { cantidad?: number }): Promise<string>
  leer_intentos_previos(input: Record<string, never>): Promise<string>
  leer_compromisos(input: Record<string, never>): Promise<string>
  leer_propiedad(input: { busqueda: string }): Promise<string>
}

/** Columnas reales de properties (verificadas 24/8, Task 1). `status` es la OPERACIÓN
 *  (Venta/Alquiler); la disponibilidad es `is_active`. `notas_ia` es jsonb. */
const COLUMNAS_PROPIEDAD = "id, title, address, city, status, is_active, price, currency, notas_ia"

/** Fecha y hora en Argentina, "2026-08-16 13:58". El agente razona en hora local: mostrarle
 *  UTC lo hacía decir "respondió tarde el 31/07 01:34" cuando fue el 30/7 a las 22:34 AR. */
const FECHA_HORA_AR = (d: string) =>
  new Date(d).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16)

export function crearHerramientas(db: SupabaseClient, c: Candidato): Herramientas {
  return {
    async leer_mensajes({ cantidad = 10 }) {
      const n = Math.min(Math.max(cantidad, 1), 50)
      const { data, error } = await db
        .from("wa_messages")
        .select("role, content, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(n)
      if (error) return `error leyendo mensajes: ${error.message}`
      if (!data?.length) return "(no hay mensajes en esta conversación)"
      return (
        "(horas en Argentina)\n" +
        [...data]
          .reverse()
          .map((m) => `[${FECHA_HORA_AR(String(m.created_at))}] [${m.role}] ${String(m.content).slice(0, 400)}`)
          .join("\n")
      )
    },

    async leer_intentos_previos() {
      const { data, error } = await db
        .from("seguimiento_decisiones")
        .select("plantilla, razon, creado_en, resultado, ejecutada")
        .eq("conversation_id", c.id)
        .eq("accion", "contactar")
        .order("creado_en", { ascending: false })
        .limit(8)
      if (error) return `error leyendo intentos: ${error.message}`
      // Solo lo EJECUTADO cuenta como intento: en sombra el agente decide sin enviar, y si
      // viera esas decisiones como intentos creería que ya mandó el breakup (pasó el 25/8).
      const fmt = (i: { creado_en: string; plantilla: string | null; razon: string; resultado: string | null }) =>
        `- ${FECHA_HORA_AR(String(i.creado_en)).slice(0, 10)}: ${i.plantilla ?? "sin plantilla"} — ${i.razon}` +
        (i.resultado ? ` [${i.resultado}]` : "")
      const enviados = (data ?? []).filter((i) => i.ejecutada)
      const sombra = (data ?? []).filter((i) => !i.ejecutada)
      const partes = [
        enviados.length
          ? `INTENTOS ENVIADOS por el agente:\n${enviados.map(fmt).join("\n")}`
          : "INTENTOS ENVIADOS por el agente: ninguno (los seguimientos viejos, si los hubo, están en los mensajes como [bot])",
      ]
      if (sombra.length)
        partes.push(
          `Decisiones previas en SOMBRA (NO se enviaron, el lead NO las recibió — no las cuentes como intentos; solo evitá repetir el ángulo):\n${sombra.slice(0, 3).map(fmt).join("\n")}`
        )
      return partes.join("\n")
    },

    async leer_compromisos() {
      const { data, error } = await db
        .from("compromisos")
        .select("tipo, descripcion, asumido_por, vence_en")
        .eq("conversation_id", c.id)
        .eq("estado", "activo")
      if (error) return `error leyendo compromisos: ${error.message}`
      if (!data?.length) return "(sin compromisos activos)"
      return data
        .map(
          (k) =>
            `- [${k.tipo}] ${k.descripcion} (asumido por ${k.asumido_por}${k.vence_en ? `, vence ${k.vence_en}` : ""})`
        )
        .join("\n")
    },

    async leer_propiedad({ busqueda }) {
      // PostgREST parsea el filtro .or con comas y paréntesis: se sanean del input
      const q = busqueda.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
      if (!q) return "búsqueda vacía: pasá una dirección, barrio o parte del título"
      // city va en el OR: las direcciones platenses son "133 entre 45 y 46" y el
      // barrio/ciudad vive en city (verificado 24/8: sin city, "La Plata" no matchea)
      const { data, error } = await db
        .from("properties")
        .select(COLUMNAS_PROPIEDAD)
        .eq("agency_id", c.agency_id)
        .or(`address.ilike.%${q}%,title.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(3)
      if (error) return `error consultando propiedades: ${error.message}`
      if (!data?.length)
        return (
          `NO se encontró ninguna propiedad de la agencia que coincida con «${q}». ` +
          `No la menciones como disponible en el mensaje.`
        )
      return data
        .map((p: Record<string, unknown>) =>
          [
            `• ${p.title ?? p.address} — ${p.address ?? ""}, ${p.city ?? ""} (${p.status ?? "?"})` +
              (p.is_active ? "" : " ⚠️ NO DISPONIBLE: no la ofrezcas"),
            `  precio: ${p.price ?? "?"} ${p.currency ?? ""}`,
            p.notas_ia ? `  notas del asesor: ${JSON.stringify(p.notas_ia).slice(0, 200)}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n")
    },
  }
}
