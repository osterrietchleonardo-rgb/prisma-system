/**
 * Lo que la solapa "Plantillas" muestra de cada tipo de documento, y las
 * reglas puras que lo deciden.
 *
 * Vive acá y no adentro del componente por un motivo concreto: los tests del
 * repo solo miran `lib/**`, así que todo lo que se meta en el `.tsx` queda sin
 * red. Y lo que decide esta pantalla no es cosmético -- si el botón de detectar
 * se habilita con dos documentos, la detección sale con un molde que nadie
 * puede usar, y si el estado se lee al revés el director da por buena una
 * plantilla que todavía es un borrador.
 *
 * Nada de acá toca la base ni la red. El componente junta los datos, esto
 * decide qué se ve.
 */

// ---------------------------------------------------------------------------
// La forma de cada fila
// ---------------------------------------------------------------------------

/**
 * `advisor_doc_templates.estado`, tal como está en la base:
 * `text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','activa'))`.
 */
export type EstadoPlantilla = "borrador" | "activa"

export type FilaPlantilla = {
  templateId: string
  nombre: string
  estado: EstadoPlantilla
  /** El NÚMERO de la versión vigente. `null` = todavía no tiene ninguna. */
  version: number | null
  /** Cuántos asesores tienen hoy un documento de este tipo. */
  documentos: number
  /** Cuántos de esos documentos quedaron marcados para revisar. */
  enRojo: number
}

// ---------------------------------------------------------------------------
// De las filas de la base a las filas de la pantalla
// ---------------------------------------------------------------------------

/** `advisor_doc_templates`, con lo que la pantalla necesita. */
export type TipoCrudo = {
  id: string
  nombre: string
  estado: string | null
  /** El id de la fila de versión vigente, no su número. */
  version_actual: string | null
}

/** `advisor_doc_template_versions`. */
export type VersionCruda = { id: string; version: number }

/** `advisor_documents`, solo las dos columnas que se cuentan. */
export type DocumentoCrudo = { template_id: string; estado: string | null }

/**
 * El estado que se muestra.
 *
 * Un valor que la pantalla no conoce se trata como `borrador`, nunca como
 * `activa`: entre equivocarse diciendo "todavía no se usa" y equivocarse
 * diciendo "está en uso", la segunda es la que hace que el director confíe en
 * algo que no está listo.
 */
export function estadoDePlantilla(crudo: string | null | undefined): EstadoPlantilla {
  return crudo === "activa" ? "activa" : "borrador"
}

/**
 * Junta los tres pedazos en una fila por tipo de documento.
 *
 * El conteo sale de los documentos de verdad y no de un contador guardado: un
 * contador se desactualiza en silencio y el director termina viendo "3
 * asesores" con dos documentos cargados, que es justo el número del que
 * depende el botón de detectar.
 */
