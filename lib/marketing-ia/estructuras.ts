import type { ConsciousnessLevel, EstructuraId } from "@/types/marketing-ia"

export interface BloqueEstructura {
  id: string;
  titulo: string;
  /** Qué tiene que lograr este bloque. Va literal al prompt. */
  guia: string;
}

export interface EstructuraGuion {
  id: EstructuraId;
  label: string;
  descripcion: string;
  /** Ayuda para el asesor en el selector. */
  cuando_usarla: string;
  bloques: BloqueEstructura[];
}

const CTA: BloqueEstructura = {
  id: "cta",
  titulo: "CTA",
  guia: "Cerrá con una sola acción concreta y fácil (escribir, mandar la dirección, pedir la tasación). Una sola, no tres.",
}

export const ESTRUCTURAS: Record<EstructuraId, EstructuraGuion> = {
  variante_1: {
    id: "variante_1",
    label: "Variante 1 — La oferta primero",
    descripcion: "Oferta · Problema · Solución · Prueba social · CTA",
    cuando_usarla: "Cuando el que mira ya sabe lo que necesita: abrís con lo que le ofrecés y filtrás rápido.",
    bloques: [
      { id: "oferta", titulo: "Oferta", guia: "Abrí con la oferta irresistible del asesor, dicha en una frase concreta y creíble. Sin vueltas ni presentación." },
      { id: "problema", titulo: "Problema", guia: "Nombrá el problema real que hoy tiene esa persona, con las palabras que usaría ella." },
      { id: "solucion", titulo: "Solución", guia: "Explicá cómo trabaja el asesor para resolverlo, apoyándote en sus datos duros reales." },
      { id: "prueba_social", titulo: "Prueba social", guia: "Traé un caso real o un número verificado del asesor que demuestre que ya lo hizo antes." },
      CTA,
    ],
  },
  variante_2: {
    id: "variante_2",
    label: "Variante 2 — Oferta y prueba social",
    descripcion: "Oferta · Prueba social · Problema · Solución · CTA",
    cuando_usarla: "Cuando la gente ya te conoce pero duda: la prueba arriba mata la desconfianza antes de que aparezca.",
    bloques: [
      { id: "oferta", titulo: "Oferta", guia: "Abrí con la oferta irresistible del asesor en una frase concreta y creíble." },
      { id: "prueba_social", titulo: "Prueba social", guia: "Respaldá esa oferta enseguida con un caso real o un número verificado del asesor." },
      { id: "problema", titulo: "Problema", guia: "Recién ahora nombrá el problema que sufre hoy esa persona." },
      { id: "solucion", titulo: "Solución", guia: "Mostrá el proceso del asesor que lo resuelve, con sus tiempos y sus datos reales." },
      CTA,
    ],
  },
  aida: {
    id: "aida",
    label: "AIDA — Atención, Interés, Deseo, Acción",
    descripcion: "Atención · Interés · Deseo · Acción",
    cuando_usarla: "El clásico para público que sabe que hay soluciones pero todavía no eligió con quién.",
    bloques: [
      { id: "atencion", titulo: "Atención", guia: "Frená el scroll con una afirmación concreta y verificable, nunca con una pregunta genérica." },
      { id: "interes", titulo: "Interés", guia: "Contá algo que esa persona no sabía y que le cambia la forma de ver su situación." },
      { id: "deseo", titulo: "Deseo", guia: "Pintá el resultado concreto que puede conseguir, usando la oferta y los números reales del asesor." },
      { ...CTA, titulo: "Acción (CTA)" },
    ],
  },
  pas: {
    id: "pas",
    label: "PAS — Problema, Agitación, Solución",
    descripcion: "Problema · Agitación · Solución · CTA",
    cuando_usarla: "Cuando la persona todavía no se dio cuenta del problema: hay que mostrárselo primero.",
    bloques: [
      { id: "problema", titulo: "Problema", guia: "Poné el dedo en la llaga con una situación que esa persona reconozca al toque." },
      { id: "agitacion", titulo: "Agitación", guia: "Mostrá qué le cuesta seguir así (plata, tiempo, oportunidades) sin dramatizar ni mentir." },
      { id: "solucion", titulo: "Solución", guia: "Presentá la oferta del asesor como la salida, sostenida en sus datos duros reales." },
      CTA,
    ],
  },
  bab: {
    id: "bab",
    label: "Antes – Después – Puente",
    descripcion: "Antes · Después · Puente · CTA",
    cuando_usarla: "Cuando ya siente el dolor y lo que necesita es ver que del otro lado hay algo mejor.",
    bloques: [
      { id: "antes", titulo: "Antes", guia: "Describí la situación de hoy, concreta y sin adornos." },
      { id: "despues", titulo: "Después", guia: "Describí cómo se vive el día después de resolverlo, con un resultado medible." },
      { id: "puente", titulo: "Puente", guia: "El puente entre las dos escenas es la oferta y el proceso real del asesor." },
      CTA,
    ],
  },
  storytelling: {
    id: "storytelling",
    label: "Caso real / Storytelling",
    descripcion: "Situación · Conflicto · Qué hicimos · Resultado · CTA",
    cuando_usarla: "Cuando tenés un caso real cargado: es el formato que más confianza genera a cámara.",
    bloques: [
      { id: "situacion", titulo: "Situación", guia: "Presentá el caso real del asesor: quién era, qué propiedad, en qué zona." },
      { id: "conflicto", titulo: "Conflicto", guia: "Contá qué estaba saliendo mal y qué había intentado antes sin éxito." },
      { id: "que_hicimos", titulo: "Qué hicimos", guia: "Contá el proceso concreto que aplicó el asesor, paso por paso, en criollo." },
      { id: "resultado", titulo: "Resultado", guia: "Cerrá el caso con el resultado real y medible. Nunca inventes el número." },
      CTA,
    ],
  },
}

