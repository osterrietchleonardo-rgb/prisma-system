// Farming · los nueve indicadores del punto 8 del método.
//
// «El tablero ES el reporte»: estos nueve números salen solos de lo que el asesor ya movió
// caminando la zona — nadie los carga en una planilla aparte. Por eso van ARRIBA de la solapa,
// visibles en las dos vistas (lista y tablero), y no adentro de ninguna de las dos: si
// desaparecieran al cambiar de vista, dejarían de sentirse como el reporte.
//
// `calcularIndicadores` corre en el servidor (lib/farming/tablero.ts) sobre TODAS las
// direcciones de la zona, no solo las que están cargadas en pantalla en este momento — así que
// esta pantalla NUNCA sopesa ni recalcula nada, solo lee `indicadores` de la respuesta y lo
// dibuja.
//
// Cada número dice de dónde sale, como línea chica y VISIBLE debajo — nunca en un globito: en
// el celular no se abren, y quien mira esto está parado en la vereda.
//
// En cero no se esconden: un indicador en cero es información («todavía no mandaste ninguna
// carta»), no un estado vacío que se tapa. Por eso el placeholder mientras no hay datos (todavía
// cargando, o la carga falló) es un guión — nunca un cero: un cero tiene que significar SIEMPRE
// cero, jamás "no sabemos todavía".
import type { Indicadores as Totales } from "@/lib/farming/tablero"

const ITEMS: { clave: keyof Totales; nombre: string; deDondeSale: string }[] = [
  {
    clave: "cuadras",
    nombre: "Cuadras relevadas",
    deDondeSale: "Los tramos (cuadras) distintos que anotaste en tus direcciones.",
  },
  {
    clave: "propiedades",
    nombre: "Propiedades relevadas",
    deDondeSale: "Todas las direcciones que cargaste en esta zona.",
  },
  {
    clave: "unidades",
    nombre: "Unidades potenciales",
    deDondeSale: "La suma de unidades de todas esas direcciones.",
  },
  {
    clave: "contactos",
    nombre: "Contactos realizados",
    deDondeSale: "Cada visita, llamado, carta o mensaje que anotaste.",
  },
  {
    clave: "encargados",
    nombre: "Encargados contactados",
    deDondeSale: "Direcciones con encargado anotado Y una visita registrada.",
  },
  {
    clave: "respuestas",
    nombre: "Respuestas recibidas",
    deDondeSale: "Direcciones que pasaron por «Respondió», aunque hoy estén más adelante.",
  },
  {
    clave: "tasaciones",
    nombre: "Tasaciones solicitadas",
    deDondeSale: "Cada contacto de tipo «Tasación» que registraste.",
  },
  {
    clave: "entrevistas",
    nombre: "Entrevistas",
    deDondeSale: "Cada contacto de tipo «Entrevista» que registraste.",
  },
  {
    clave: "captaciones",
    nombre: "Captaciones",
    deDondeSale: "Direcciones que hoy están en «Captada».",
  },
]

export function IndicadoresFarming({
  indicadores,
}: {
  /** `null` mientras no hay un número confiable para mostrar: cargando la primera vez, o la
   *  carga falló. En los dos casos el marco con los nueve nombres se dibuja igual — lo que
   *  cambia es el número, que sale como un guión y nunca como un cero inventado. */
  indicadores: Totales | null
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ITEMS.map((it) => {
        const valor = indicadores ? indicadores[it.clave] : null
        return (
          <div
            key={it.clave}
            className="rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800"
          >
            <p className="text-2xl font-semibold leading-none tabular-nums">
              {valor === null ? (
                <span aria-label="Todavía sin dato" className="text-muted-foreground">—</span>
              ) : (
                valor
              )}
            </p>
            <p className="mt-1.5 text-xs font-medium leading-tight">{it.nombre}</p>
            {/* De dónde sale, SIEMPRE como línea visible, nunca en un globito: en el celular no
                se abren, y esta pantalla se usa parado en la calle. */}
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {it.deDondeSale}
            </p>
          </div>
        )
      })}
    </div>
  )
}
