// ACM · El catálogo de barrios que alimenta el desplegable del campo "Barrio / Zona".
//
// El campo era texto libre y eso costó caro: una asesora cargó "Nogoya" en Dirección y
// "4464" en Barrio, el ACM buscó comparables en un barrio llamado "4464" y devolvió cero
// sin ningún error. Con el barrio bien cargado esa misma propiedad tenía 50 comparables.

/** Un barrio ofrecido por el desplegable. */
export type BarrioOpcion = {
  /** Clave normalizada — es contra esto que se compara, nunca contra el nombre. */
  clave: string;
  /** Nombre para mostrar, tal cual lo escribe la mayoría de los avisos ("Villa del Parque"). */
  nombre: string;
  /** Avisos activos en la red. Se muestra al lado del nombre: le dice al asesor si va a encontrar algo. */
  avisos: number;
  /** true = sale de la cartera de su agencia, no de la red. Puede tener 0 avisos y aun así ser válido. */
  propio?: boolean;
};

// Las mismas dos cadenas que usa la función acm_norm de Postgres. Tienen que seguir
// coincidiendo carácter por carácter: si acá normalizamos distinto que la base, el
// desplegable diría "no reconozco este barrio" para uno que la búsqueda sí resuelve.
const CON_ACENTO = "áàäâãéèëêíìïîóòöôõúùüûñç";
const SIN_ACENTO = "aaaaaeeeeiiiiooooouuuunc";

/**
 * Copia exacta de `public.acm_norm(text)`: minúsculas y sin acentos.
 * No hace trim: la función de la base tampoco lo hace (el trim va aparte, donde se usa).
 */
export function acmNorm(t: string | null | undefined): string {
  let out = "";
  for (const ch of (t ?? "").toLowerCase()) {
    const i = CON_ACENTO.indexOf(ch);
    out += i >= 0 ? SIN_ACENTO[i] : ch;
  }
  return out;
}

/** La clave con la que se busca un barrio escrito a mano. */
export function claveBarrio(t: string | null | undefined): string {
  return acmNorm((t ?? "").trim());
}

/**
 * ¿Este texto corresponde a un barrio del catálogo? Vacío cuenta como "todavía no escribió
 * nada", no como desconocido: no queremos gritarle un aviso al campo en blanco.
 */
export function barrioReconocido(texto: string, opciones: BarrioOpcion[]): boolean {
  const k = claveBarrio(texto);
  if (!k) return true;
  return opciones.some((o) => o.clave === k);
}

/**
 * Filtra el listado por lo que va escribiendo el asesor. Ordena poniendo primero los que
 * EMPIEZAN con lo tipeado ("villa" → "Villa Crespo" antes que "La Lucila - Villa Adelina")
 * y, dentro de cada grupo, los que más avisos tienen.
 */
export function filtrarBarrios(texto: string, opciones: BarrioOpcion[], tope = 60): BarrioOpcion[] {
  const k = claveBarrio(texto);
  const base = k ? opciones.filter((o) => o.clave.includes(k)) : opciones;
  return [...base]
    .sort((a, b) => {
      if (k) {
        const ea = a.clave.startsWith(k) ? 0 : 1;
        const eb = b.clave.startsWith(k) ? 0 : 1;
        if (ea !== eb) return ea - eb;
      }
      if (a.avisos !== b.avisos) return b.avisos - a.avisos;
      return a.nombre.localeCompare(b.nombre);
    })
    .slice(0, tope);
}