export const ESTRUCTURAS_LISTA: EstructuraGuion[] = Object.values(ESTRUCTURAS)

/**
 * Estructura sugerida según el nivel de consciencia del IPC.
 * storytelling queda afuera a propósito: depende de que el asesor haya cargado un caso real.
 */
export function sugerirEstructura(nivel: ConsciousnessLevel): EstructuraId {
  const porNivel: Record<ConsciousnessLevel, EstructuraId> = {
    0: "pas",          // no sabe que tiene el problema: hay que crearlo
    1: "bab",          // ya siente el dolor: mostrarle el después
    2: "aida",         // sabe que hay soluciones: posicionar la nuestra
    3: "variante_2",   // nos conoce y duda: oferta + prueba social arriba
    4: "variante_1",   // está listo: oferta directa y CTA
  }
  return porNivel[nivel]
}

export function resolverEstructura(
  pedida: EstructuraId | "sugerida" | undefined | null,
  nivel: ConsciousnessLevel
): EstructuraId {
  if (pedida && pedida !== "sugerida" && pedida in ESTRUCTURAS) return pedida as EstructuraId
  return sugerirEstructura(nivel)
}

/** Lista numerada de los bloques, para explicarle la estructura al modelo. */
export function guiaBloquesParaPrompt(estructura: EstructuraGuion): string {
  return estructura.bloques
    .map((b, i) => `${i + 1}. ${b.titulo} — ${b.guia}`)
    .join("\n")
}

/** Esqueleto exacto del JSON que tiene que devolver el modelo para esta estructura. */
export function esquemaJsonGuion(estructura: EstructuraGuion): string {
  const bloques = estructura.bloques
    .map(
      (b) => `      {
        "id": "${b.id}",
        "titulo": "${b.titulo}",
        "texto": "lo que el asesor dice a camara en este bloque",
        "segundos": 8,
        "indicacion": "como decirlo: tono, ritmo, gesto",
        "por_que": "por que este bloque va aca (para que el asesor aprenda la formula)"
      }`
    )
    .join(",\n")
  return `{
    "hook": "la frase de los primeros 3 segundos",
    "bloques": [
${bloques}
    ]
  }`
}
