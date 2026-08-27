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
// Para qué sirve la pantalla
// ---------------------------------------------------------------------------

/**
 * Para qué sirve esta pantalla, en dos renglones.
 *
 * Dice la maquinaria (comparar, detectar) **y el premio** (que PRISMA le arme
 * después el documento a cada asesor). Sin el premio, el director lee un
 * procedimiento y no entiende para qué apretaría el botón.
 *
 * El premio va **en futuro, y a propósito**: generar el documento de cada
 * asesor TODAVÍA NO EXISTE. Hoy la única ruta de esta etapa es
 * `detectar-plantilla`, que compara y devuelve una propuesta sin guardar nada;
 * ni `confirmar-plantilla` ni ninguna pantalla llaman a `rellenarDocx`. Decirlo
 * en presente ("le genera el documento a cada asesor") le promete al director
 * algo que va a buscar y no va a encontrar, y esa es la única forma segura de
 * que deje de creerle a la pantalla. La regla, entonces: **se puede decir qué
 * va a poder hacer; no se puede describir en presente algo que hoy no pasa.**
 * Ante la duda, quedarse corto.
 *
 * Vive acá y no adentro del `.tsx` por el mismo motivo que el resto de este
 * archivo: los tests del repo solo miran `lib/**`. La versión anterior de esta
 * frase vivía en el componente, y por eso la promesa en presente pasó una
 * ronda entera sin que ningún test la viera. Ahora la vigila
 * `PROMESA_EN_PRESENTE` en `plantillas.test.ts`, junto con todo lo que
 * devuelve `explicacionDelEstado`.
 */
export const PARA_QUE_SIRVE =
  "Un tipo de documento por fila. Cuando varios asesores tienen el mismo contrato cargado, PRISMA los compara y " +
  "detecta qué parte es texto fijo y qué parte es el dato de cada persona. Con eso arma la plantilla; más " +
  "adelante le va a generar el documento a cada asesor con sus datos."

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
    /**
     * "…se generan con esta versión" decía en presente lo mismo que el párrafo
     * de arriba: que PRISMA ya le arma el documento a cada asesor. No lo hace
     * (ver `PARA_QUE_SIRVE`). Lo que SÍ es cierto de una fila `activa` es que
     * esta versión quedó confirmada; generar con ella viene después.
     */
    const enUso = "Está en uso: es la versión confirmada. Con ella se le va a generar el documento a cada asesor."
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

// ---------------------------------------------------------------------------
// La pantalla de revisión (spec §7.2)
// ---------------------------------------------------------------------------

/**
 * Los textos de la pantalla donde el director revisa la plantilla antes de
 * confirmarla viven acá, con el resto de la prosa de la solapa, por DOS
 * motivos que se suman:
 *
 *  · los tests solo miran `lib/**`, y la regla del presente (ver
 *    `PARA_QUE_SIRVE`) ya se escapó una vez por vivir adentro de un `.tsx`;
 *  · este archivo lo carga el NAVEGADOR y no importa nada pesado. Ponerlos en
 *    `confirmacion.ts` los ataría a `propuesta.ts`, que importa
 *    `deteccion.ts`, que arrastra la librería de comparación de textos
 *    (900 KB) a cada visita del director. Es el mismo motivo por el que
 *    `MINIMO_PARA_DETECTAR` está escrito a mano acá arriba.
 */

/**
 * Para qué sirve la revisión, en dos renglones y sin tecnicismos.
 *
 * Rige la misma regla que `PARA_QUE_SIRVE`: se puede decir qué va a poder
 * hacer, no se puede describir en presente algo que todavía no pasa. Hasta que
 * exista la pantalla que le arma el documento a cada asesor (Tarea 7 en
 * adelante), acá no se promete en presente; lo vigila `PROMESA_EN_PRESENTE`
 * en `plantillas.test.ts`, la misma que cuida el resto de la solapa.
 */
export const PARA_QUE_SIRVE_LA_REVISION =
  "Estos son los datos que cambian de asesor a asesor. Revisá que cada uno sea de verdad un dato de la persona y " +
  "no una parte fija del contrato: podés cambiarle el nombre o sacar el que esté de más."

/**
 * Que todavía no se guardó nada. Va en la barra de abajo, siempre visible.
 *
 * No es una cortesía: sin esta frase, ver la lista de campos armada se lee
 * como que la plantilla ya quedó hecha, y el director cierra la pantalla
 * creyendo que terminó.
 */
export const NADA_SE_GUARDA_TODAVIA =
  "Todavía no se guardó nada. Recién al confirmar se crea la plantilla y se revisa contra el documento de cada asesor."

/**
 * El límite de la verificación, dicho de frente.
 *
 * `textoDeDocx` lee el CUERPO del documento (mammoth no trae encabezado ni
 * pie). Los huecos sí se marcan y se rellenan ahí, pero la comprobación
 * contra el archivo original no los mira. Callarlo dejaría al director creyendo
 * que se revisó el archivo entero.
 */
export const LIMITE_ENCABEZADO_Y_PIE =
  "La comprobación mira el cuerpo del documento. Si el contrato tiene datos en el encabezado o en el pie de " +
  "página, esos se marcan y se rellenan igual, pero hay que revisarlos a ojo."

/**
 * Hasta cuántas letras un dato se considera demasiado corto.
 *
 * Es el mismo número que `LARGO_DE_DATO_SOSPECHOSO` en `confirmacion.ts`,
 * escrito de nuevo acá a propósito y NO importado de allá: este archivo lo
 * carga el navegador y `confirmacion.ts` arrastra la librería de comparación
 * de textos (900 KB). Es el mismo motivo, y la misma solución, que
 * `MINIMO_PARA_DETECTAR`: un test compara los dos números.
 */
export const LARGO_DE_DATO_CORTO = 3

/**
 * El aviso de un dato demasiado corto, para la pantalla de revisión.
 *
 * Por qué existe: el reemplazo cambia TODAS las apariciones de ese texto en el
 * contrato. Con un dato de una o dos letras eso no es lo que nadie quiere — el
 * "A." que queda de "S.A." se lleva puesto el "S.A." de la inmobiliaria, y el
 * "1" de "1 de marzo" se lleva el "(1)" de "una (1) instancia mensual". Medido
 * con tres contratos reales.
 *
 * El director es el único que puede decidir: se le muestra y él saca el campo
 * si no corresponde, que es para lo que está esta pantalla. `null` cuando el
 * dato tiene largo suficiente.
 */
export function avisoDeDatoCorto(valor: string): string | null {
  const limpio = valor.trim()
  if (limpio === "" || limpio.length > LARGO_DE_DATO_CORTO) return null
  return (
    `Este dato es muy corto ("${limpio}"): se va a reemplazar en TODOS los lugares del contrato donde aparezca ese ` +
    `texto, no solo en este. Si no es un dato de cada persona, sacalo.`
  )
}

/** Qué pasa si algún asesor queda en rojo. Se dice ANTES de confirmar. */
export const SI_ALGUNO_QUEDA_EN_ROJO =
  "Si aunque sea un asesor no coincide, la plantilla se guarda igual pero queda como borrador y no se usa para " +
  "nadie, y vas a ver quién falló y por qué."