export function armarFilas(args: {
  tipos: TipoCrudo[]
  versiones: VersionCruda[]
  documentos: DocumentoCrudo[]
}): FilaPlantilla[] {
  const numeroDeVersion = new Map(args.versiones.map((v) => [v.id, v.version]))

  const total = new Map<string, number>()
  const rojos = new Map<string, number>()
  for (const doc of args.documentos) {
    total.set(doc.template_id, (total.get(doc.template_id) ?? 0) + 1)
    if (doc.estado === "revisar") rojos.set(doc.template_id, (rojos.get(doc.template_id) ?? 0) + 1)
  }

  return args.tipos
    .map((t) => ({
      templateId: t.id,
      nombre: t.nombre,
      estado: estadoDePlantilla(t.estado),
      /**
       * `?? null` y no `?? 0`: si la versión vigente apunta a una fila que la
       * consulta no trajo, "sin versión" es la verdad. Un 0 se leería como
       * "versión cero", que no existe.
       */
      version: t.version_actual ? numeroDeVersion.get(t.version_actual) ?? null : null,
      documentos: total.get(t.id) ?? 0,
      enRojo: rojos.get(t.id) ?? 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

// ---------------------------------------------------------------------------
// Si se puede detectar, y si no, por qué no
// ---------------------------------------------------------------------------

/**
 * El mismo 3 de `MINIMO_DOCUMENTOS` en `lib/plantillas/deteccion.ts`, escrito
 * de nuevo a propósito y NO importado de allá.
 *
 * Motivo: este archivo lo carga el navegador, y `deteccion.ts` arrastra la
 * librería de comparación de textos entera. Importar una constante de 1 dígito
 * le costaría al director bajar todo eso en cada visita a la pantalla.
 *
 * Que los dos números no se separen lo sostiene un test que los compara
 * (`plantillas.test.ts`), que sí corre en Node y puede importar los dos.
 */
export const MINIMO_PARA_DETECTAR = 3

/**
 * Por qué NO se puede detectar todavía, en castellano y con lo que hay que
 * hacer para poder.
 *
 * `null` cuando sí se puede. Un botón deshabilitado que no dice por qué es
 * exactamente lo mismo que un botón roto: el director prueba, no pasa nada, y
 * no tiene forma de saber si le falta algo o si el sistema falló.
 */
export function motivoParaNoDetectar(documentos: number): string | null {
  if (documentos >= MINIMO_PARA_DETECTAR) return null

  const faltan = MINIMO_PARA_DETECTAR - documentos
  const cuantosHay =
    documentos === 0
      ? "todavía no hay ninguno cargado"
      : documentos === 1
        ? "hoy hay 1"
        : `hoy hay ${documentos}`
  const cuantosFaltan = faltan === 1 ? "1 asesor más" : `${faltan} asesores más`

  return (
    `Para detectar la plantilla hacen falta al menos ${MINIMO_PARA_DETECTAR} documentos de este tipo y ` +
    `${cuantosHay}. Comparando menos no se puede distinguir qué parte del contrato es texto fijo y qué parte es ` +
    `el dato de cada persona. Subí este mismo documento a ${cuantosFaltan}.`
  )
}

// ---------------------------------------------------------------------------
// Qué significa cada estado
// ---------------------------------------------------------------------------

/** "1 asesor quedó" / "N asesores quedaron", para no repetirlo en cada rama. */
function quienesQuedaron(enRojo: number): string {
  return enRojo === 1 ? "1 asesor quedó" : `${enRojo} asesores quedaron`
}

/**
 * Qué quiere decir el estado de esta fila, dicho entero.
 *
 * No alcanza con pintar "Borrador" de un color y "Activa" de otro: el director
 * no tiene por qué saber qué significan, y tener que preguntar es lo mismo que
 * no estar escrito.
 */
export function explicacionDelEstado(fila: Pick<FilaPlantilla, "estado" | "version" | "enRojo">): string {
  if (fila.estado === "activa") {
    const enUso = "Está en uso: los documentos de los asesores se generan con esta versión."
    if (fila.enRojo === 0) return enUso
    /**
     * Una plantilla en uso NO debería tener documentos para revisar. Cuando los
     * tiene, se dice acá con todas las letras.
     *
     * Callarlo dejaría al director leyendo "está en uso" justo al lado de un
     * contador en rojo, sin nada que explique la contradicción — y esa
     * contradicción es el síntoma visible de un problema de verdad. Nombrarla
     * la hace MÁS visible, que es exactamente lo que se busca: taparla sería
     * esconder el aviso, no arreglar la causa.
     */
    return (
      `${enUso} Pero ${quienesQuedaron(fila.enRojo)} para revisar, y eso no debería pasar con una plantilla en ` +
      `uso: revisá esos documentos antes de darlos por buenos.`
    )
  }
  if (fila.enRojo > 0) {
    return (
      `Es un borrador y todavía no se usa: ${quienesQuedaron(fila.enRojo)} para revisar. Hasta que estén todos ` +
      `bien, la plantilla no se aplica a nadie.`
    )
  }
  if (fila.version === null) {
    return (
      "Es un borrador y todavía no se usa: falta detectar la plantilla a partir de los documentos cargados y " +
      "revisarla."
    )
  }
  return "Es un borrador y todavía no se usa: la plantilla ya está detectada pero falta confirmarla."
}
