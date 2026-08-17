import type { PerfilOperacion, CaptacionOperacion, VentaOperacion } from "@/types/marketing-ia"

export interface CampoOperacion {
  /** Clave dentro del jsonb. */
  name: string;
  /** La pregunta tal cual la lee el asesor. */
  label: string;
  /** Ejemplo dentro del input. */
  placeholder: string;
  /** Etiqueta corta para el prompt (sin signos de pregunta). */
  etiquetaPrompt: string;
  /** true = textarea, false = input de una línea. */
  multilinea: boolean;
}

export const CAMPOS_PERFIL: CampoOperacion[] = [
  { name: "anios_experiencia", label: "¿Cuántos años hace que trabajás en el rubro?", placeholder: "Ej: 8 años", etiquetaPrompt: "Años de experiencia", multilinea: false },
  { name: "matricula", label: "Matrícula o colegio (si corresponde)", placeholder: "Ej: CUCICBA 1234", etiquetaPrompt: "Matrícula", multilinea: false },
  { name: "zona_dominio", label: "¿En qué zona conocés cada cuadra?", placeholder: "Ej: Caballito, Flores y Almagro", etiquetaPrompt: "Zona que domina", multilinea: false },
  { name: "especialidad", label: "¿En qué te especializás?", placeholder: "Ej: departamentos usados de 2 y 3 ambientes", etiquetaPrompt: "Especialidad", multilinea: false },
  { name: "operaciones_cerradas", label: "¿Cuántas operaciones cerraste en tu carrera?", placeholder: "Ej: más de 300", etiquetaPrompt: "Operaciones cerradas en su carrera", multilinea: false },
  { name: "casos_reales", label: "Contá 2 o 3 casos reales: zona, qué pasó y con qué resultado", placeholder: "Ej: Un PH en Flores que estaba publicado hacía 11 meses; lo republicamos con fotos nuevas y precio corregido, y se vendió en 34 días al 96% del pedido.", etiquetaPrompt: "Casos reales (prueba social)", multilinea: true },
  { name: "servicio_incluye", label: "¿Qué incluye tu servicio?", placeholder: "Ej: fotos y video profesionales, ACM escrito, publicación en 6 portales, visitas acompañadas, negociación y acompañamiento hasta la escritura.", etiquetaPrompt: "Qué incluye el servicio", multilinea: true },
  { name: "no_prometer", label: "¿Qué NO se puede prometer nunca en tus anuncios?", placeholder: "Ej: no prometer un plazo exacto de venta ni un precio garantizado.", etiquetaPrompt: "PROHIBIDO PROMETER", multilinea: true },
]

export const CAMPOS_CAPTACION: CampoOperacion[] = [
  { name: "propiedades_vendidas_6m", label: "En los últimos 6 meses, ¿cuántas propiedades vendiste?", placeholder: "Ej: 14", etiquetaPrompt: "Propiedades vendidas en los últimos 6 meses", multilinea: false },
  { name: "porcentaje_acm", label: "¿A qué porcentaje promedio del valor de tu ACM se terminaron cerrando?", placeholder: "Ej: 96% del valor del ACM", etiquetaPrompt: "Porcentaje promedio del ACM al que cierra", multilinea: false },
  { name: "diferencial_confianza", label: "¿Qué herramienta o proceso exclusivo usás para que el propietario confíe en tu tasación y tu estrategia?", placeholder: "Ej: le entrego un ACM escrito con los comparables reales de su zona y le muestro las fotos de cada uno.", etiquetaPrompt: "Diferencial de confianza (tasación y estrategia)", multilinea: true },
  { name: "compradores_activos", label: "¿Cuántos compradores activos tenés hoy buscando en tu base de datos?", placeholder: "Ej: 240 compradores activos", etiquetaPrompt: "Compradores activos en su base", multilinea: false },
  { name: "tiempo_entrega_acm", label: "Desde que visitás la propiedad, ¿en cuánto tiempo entregás el ACM completo y el plan de acción?", placeholder: "Ej: 48 horas", etiquetaPrompt: "Tiempo de entrega del ACM y el plan", multilinea: false },
  { name: "tiempo_primera_oferta", label: "Desde que la propiedad sale al mercado, ¿cuánto tardás en conseguir la primera reserva u oferta formal?", placeholder: "Ej: 21 días promedio", etiquetaPrompt: "Tiempo promedio hasta la primera oferta formal", multilinea: false },
  { name: "diferencial_esfuerzo", label: "¿Qué tareas, fricciones o costos te bancás vos al 100% para que el dueño no tenga que mover un dedo hasta la firma?", placeholder: "Ej: pago las fotos y el video, hago los trámites de planos y deudas, coordino y acompaño todas las visitas.", etiquetaPrompt: "Qué se banca el asesor para que el dueño no haga nada", multilinea: true },
]

export const CAMPOS_VENTA: CampoOperacion[] = [
  { name: "diferencial_confianza", label: "¿Qué hacés distinto para garantizarle al comprador que hace un negocio seguro y al precio correcto?", placeholder: "Ej: le muestro el ACM de la zona antes de que oferte, para que sepa si está pagando de más.", etiquetaPrompt: "Diferencial de confianza para el comprador", multilinea: true },
  { name: "rebaja_promedio", label: "¿Qué porcentaje de rebaja promedio conseguís negociar sobre el precio de lista?", placeholder: "Ej: 7% promedio", etiquetaPrompt: "Rebaja promedio negociada sobre el precio de lista", multilinea: false },
  { name: "exclusivas_offmarket", label: "¿Cuántas de tus propiedades son exclusivas u off-market?", placeholder: "Ej: 18 exclusivas, 5 off-market", etiquetaPrompt: "Propiedades exclusivas y off-market", multilinea: false },
  { name: "tiempo_primera_seleccion", label: "Después de conocer lo que busca, ¿cuánto tardás en mandarle la primera selección de propiedades elegidas a mano?", placeholder: "Ej: 24 horas", etiquetaPrompt: "Tiempo hasta la primera selección curada", multilinea: false },
  { name: "semanas_hasta_reserva", label: "¿En cuántas semanas promedio tu comprador encuentra y reserva su propiedad?", placeholder: "Ej: 6 semanas", etiquetaPrompt: "Semanas promedio hasta la reserva", multilinea: false },
  { name: "diferencial_esfuerzo", label: "¿Qué dolores de cabeza burocráticos o logísticos le sacás de encima al comprador?", placeholder: "Ej: consigo los planos, verifico deudas y expensas, y coordino escribano y tasación.", etiquetaPrompt: "Trámites que le saca de encima al comprador", multilinea: true },
]

interface OperacionParcial {
  perfil: Record<string, unknown>;
  captacion: Record<string, unknown>;
  venta: Record<string, unknown>;
}

const bloqueCompleto = (valores: Record<string, unknown>, campos: CampoOperacion[]) =>
  campos.every((c) => typeof valores?.[c.name] === "string" && (valores[c.name] as string).trim().length >= 2)

/** Se pueden generar las ofertas cuando Captación y Venta están completos. El perfil nunca bloquea. */
export function operacionCompleta(op: OperacionParcial): boolean {
  return bloqueCompleto(op.captacion, CAMPOS_CAPTACION) && bloqueCompleto(op.venta, CAMPOS_VENTA)
}

/** Tipos derivados: si alguien agrega un campo al catálogo, TypeScript pide sumarlo a la interface. */
export type ClavePerfil = keyof PerfilOperacion
export type ClaveCaptacion = keyof CaptacionOperacion
export type ClaveVenta = keyof VentaOperacion
