// ACM · Hoja del entorno: cómo se dice una distancia.
// Existe aparte porque lo usan tres lugares con criterios distintos: la columna de datos duros
// (metros exactos), el prompt de la IA (cuadras, que es como habla la gente) y el mapa.

/** A cuánto camina una persona: 4,5 km/h ≈ 75 m por minuto. */
const METROS_POR_MINUTO = 75;
/** Una cuadra de CABA. */
const METROS_POR_CUADRA = 100;

const NUMEROS = [
  "", "una", "dos", "tres", "cuatro", "cinco", "seis",
  "siete", "ocho", "nueve", "diez", "once", "doce",
];

/** "550 m" · "1,2 km". Vacío si no hay dato. Redondeado a la decena: la precisión al metro es falsa. */
export function metrosLegible(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = Math.round(m / 100) / 10;
  return `${km.toLocaleString("es-AR")} km`;
}

/** Minutos caminando, nunca menos de 1 (decir "0 minutos" no ayuda a nadie). */
export function minutosCaminando(m: number | null | undefined): number | null {
  if (m == null || !Number.isFinite(m)) return null;
  return Math.max(1, Math.round(m / METROS_POR_MINUTO));
}

/** Cuadras, nunca cero: media cuadra sigue siendo "a una cuadra". */
export function cuadras(m: number | null | undefined): number {
  if (m == null || !Number.isFinite(m)) return 0;
  return Math.max(1, Math.round(m / METROS_POR_CUADRA));
}

/**
 * "cuatro cuadras". Es lo que se le pasa a la IA en vez de metros pelados: "a cuatro cuadras se
 * abren las Barrancas" es una frase de persona, "espacio verde a 400 metros" es una ficha catastral.
 * De trece en adelante el número escrito estorba más de lo que suma.
 */
export function cuadrasEnPalabras(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "";
  const n = cuadras(m);
  const palabra = n <= 12 ? NUMEROS[n] : String(n);
  return `${palabra} ${n === 1 ? "cuadra" : "cuadras"}`;
}
