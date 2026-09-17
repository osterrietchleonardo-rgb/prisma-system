// lib/farming/fechas.ts
//
// Farming · las fechas de la caminata, siempre en el huso de Buenos Aires.
//
// Vive acá y no adentro de un componente porque la MISMA fecha se dibuja en tres pantallas —la
// lista, el tablero y el historial— y porque el «vencida» de la tarjeta es una decisión, no un
// formato: si cada pantalla se hiciera su propia cuenta, alcanzaría con que una usara
// `new Date(iso)` para que la misma tarjeta estuviera vencida en una y al día en la otra.

/**
 * Para las columnas `date` (`relevada_en`, `proxima_accion_en`): «2026-09-16» → «16/9/2026».
 * Se corta el string y NO se pasa por `new Date`: un `date` de Postgres parseado así se lee
 * como medianoche UTC y en Buenos Aires cae un día antes. En un cuaderno de caminata la fecha
 * ES el dato.
 */
export function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split("-")
  if (!a || !m || !d) return null
  return `${Number(d)}/${Number(m)}/${a}`
}

/**
 * Para `fuera_de_zona_desde`, que es `timestamptz` y NO una fecha suelta. Acá sí se pasa por
 * `new Date`, porque el valor trae la hora y la zona: es un instante de verdad. Cortarle el
 * string sería leer el día en UTC, y un trazo redibujado a las 22:00 en Buenos Aires diría que
 * la dirección quedó afuera al día siguiente.
 */
export function fechaDeInstante(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return t.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
}

/** Hoy en Buenos Aires, como «2026-09-17». El mismo cálculo que hace el endpoint de mover al
 *  guardar `farming_contactos.fecha`: si la pantalla usara la hora del aparato, un asesor con
 *  el celular en otro huso vería vencida una tarjeta que el servidor anotó para hoy. */
export function hoyEnBuenosAires(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
}

export type EstadoFecha = "sin_fecha" | "vencida" | "hoy" | "futura"

/**
 * En qué anda la fecha del próximo paso. Se compara STRING contra STRING («2026-09-16» <
 * «2026-09-17»), que para el formato `YYYY-MM-DD` es exactamente el orden del calendario y no
 * arrastra ni horas ni husos.
 *
 * «hoy» es un estado propio y no cae del lado de «vencida»: una tarjeta que hay que visitar
 * HOY no está atrasada, y decirle al asesor que sí es empezarle el día con una deuda falsa.
 */
export function estadoDeFecha(iso: string | null, hoy: string = hoyEnBuenosAires()): EstadoFecha {
  if (!iso) return "sin_fecha"
  const f = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return "sin_fecha"
  if (f < hoy) return "vencida"
  if (f === hoy) return "hoy"
  return "futura"
}
