import type { PropuestaHueco } from "@/lib/asesor-docs/propuesta"

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
 * el documento a cada asesor). Sin el premio, el director lee un procedimiento
 * y no entiende para qué apretaría el botón.
 *
 * ═══ Y acá el premio pasó a estar en PRESENTE, con fecha ═══
 *
 * Durante toda la Etapa C esta frase estuvo **en futuro a propósito**, y había
 * un test —`PROMESA_EN_PRESENTE`— que prohibía escribirla en presente en
 * cualquier texto de la solapa. El motivo era que generar el documento de cada
 * asesor NO EXISTÍA: `detectar-plantilla` comparaba y devolvía una propuesta,
 * `confirmar-plantilla` guardaba la plantilla, y nadie llamaba a
 * `rellenarDocx`. Decirlo en presente le prometía al director algo que iba a
 * buscar y no iba a encontrar.
 *
 * Con la 7b-2 empezó a pasar de verdad: la solapa sube la versión nueva, la
 * aplica asesor por asesor contra `aplicar-version/{advisorId}` —que rellena el
 * molde, le pasa las cinco comprobaciones y guarda el `.docx` de esa persona— y
 * después la pone en uso. Así que el test se borró en ESE commit, ni antes ni
 * después, y esta frase se escribió en presente en el mismo movimiento.
 *
 * Lo que NO cambió es la regla de fondo, que sigue valiendo para todo lo que se
 * agregue: **no se puede describir en presente algo que hoy no pasa.** Ante la
 * duda entre prometer y quedarse corto, corto.
 *
 * Vive acá y no adentro del `.tsx` por el mismo motivo que el resto de este
 * archivo: los tests del repo solo miran `lib/**`. La versión anterior de esta
 * frase vivía en el componente, y por eso una promesa falsa pasó una ronda
 * entera sin que ningún test la viera.
 */
export const PARA_QUE_SIRVE =
  "Un tipo de documento por fila. Cuando varios asesores tienen el mismo contrato cargado, PRISMA los compara y " +
  "detecta qué parte es texto fijo y qué parte es el dato de cada persona. Con eso arma la plantilla y le genera " +
  "el documento a cada asesor con sus datos: cuando cambie una cláusula, subís el Word una sola vez y se lo " +
  "aplicás a todos desde acá."

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
  /**
   * De esos, cuántos ENTRAN de verdad en la comparación.
   *
   * ═══ El balde que decidía mal el botón, medido ═══
   *
   * `documentos` cuenta a todos, incluidos los pausados y los desvinculados. Y
   * el botón "Detectar plantilla" se habilitaba con ese número: con 3
   * documentos donde uno era de un pausado, el botón quedaba habilitado, el
   * director lo apretaba, y `detectar-plantilla` —que saca a los pausados y a
   * los desvinculados con `separarPorEstado` antes de comparar— seguía con 2 y
   * devolvía una propuesta con la advertencia de que los huecos hay que
   * revisarlos a mano. O sea: el botón prometía una detección que la ruta no
   * podía hacer.
   *
   * Así que el mínimo se cuenta sobre los que participan, que es lo mismo que
   * cuenta la ruta. `documentos` sigue existiendo y sigue mostrándose —es
   * cierto que esas personas tienen el documento cargado— pero ya no decide
   * nada.
   *
   * El que no aparece en la lista de asesores tampoco participa: la ruta lo
   * deja afuera con nombre y apellido ("no se encontró al asesor del archivo
   * …"). Es al revés que en `desvinculados`, y a propósito: ahí lo conservador
   * es no aconsejar borrar; acá lo conservador es no habilitar un botón que va
   * a fallar.
   */
  participan: number
  /**
   * Cuántos quedaron en rojo **contra la versión vigente**.
   *
   * Contra la vigente y no contra cualquiera: un `revisar` que quedó de una
   * versión anterior no dice nada de la que está en uso hoy, y contarlo hacía
   * que la solapa dijera "Activa" y "1 en rojo" al mismo tiempo sobre algo que
   * el director no podía destrabar. Esos van al balde de abajo.
   */
  enRojo: number
  /**
   * Cuántos NO se compararon contra la versión vigente.
   *
   * El balde que faltaba, y que tapaba dos agujeros de golpe:
   *
   *  · **el asesor pausado.** Se lo deja afuera de la comparación (spec §7.5) y
   *    su fila queda con el `version_id` viejo. Si los demás dan verde, la
   *    plantilla pasa a `activa` — y el día que lo reactiven, su contrato sale
   *    de un molde que NUNCA se comparó contra su documento. Es exactamente la
   *    falla que toda esta red vino a evitar. Con 30 asesores, pausar y
   *    reactivar es rutina.
   *  · **el que sube su documento después.** Llega con `version_id` en null a
   *    una plantilla ya activa, y hasta acá no lo contaba nadie.
   *
   * El dato ya estaba en la base: `version_id` distinto de `version_actual` es
   * la constancia. Lo que faltaba era que alguien lo leyera.
   *
   * NO entran acá los desvinculados: tienen su propio balde, abajo. Y TAMPOCO
   * los que ya recibieron una versión MÁS NUEVA que la vigente: ver
   * `yaAplicados`, que es el balde que se llevó ese caso.
   */
  sinComprobar: number
  /**
   * Cuántos ya tienen el documento de una versión MÁS NUEVA que la vigente.
   *
   * ═══ El estado intermedio, que es el estado NORMAL ═══
   *
   * `aplicar-version/{advisorId}` le escribe a cada asesor su `version_id`
   * nuevo, y `activar-version` es lo ÚNICO que mueve
   * `advisor_doc_templates.version_actual`. Entre una cosa y la otra hay un
   * estado en el que `doc.version_id !== vigente` — y no es un borde: mientras
   * quede un `pendiente`, la versión NO se puede poner en uso (spec §7.4.2), así
   * que la fila se queda así hasta que el director le complete el dato a esa
   * persona.
   *
   * Sin este balde esos asesores caían en `sinComprobar`, y la fila decía cuatro
   * cosas falsas seguidas sobre ellos: que no se compararon (se compararon: les
   * corrieron las cinco comprobaciones de `frenosDeLaGeneracion` hace treinta
   * segundos), que estaban pausados, que subieron su documento después, y que
   * "no hay nada comprobado". Y remataba con una instrucción **peor que falsa**:
   * *volvé a detectar la plantilla*, que reconstruiría la plantilla a partir de
   * los documentos que acaban de SALIR de la plantilla — el círculo por el que
   * existe la columna `docx_path` aparte de `archivo_original_path`.
   *
   * Se distingue comparando **números de versión**, no ids: "más nuevo" es una
   * relación de orden y el id no la tiene. Lo que `sinComprobar` sí cuida —el
   * pausado que quedó con la versión vieja, el que subió su documento después—
   * tiene un `version_id` más VIEJO o nulo, así que sigue cayendo donde caía.
   */
  yaAplicados: number
  /** El número de esa versión más nueva. `null` cuando no hay ninguna. */
  versionYaAplicada: number | null
  /**
   * Y su id, que es lo que hace falta para poder ponerla en uso desde la fila.
   *
   * Sin esto el aviso diría "falta ponerla en uso" y no habría con qué: el panel
   * arranca siempre pidiendo un Word, así que el director que cerró después de
   * aplicar se quedaba sin ninguna forma de terminar. Una instrucción que no se
   * puede ejecutar es peor que no decir nada.
   *
   * Si conviven dos versiones más nuevas (v2 y v3, porque una candidata quemó
   * número), gana la MÁS alta: es la única que puede quedar en uso sin dejar a
   * nadie adelante, y si alguien quedó en la de al medio `activar-version`
   * se niega con su nombre.
   */
  versionIdYaAplicada: string | null
  /**
   * Cuántos documentos son de asesores DESVINCULADOS.
   *
   * Van aparte porque el director no puede hacer nada con ellos por el lado de
   * la plantilla, y decirle que sí es peor que no decirle nada. Un desvinculado
   * queda afuera de la detección y de la confirmación (spec §7.5) para
   * siempre: su documento caía en `sinComprobar`, la fila mostraba un ámbar
   * permanente y la explicación le pedía "volvé a detectar la plantilla con los
   * asesores activos" — algo que no cambia nada, porque el desvinculado nunca
   * va a volver a entrar. Un aviso que no se apaga haciendo lo que el aviso
   * pide es un aviso que se aprende a ignorar, y entonces deja de servir para
   * el caso del pausado, que sí importa.
   *
   * Tampoco entran en `enRojo` por el mismo motivo: un `revisar` que quedó de
   * antes de la desvinculación no se destraba revisando nada, y en un borrador
   * hacía que la fila dijera "hasta que estén todos bien, la plantilla no se
   * aplica a nadie" — falso: la confirmación ni los mira.
   *
   * Y lo que hay que hacer con ellos es NADA: un desvinculado puede volver —el
   * director lo reactiva él solo— y ahí su documento entra otra vez en la
   * detección. El texto lo dice así (ver `avisoDeDesvinculados`); borrar queda
   * como última opción y con la advertencia del mínimo al lado.
   */
  desvinculados: number
  /**
   * Cuántos quedaron en `pendiente` **contra la versión vigente**.
   *
   * ═══ El balde que faltaba, cerrado ANTES de poder llenarlo ═══
   *
   * `advisor_documents.estado` acepta tres valores desde la Etapa B (`ok`,
   * `revisar`, `pendiente`), y hasta hoy nadie escribía `pendiente`: la
   * confirmación de la §7.2 solo pone `ok` o `revisar`. Por eso un
   * `pendiente` sobre la versión vigente **no caía en ningún balde**: ni en
   * `enRojo`, ni en `sinComprobar` —su `version_id` SÍ es el vigente—, ni en
   * `desvinculados`. Se contaba solo en `documentos` y la solapa no lo
   * nombraba en ningún lado: el décimo camino por el que la pantalla dice que
   * está todo bien cuando no lo está.
   *
   * La 7b-1 los crea: el asesor al que la versión nueva le trajo un campo que
   * antes no existía queda `pendiente` y **sigue con la versión anterior**
   * (spec §7.4.2). Su documento es el de la versión vieja y le falta un dato
   * para poder pasar a la nueva — que es justo lo que el director tiene que
   * ver, porque `activar-version` se niega mientras quede uno así.
   */
  pendientes: number
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

/**
 * `advisor_documents`, con lo que hace falta para contar.
 *
 * `version_id` no es opcional: sin él no se puede saber si un `revisar` es de
 * la versión que está en uso o de una vieja, y ahí es donde se colaba una
 * plantilla `activa` con un asesor sin comprobar.
 */
export type DocumentoCrudo = {
  template_id: string
  estado: string | null
  version_id: string | null
  /** De quién es. Sin esto no se puede saber si el asesor sigue en la agencia. */
  advisor_id: string
  /**
   * Por qué está como está. Opcional: la solapa no la MUESTRA —es un párrafo
   * largo por asesor y va en su ficha— pero sí la mira para un caso que si no
   * queda mudo. Ver `esperaUnDato`.
   */
  observacion?: string | null
}

/**
 * Con qué arranca la anotación que deja `observacionDePendiente` en
 * `generar.ts`, escrita de nuevo acá a mano y NO importada de allá.
 *
 * El motivo es el de siempre en este archivo: lo carga el NAVEGADOR, y
 * `generar.ts` importa `confirmacion.ts`, que arrastra la librería de
 * comparación de textos (900 KB) a cada visita del director. Es la misma
 * decisión, y la misma solución, que `MINIMO_PARA_DETECTAR`: un test que corre
 * en Node importa las dos y las compara.
 */
export const ASI_EMPIEZA_LA_ESPERA_DE_UN_DATO = "La versión nueva trae "

/**
 * Si a este documento le falta un dato que la versión nueva trajo.
 *
 * ═══ El caso que quedaba mudo, y por qué se lee la observación ═══
 *
 * `estadoAlQuedarPendiente` **conserva el `revisar`** cuando la persona ya
 * estaba en rojo, y eso es lo correcto: `revisar` dice "su documento no
 * coincide con la plantilla" y `pendiente` dice "le falta cargar un dato";
 * degradar el uno al otro haría que la pantalla diga algo más tranquilizador
 * que la verdad.
 *
 * Pero deja un agujero por el otro lado: esa persona se cuenta en rojo y **nada
 * dice que además le falta un dato**. El director arregla el rojo, vuelve a
 * aplicar, y se encuentra con que sigue sin pasar — por un motivo que la solapa
 * nunca nombró. Los dos hechos son ciertos a la vez y los dos tienen que
 * contarse.
 *
 * El dato existe y está escrito: la `observacion` lleva las dos cosas desde la
 * 7b-1. Lo que faltaba era que alguien la leyera. No se PARSEA el texto —solo
 * se busca la marca con la que arranca lo que escribe PRISMA— y la marca está
 * atada por un test a la de `generar.ts`.
 */
function esperaUnDato(doc: DocumentoCrudo): boolean {
  return (doc.observacion ?? "").includes(ASI_EMPIEZA_LA_ESPERA_DE_UN_DATO)
}

/** `profiles`, con lo único que la solapa necesita saber de cada asesor. */
export type AsesorCrudo = { id: string; estado: string | null }

/**
 * El valor de `profiles.estado` de un asesor desvinculado.
 *
 * Escrito de nuevo acá y NO importado de `propuesta.ts`, por el mismo motivo
 * que `MINIMO_PARA_DETECTAR`: este archivo lo carga el navegador y
 * `propuesta.ts` arrastra `deteccion.ts` con la librería de comparación de
 * textos entera. Que no se separen lo sostiene un test que lo compara contra
 * `ESTADOS_FUERA`, que sí corre en Node.
 */
export const ESTADO_DESVINCULADO = "eliminado"

/**
 * El otro estado que deja a un asesor afuera de la comparación (`ESTADOS_FUERA`
 * en `propuesta.ts`, que es lo que usa `separarPorEstado`).
 *
 * Escrito de nuevo acá por el mismo motivo que `ESTADO_DESVINCULADO`, y atado
 * por el mismo test: los dos juntos tienen que dar `ESTADOS_FUERA`. Si mañana
 * se agrega un tercer estado que queda afuera y este archivo no se entera, el
 * botón "Detectar plantilla" se vuelve a habilitar con documentos que la ruta
 * no va a mirar.
 */
export const ESTADO_PAUSADO = "pausado"

/** Normalizado igual que en `separarPorEstado`: la columna es texto libre. */
function normalizar(estado: string | null | undefined): string | null {
  const limpio = estado?.trim().toLowerCase()
  return limpio ? limpio : null
}

/**
 * Se compara normalizado igual que en `separarPorEstado`: la columna es texto
 * libre, y un " Eliminado" con mayúscula dejaría al asesor del lado equivocado
 * justo en el balde que existe para no mentirle al director.
 */
function estaDesvinculado(estado: string | null | undefined): boolean {
  return normalizar(estado) === ESTADO_DESVINCULADO
}

/**
 * Si ese asesor entra en la comparación.
 *
 * Un estado que el sistema NO conoce entra, igual que en `separarPorEstado`:
 * la regla es "pausados y desvinculados", y un estado nuevo no es ninguno de
 * los dos. Dejarlo afuera acá inventaría una regla que allá no existe, y el
 * botón quedaría deshabilitado por documentos que la ruta sí iba a comparar.
 */
function participaEnLaComparacion(estado: string | null | undefined): boolean {
  const e = normalizar(estado)
  return e !== ESTADO_PAUSADO && e !== ESTADO_DESVINCULADO
}

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
  /**
   * Los asesores dueños de esos documentos. Obligatorio: sin esto no se puede
   * distinguir al pausado (que vuelve) del desvinculado (que no vuelve nunca),
   * y son los dos avisos que la pantalla tiene que dar distinto.
   */
  asesores: AsesorCrudo[]
}): FilaPlantilla[] {
  const numeroDeVersion = new Map(args.versiones.map((v) => [v.id, v.version]))

  const vigentePorTipo = new Map(args.tipos.map((t) => [t.id, t.version_actual]))

  /**
   * Un asesor que no vino en la lista se trata como si siguiera en la agencia.
   * Es lo conservador: el aviso de "borralo" sobre alguien que en realidad está
   * activo sería un consejo de borrar un documento que hace falta.
   */
  const desvinculado = new Set(args.asesores.filter((a) => estaDesvinculado(a.estado)).map((a) => a.id))

  /**
   * Quiénes entran en la comparación, con la MISMA regla que la ruta: el que
   * no está en la lista no entra (la ruta lo deja afuera por no encontrarlo), y
   * de los que están, quedan los que no son pausados ni desvinculados.
   */
  const participa = new Set(
    args.asesores.filter((a) => participaEnLaComparacion(a.estado)).map((a) => a.id),
  )

  const total = new Map<string, number>()
  const participan = new Map<string, number>()
  const rojos = new Map<string, number>()
  const sinComprobar = new Map<string, number>()
  const desvinculados = new Map<string, number>()
  const pendientes = new Map<string, number>()
  const yaAplicados = new Map<string, number>()
  /** La versión más NUEVA que ya tiene alguien, por tipo. Ver `versionIdYaAplicada`. */
  const laMasNueva = new Map<string, { id: string; numero: number }>()
  const sumar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

  for (const doc of args.documentos) {
    sumar(total, doc.template_id)
    if (participa.has(doc.advisor_id)) sumar(participan, doc.template_id)

    /**
     * Antes que todo lo demás: el documento de un desvinculado no cuenta ni en
     * rojo ni en sin comprobar. Los dos avisos terminan en una instrucción
     * ("revisá esos documentos", "volvé a detectar con los activos") que sobre
     * un desvinculado no cambia nada, porque no entra ni en la detección ni en
     * la confirmación (spec §7.5). Tiene su propio aviso, informativo y sin
     * color de alarma: ver `avisoDeDesvinculados`.
     */
    if (desvinculado.has(doc.advisor_id)) {
      sumar(desvinculados, doc.template_id)
      continue
    }

    const vigente = vigentePorTipo.get(doc.template_id) ?? null
    /**
     * Los NÚMEROS, no los ids: "más nueva" es una relación de orden, y un uuid
     * no la tiene. `null` cuando la consulta no trajo esa fila de versión, y ahí
     * no se afirma nada: el caso cae donde caía antes.
     */
    const numeroVigente = vigente !== null ? numeroDeVersion.get(vigente) ?? null : null
    const numeroDelDoc = doc.version_id !== null ? numeroDeVersion.get(doc.version_id) ?? null : null

    if (doc.version_id !== null && doc.version_id === vigente) {
      // Comprobado contra la versión que está en uso: su estado vale.
      if (doc.estado === "revisar") {
        sumar(rojos, doc.template_id)
        /**
         * Y si además le falta un dato, se cuenta TAMBIÉN en el otro balde. No
         * es una doble cuenta: son dos cosas distintas que le pasan a la misma
         * persona, y las dos hay que hacerlas. Contarlo en uno solo dejaba la
         * otra sin nombrar en ningún lado de la pantalla. Ver `esperaUnDato`.
         */
        if (esperaUnDato(doc)) sumar(pendientes, doc.template_id)
      }
      /**
       * Y el `pendiente`, que hasta acá se caía por el agujero del `continue`.
       * Va en su propio balde y no en `enRojo`: no hay nada roto que revisar
       * —el documento que tiene es correcto, el de la versión anterior—, lo que
       * falta es un dato que solo el director puede cargar. Meterlo en rojo le
       * mandaría a buscar un error que no existe.
       */
      if (doc.estado === "pendiente") sumar(pendientes, doc.template_id)
      continue
    }

    /**
     * YA APLICADO, esperando que la versión se ponga en uso.
     *
     * Su `version_id` apunta a una versión MÁS NUEVA que la vigente, que es
     * algo que solo puede haber escrito `aplicar-version/{advisorId}` después
     * de correrle las cinco comprobaciones y subirle el .docx. O sea: de este
     * asesor está TODO comprobado, y contra la versión nueva.
     *
     * Va antes del balde de abajo porque, sin esto, caía ahí y la fila le decía
     * al director que esas personas no se compararon con nadie y que volviera a
     * detectar la plantilla. Ver `yaAplicados`.
     */
    if (numeroDelDoc !== null && numeroVigente !== null && numeroDelDoc > numeroVigente) {
      sumar(yaAplicados, doc.template_id)
      const previa = laMasNueva.get(doc.template_id)
      if (!previa || numeroDelDoc > previa.numero) {
        laMasNueva.set(doc.template_id, { id: doc.version_id!, numero: numeroDelDoc })
      }
      continue
    }

    /**
     * No se comprobó contra la vigente.
     *
     *  · Si la plantilla TIENE versión vigente, va al balde sí o sí — incluido
     *    el que subió su documento después de que quedó activa, que llega con
     *    `version_id` en null y hasta acá no lo contaba nadie.
     *  · Si NO tiene versión vigente, se cuenta solo si alguna vez se lo tocó:
     *    un documento recién subido a una plantilla que todavía no se detectó
     *    no está "sin comprobar", está esperando que se detecte, y para eso ya
     *    está el texto de "falta detectar la plantilla". Decir "3 sin
     *    comprobar" ahí sería ruido en la fila por defecto de toda
     *    inmobiliaria que arranca.
     */
    if (vigente !== null || doc.version_id !== null || doc.estado !== null) sumar(sinComprobar, doc.template_id)
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
      participan: participan.get(t.id) ?? 0,
      yaAplicados: yaAplicados.get(t.id) ?? 0,
      versionYaAplicada: laMasNueva.get(t.id)?.numero ?? null,
      versionIdYaAplicada: laMasNueva.get(t.id)?.id ?? null,
      enRojo: rojos.get(t.id) ?? 0,
      sinComprobar: sinComprobar.get(t.id) ?? 0,
      desvinculados: desvinculados.get(t.id) ?? 0,
      pendientes: pendientes.get(t.id) ?? 0,
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
export function motivoParaNoDetectar(participan: number, documentos: number = participan): string | null {
  if (participan >= MINIMO_PARA_DETECTAR) return null

  const faltan = MINIMO_PARA_DETECTAR - participan
  const cuantosHay =
    participan === 0
      ? "todavía no hay ninguno cargado"
      : participan === 1
        ? "hoy hay 1"
        : `hoy hay ${participan}`
  const cuantosFaltan = faltan === 1 ? "1 asesor más" : `${faltan} asesores más`

  /**
   * Si el número que se muestra arriba ("5 asesores tienen este documento
   * cargado") es más grande que el que decide el botón, hay que decir por qué.
   * Sin esta oración el director lee dos números distintos sobre lo mismo en la
   * misma fila y no tiene forma de saber cuál vale.
   */
  const afuera = documentos - participan
  const porQue =
    afuera <= 0
      ? ""
      : afuera === 1
        ? ` De los ${documentos} que están cargados, 1 es de un asesor pausado o desvinculado y no entra en la ` +
          `comparación.`
        : ` De los ${documentos} que están cargados, ${afuera} son de asesores pausados o desvinculados y no ` +
          `entran en la comparación.`

  return (
    `Para detectar la plantilla hacen falta al menos ${MINIMO_PARA_DETECTAR} documentos de este tipo, de asesores ` +
    `activos, y ${cuantosHay}.${porQue} Comparando menos no se puede distinguir qué parte del contrato es texto ` +
    `fijo y qué parte es el dato de cada persona. Subí este mismo documento a ${cuantosFaltan}.`
  )
}

// ---------------------------------------------------------------------------
// Qué significa cada estado
// ---------------------------------------------------------------------------

/**
 * El renglón ámbar de la fila: cuántos NO se compararon contra la versión
 * vigente. `null` cuando no hay ninguno, y ahí la pantalla no dibuja nada.
 *
 * Estaba escrito a mano adentro del JSX y ningún test lo miraba. Es exactamente
 * lo que ya pasó una vez en la Task 5: se sacó una promesa falsa de un lado y
 * se la reescribió treinta líneas más arriba, en un pedazo de componente sin
 * red — y quedó en la primera línea que lee todo el mundo. Los tests del repo
 * solo miran `lib/**`, así que el texto que el director lee vive acá.
 */
export function textoSinComprobar(sinComprobar: number): string | null {
  if (sinComprobar <= 0) return null
  return sinComprobar === 1
    ? "1 asesor sin comparar contra esta versión"
    : `${sinComprobar} asesores sin comparar contra esta versión`
}

/**
 * El renglón del balde nuevo: cuántos asesores quedaron `pendiente` contra la
 * versión vigente. `null` cuando no hay ninguno.
 *
 * Vive acá y no en el JSX por la regla de siempre —los tests del repo solo
 * miran `lib/**`— y esa regla ya cobró dos veces en esta etapa.
 *
 * Se cuentan ASESORES y no documentos, al revés que el renglón de los
 * desvinculados: acá lo que el director tiene que hacer es cargarle un dato a
 * una persona, así que la unidad que le sirve es la persona.
 */
export function textoPendientes(pendientes: number): string | null {
  if (pendientes <= 0) return null
  return pendientes === 1
    ? "1 asesor con un dato nuevo sin completar"
    : `${pendientes} asesores con un dato nuevo sin completar`
}

/**
 * El renglón del estado intermedio: cuántos ya tienen el documento de la
 * versión nueva. `null` cuando no hay ninguno.
 *
 * Es un renglón VERDE en espíritu, no ámbar: de esas personas está todo hecho y
 * todo comprobado. Lo que falta no es de ellas, es un paso del director.
 */
export function textoYaAplicados(yaAplicados: number): string | null {
  if (yaAplicados <= 0) return null
  return yaAplicados === 1
    ? "1 asesor ya tiene el documento de la versión nueva"
    : `${yaAplicados} asesores ya tienen el documento de la versión nueva`
}

/** Cómo se nombra una versión cuando se sabe su número, y cuando no. */
function comoSeLlamaLaVersion(numero: number | null, siNoSeSabe: string): string {
  return numero === null ? siNoSeSabe : `la versión ${numero}`
}

/**
 * El rótulo del botón que pone en uso la versión ya aplicada.
 *
 * Vive acá, con el resto de la prosa: el aviso de arriba manda al director a
 * apretar "el botón de acá al lado", y si el rótulo se escribiera a mano en el
 * `.tsx` los dos podrían separarse sin que nadie se entere — el aviso nombraría
 * un botón que dice otra cosa.
 */
export function botonDePonerEnUso(versionYaAplicada: number | null): string {
  return versionYaAplicada === null ? "Poner la versión nueva en uso" : `Poner la versión ${versionYaAplicada} en uso`
}

/**
 * El estado intermedio, dicho entero: ya se aplicó y todavía no se puso en uso.
 *
 * ═══ Lo que este aviso reemplaza, que era cuatro veces falso ═══
 *
 * Antes estos asesores caían en `sinComprobar` y la fila decía: *"N asesores no
 * se compararon contra esta versión — o estaban pausados cuando se confirmó, o
 * subieron su documento después. Para esas personas no hay nada comprobado:
 * volvé a detectar la plantilla…"*. Se compararon, no estaban pausados, no
 * subieron nada después, y está todo comprobado. Y la instrucción mandaba a
 * reconstruir la plantilla desde documentos que acababan de salir de la
 * plantilla.
 *
 * Lo que dice ahora es lo que pasa, y termina en lo único que hay que hacer.
 * `null` cuando no hay ninguno.
 */
export function avisoDeYaAplicados(args: {
  yaAplicados: number
  /** El número de la versión vigente. */
  version: number | null
  /** El número de la que ya tienen. */
  versionYaAplicada: number | null
}): string | null {
  const { yaAplicados } = args
  if (yaAplicados <= 0) return null

  const uno = yaAplicados === 1
  const quienes = uno ? "1 asesor ya tiene" : `${yaAplicados} asesores ya tienen`
  const aEsos = uno ? "A esa persona" : "A esas personas"
  const nueva = comoSeLlamaLaVersion(args.versionYaAplicada, "la versión nueva")
  const vieja = comoSeLlamaLaVersion(args.version, "la anterior")

  return (
    `Hay una versión nueva a medio poner: ${quienes} su documento de ${nueva}, y la plantilla todavía usa ` +
    `${vieja}. ${aEsos} no hay que comprobarle nada: su documento salió de la versión nueva y pasó todas las ` +
    `comprobaciones. Lo que falta es poner esa versión en uso, con el botón "${botonDePonerEnUso(args.versionYaAplicada)}".`
  )
}

/**
 * Por qué NO se puede poner en uso desde la fila la versión ya aplicada. `null`
 * cuando sí se puede.
 *
 * Es el hermano de `motivoParaNoPonerEnUso`, que mira la corrida que está
 * pasando adentro del panel; este mira lo que quedó guardado en la base, que es
 * lo único que hay cuando el director cerró el panel y volvió al día siguiente.
 *
 * El primer caso es el mismo freno del arrastrado 4: con cero asesores activos,
 * `activar-version` no tiene a nadie atrás, la activación pasa, y
 * `estadoDeLaPlantilla` con la lista vacía devuelve `borrador` — poner en uso
 * degradaría la plantilla sin que nadie lo hubiera pedido.
 */
export function motivoParaNoPonerEnUsoDesdeLaFila(
  fila: Pick<FilaPlantilla, "yaAplicados" | "pendientes" | "participan">,
): string | null {
  if (fila.yaAplicados <= 0) {
    return "Todavía no hay ninguna versión aplicada que poner en uso."
  }
  if (fila.participan === 0) {
    return (
      "No queda ningún asesor activo con este documento, así que poner la versión en uso dejaría la plantilla " +
      "como borrador. Reactivá a alguien primero."
    )
  }
  if (fila.pendientes > 0) {
    const uno = fila.pendientes === 1
    return (
      `Primero completá el dato que le falta ${uno ? "al asesor" : `a los ${fila.pendientes} asesores`} de acá ` +
      `arriba y volvé a aplicarle${uno ? "" : "s"} la versión. Mientras quede uno así, la versión nueva no se ` +
      `puede poner en uso.`
    )
  }
  return null
}

/**
 * El otro renglón de la fila: cuántos documentos son de asesores
 * desvinculados. `null` cuando no hay ninguno.
 *
 * Se cuentan DOCUMENTOS y no personas a propósito: es la unidad de todo lo
 * demás de esta fila —el mínimo para detectar se cuenta en documentos— y es lo
 * que el director va a ver si entra a buscarlos.
 */
export function textoDesvinculados(desvinculados: number): string | null {
  if (desvinculados <= 0) return null
  return desvinculados === 1
    ? "1 documento de un asesor desvinculado"
    : `${desvinculados} documentos de asesores desvinculados`
}

/**
 * Lo mismo, dicho entero, y qué hacer al respecto: NADA, salvo que el director
 * esté seguro.
 *
 * La instrucción tiene que ser una que él pueda ejecutar. "Volvé a detectar la
 * plantilla" no lo era: el desvinculado no entra en la detección ni en la
 * confirmación, así que ese aviso no se apagaba nunca.
 *
 * Pero "borrá el documento" tampoco sirve como primera opción: **un
 * desvinculado puede volver, y el estado se revierte.** Del lado del director,
 * sin pedirle nada a nadie: la lista de asesores tiene el filtro "eliminado"
 * que lo muestra, el menú le ofrece "Pausar asesor" (solo mira si está
 * `pausado`, no si está `eliminado`) y `requireDirectorSobreAsesor` tampoco
 * filtra por estado, así que Pausar → Reactivar lo deja en `activo`. Del lado
 * de Vakdor, `api/admin-vakdor/usuarios/[id]/desbloquear` lo hace en un paso.
 * Apenas vuelve a estar activo su documento entra otra vez en la detección, y
 * borrarlo es tirar algo que después hay que volver a pedirle a esa persona.
 *
 * Así que la instrucción es la verdad completa: no hay nada que hacer, el aviso
 * es informativo, y borrar es la última opción.
 *
 * **El orden es parte del arreglo.** La primera versión de este texto llegaba
 * al veredicto ("no tenés que hacer nada") recién en la tercera oración, con la
 * explicación entera en 161 palabras dentro de un `<p text-xs>`. Un aviso que
 * no rompe nada tiene que leerse en dos segundos o no se lee: va el veredicto
 * primero y el detalle atrás.
 *
 * ═══ Y la oración que se cayó, que es la mitad de este comentario ═══
 *
 * Hasta hoy esto terminaba con "si igual querés borrarlo, tené en cuenta que
 * con menos de 3 documentos no se puede volver a detectar la plantilla", y era
 * cierto porque el mínimo se contaba sobre `fila.documentos`, que incluía a los
 * desvinculados. Ahora se cuenta sobre `fila.participan`, que no los incluye:
 * borrar el documento de un desvinculado **no cambia nada** del botón. La
 * oración pasó a ser falsa y salió en el mismo commit que cambió el mínimo. El
 * aviso viejo decía OJO con esto en su propio comentario, y esto es ese ojo.
 */
function avisoDeDesvinculados(desvinculados: number): string | null {
  if (desvinculados <= 0) return null
  return desvinculados === 1
    ? "Aparte, hay 1 documento de un asesor desvinculado: no tenés que hacer nada. No entra en ninguna " +
        "comparación ni cuenta para poder detectar la plantilla, y si esa persona vuelve a la inmobiliaria, su " +
        "documento entra solo en la próxima detección."
    : `Aparte, hay ${desvinculados} documentos de asesores desvinculados: no tenés que hacer nada. No entran en ` +
        `ninguna comparación ni cuentan para poder detectar la plantilla, y si esas personas vuelven a la ` +
        `inmobiliaria, sus documentos entran solos en la próxima detección.`
}

/**
 * El aviso del balde nuevo, dicho entero y con lo que hay que hacer.
 *
 * Es el ÚNICO estado de esta pantalla que no significa "algo salió mal": el
 * documento que tiene ese asesor está bien, es el de la versión anterior, y lo
 * que falta es un dato que la versión nueva trajo y que nadie cargó todavía
 * (spec §7.4.2). Por eso no dice "revisá" ni "falló": dice qué falta y quién
 * lo puede completar.
 *
 * Y dice la consecuencia, que es la parte que el director no puede deducir
 * mirando la pantalla: mientras quede uno así, la versión nueva no se puede
 * poner en uso.
 */
function avisoDePendientes(pendientes: number): string | null {
  if (pendientes <= 0) return null
  return pendientes === 1
    ? "A 1 asesor le falta completar un dato que la versión nueva trajo, así que sigue con la versión anterior: " +
        "cargale ese dato y volvé a aplicarle la versión. Hasta que no quede ninguno así, la versión nueva no se " +
        "puede poner en uso."
    : `A ${pendientes} asesores les falta completar un dato que la versión nueva trajo, así que siguen con la ` +
        `versión anterior: cargales ese dato y volvé a aplicarles la versión. Hasta que no quede ninguno así, la ` +
        `versión nueva no se puede poner en uso.`
}

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
export function explicacionDelEstado(
  fila: Pick<FilaPlantilla, "estado" | "version" | "enRojo"> & {
    sinComprobar?: number
    desvinculados?: number
    pendientes?: number
    yaAplicados?: number
    versionYaAplicada?: number | null
  },
): string {
  const sinComprobar = fila.sinComprobar ?? 0
  const avisoPendientes = avisoDePendientes(fila.pendientes ?? 0)
  const avisoDesvinculados = avisoDeDesvinculados(fila.desvinculados ?? 0)
  const yaAplicados = fila.yaAplicados ?? 0
  const avisoYaAplicados = avisoDeYaAplicados({
    yaAplicados,
    version: fila.version,
    versionYaAplicada: fila.versionYaAplicada ?? null,
  })

  if (fila.estado === "activa") {
    /**
     * Ahora sí en presente, y con una afirmación más fuerte que la anterior:
     * `activar-version` **se niega** mientras quede un asesor activo con el
     * documento de otra versión, así que de una fila `activa` es cierto que los
     * documentos de los activos están hechos con esta versión. Los avisos de
     * abajo son los que dicen quién queda por fuera de esa afirmación.
     */
    const enUso =
      "Está en uso: es la versión con la que están hechos los documentos de los asesores activos. Cuando cambie " +
      "el contrato, subí el Word de la versión nueva desde el botón de acá al lado."

    /**
     * ═══ Y la primera línea CAMBIA cuando hay una versión a medio poner ═══
     *
     * "es la versión con la que están hechos los documentos de los asesores
     * activos" era la quinta afirmación falsa del estado intermedio, y la peor
     * ubicada: la primera que se lee. Con gente ya aplicada, los documentos de
     * esos asesores están hechos con la versión NUEVA, no con la vigente.
     *
     * Así que en ese estado el arranque no es "está en uso" sino la verdad
     * completa —quién tiene qué, y qué falta—, y de ahí para abajo se acumulan
     * los avisos de siempre.
     */
    const arranque = avisoYaAplicados ?? enUso

    /**
     * El aviso que faltaba, y el que más caro sale callar.
     *
     * Una plantilla puede quedar `activa` con alguien sin comprobar: el asesor
     * estaba pausado cuando se confirmó (queda afuera por spec §7.5), o subió
     * su documento después. La plantilla es correcta para los que se
     * compararon; para ese, nadie miró nada. Y el día que lo reactiven, su
     * contrato saldría de un molde que nunca se comparó contra su documento.
     *
     * Va ANTES que el aviso de los rojos porque es el que el director no puede
     * deducir solo: un rojo se ve en la ficha del asesor, esto no se ve en
     * ningún lado.
     */
    /**
     * Los avisos se ACUMULAN, no se pisan. Antes el de "sin comparar" cortaba
     * con un `return` y el de los rojos no se decía nunca cuando venían los
     * dos juntos: el director leía uno de los dos problemas y creía que era el
     * único.
     */
    const avisos: string[] = []

    if (sinComprobar > 0) {
      /**
       * Todo el renglón concuerda en número. Con el texto en plural fijo salía
       * "1 asesor no se comparó … o estaban pausados … subieron su documento",
       * que lo lee un director y suena a máquina.
       */
      const uno = sinComprobar === 1
      const quienes = uno ? "1 asesor no se comparó" : `${sinComprobar} asesores no se compararon`
      const porQue = uno
        ? "o estaba pausado cuando se confirmó, o subió su documento después"
        : "o estaban pausados cuando se confirmó, o subieron su documento después"
      const aQuienes = uno ? "el asesor activo" : "los asesores activos"
      const deQuienes = uno ? "esa persona" : "esas personas"
      avisos.push(
        `Ojo: ${quienes} contra esta versión — ${porQue}. Para ${deQuienes} no hay nada comprobado: ` +
          `volvé a detectar la plantilla con ${aQuienes} antes de dar su documento por bueno.`,
      )
    }

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
    if (avisoPendientes) avisos.push(avisoPendientes)

    if (fila.enRojo > 0) {
      avisos.push(
        `Pero ${quienesQuedaron(fila.enRojo)} para revisar, y eso no debería pasar con una plantilla en ` +
          `uso: revisá esos documentos antes de darlos por buenos.`,
      )
    }

    /**
     * ÚLTIMO, y esto se vio en la pantalla y no en un test.
     *
     * Es el único aviso que dice "no tenés que hacer nada". Puesto en el medio
     * —que es donde estaba— partía en dos las dos cosas que el director SÍ
     * tiene que hacer, y con los tres avisos juntos el párrafo se leía como un
     * muro donde lo accionable quedaba a los costados de lo informativo.
     *
     * Lo que hay que hacer va junto y primero; lo que es solo para saber, al
     * final.
     */
    if (avisoDesvinculados) avisos.push(avisoDesvinculados)

    return [arranque, ...avisos].join(" ")
  }

  /**
   * Qué le falta a este borrador para dejar de serlo. Es lo único que depende
   * de en qué punto del camino está, y por eso es lo único que elige una rama.
   */
  const base =
    fila.version === null
      ? "Es un borrador y todavía no se usa: falta detectar la plantilla a partir de los documentos cargados y " +
        "revisarla."
      : fila.enRojo === 0 && sinComprobar === 0
        ? "Es un borrador y todavía no se usa: la plantilla ya está detectada pero falta confirmarla."
        : "Es un borrador y todavía no se usa."

  /**
   * Y de acá para abajo, los avisos se ACUMULAN — igual que en la rama de
   * `activa`, y por el mismo motivo.
   *
   * Esta rama seguía siendo primer-match-gana: con asesores en rojo Y asesores
   * sin comparar, el director leía solo lo de los rojos y creía que ese era
   * todo el problema. Arreglaba los rojos, la plantilla no terminaba de salir,
   * y el otro motivo no aparecía por ningún lado hasta que los rojos llegaban a
   * cero. Es el mismo bug que se arregló arriba, un piso más abajo.
   *
   * El orden es el mismo que en `activa` a propósito: primero lo que el
   * director NO puede deducir mirando otra pantalla.
   */
  const avisos: string[] = []

  /**
   * Y acá también: una plantilla que quedó en borrador puede tener gente ya
   * aplicada a una versión más nueva. Va PRIMERO de los avisos porque es el que
   * dice qué pasó recién y qué falta para terminar.
   */
  if (avisoYaAplicados) avisos.push(avisoYaAplicados)

  /**
   * El de "sin comparar" pide versión: sin una versión guardada no hay contra
   * qué haberse comparado, y lo que hay que hacer —detectar la plantilla— ya lo
   * dice el `base` con todas las letras. Repetirlo sería decir dos veces la
   * misma instrucción con dos redacciones distintas.
   */
  if (sinComprobar > 0 && fila.version !== null) {
    const quienes = sinComprobar === 1 ? "1 asesor no se comparó" : `${sinComprobar} asesores no se compararon`
    avisos.push(
      `${quienes} contra la versión que está guardada. Volvé a detectar la plantilla para ` +
        `incluir${sinComprobar === 1 ? "lo" : "los"}.`,
    )
  }

  if (avisoPendientes) avisos.push(avisoPendientes)

  if (fila.enRojo > 0) {
    avisos.push(
      `${quienesQuedaron(fila.enRojo)} para revisar. Hasta que estén todos bien, la plantilla no se aplica a nadie.`,
    )
  }

  // Último, por lo mismo que en la rama `activa`: lo accionable junto y
  // primero, lo informativo al final.
  if (avisoDesvinculados) avisos.push(avisoDesvinculados)

  return [base, ...avisos].join(" ")
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
 * Rige la misma regla que `PARA_QUE_SIRVE`: no se puede describir en presente
 * algo que todavía no pasa.
 *
 * OJO con este comentario, que estuvo desactualizado: decía que lo vigilaba
 * `PROMESA_EN_PRESENTE` en `plantillas.test.ts`, **y esa guardia ya no existe**
 * — se borró en la 7b-2, en el mismo commit que hizo andar la generación de
 * punta a punta. Un comentario que promete una red que no está es peor que no
 * tener comentario: el que lo lee cree que puede escribir tranquilo.
 *
 * Lo que sí queda cuidándolo: este texto es de la pantalla de REVISIÓN, donde
 * efectivamente no se genera nada — se compara y se propone. Si alguna vez
 * dijera que acá se genera un documento, sería falso igual.
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
 * Qué mira la comprobación y qué NO puede arreglar sola, dicho de frente.
 *
 * Mira TODO el texto del paquete: cuerpo, encabezado, pie, notas al pie, notas
 * al final, comentarios y lo que haya dentro de un cuadro de texto. Antes
 * miraba solo el cuerpo —mammoth no trae el resto— y eso dejaba pasar en VERDE
 * un dato de encabezado que salía con el número de otra persona.
 *
 * Lo que cambia según dónde esté el dato NO es si se compara, sino si puede
 * convertirse en campo: la detección compara CUERPOS, así que nada que viva
 * afuera del cuerpo llega a ser campo nunca. Si ahí hay un dato distinto por
 * persona, la comparación lo pone en rojo con el motivo y el arreglo es en el
 * Word. Eso es lo que hay que decirle al director, y es lo único que puede
 * hacer.
 *
 * La versión anterior de esta frase prometía "te lo avisamos aparte" para las
 * notas al final, y era falso: no había ningún aviso en ninguna parte. Ahora
 * la promesa es más fuerte y sí se cumple — sale en rojo, con nombre.
 */
export const LIMITE_DE_LA_COMPROBACION =
  "La comprobación mira todo el texto del contrato: el cuerpo, el encabezado, el pie de página, las notas al pie, " +
  "las notas al final, los comentarios de Word y los cuadros de texto. Ahora bien, los campos salen del CUERPO: si " +
  "hay un dato distinto por persona fuera del cuerpo, no se puede convertir en campo y va a quedar en rojo con el " +
  "motivo. Eso se arregla en el Word."

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

// ---------------------------------------------------------------------------
// LA VERSIÓN NUEVA (spec §7.4 y §7.5)
// ---------------------------------------------------------------------------

/**
 * Todo lo que lee el director en la pantalla de la versión nueva vive acá, por
 * los dos motivos de siempre y que se suman:
 *
 *  · los tests del repo solo miran `lib/**`, y en esta etapa una promesa falsa
 *    escrita a mano en un `.tsx` pasó una ronda entera sin que nadie la viera;
 *  · este archivo lo carga el NAVEGADOR y no importa nada pesado. Los textos
 *    del SERVIDOR —los avisos de campos nuevos, desaparecidos, repetidos, la
 *    cuenta cruzada— ya vienen escritos adentro de la respuesta del endpoint
 *    (`version-nueva.ts`), y la pantalla los muestra tal cual. Acá está solo lo
 *    que el servidor no puede decir porque no lo sabe: lo que pasa antes de
 *    mandar el pedido y lo que pasa entre un pedido y el siguiente.
 */

/** Qué es esta pantalla, arriba de todo. */
export const PARA_QUE_SIRVE_LA_VERSION_NUEVA =
  "Cambió el contrato y hay que rehacerle el documento a todos. Subís el Word una sola vez, mirás cómo queda, y " +
  "recién si está bien se lo aplicás a cada asesor con sus propios datos."

/**
 * Cómo tiene que estar el archivo (spec §7.4.1), dicho ANTES de elegirlo.
 *
 * Es la condición más rara de todo el flujo y la que más rechazos genera: no se
 * sube una plantilla con huecos, se sube el contrato nuevo **ya completado con
 * los datos de una persona**. El endpoint la explica cuando rechaza; decirla
 * antes es la diferencia entre que el director la lea una vez o que la
 * descubra fallando.
 */
export const COMO_TIENE_QUE_SER_EL_ARCHIVO =
  "El Word tiene que ser la versión nueva YA COMPLETADA con los datos de uno de tus asesores, y abajo tenés que " +
  "decir cuál. No es un archivo con los campos en blanco: PRISMA busca los datos de esa persona adentro del " +
  "documento, y donde los encuentra sabe que ahí va un dato de cada uno. Si un campo es nuevo y todavía no lo " +
  "tiene nadie, escribilo en el Word entre llaves dobles, así: {{COMISION}}."

/**
 * Por qué NO se puede subir una versión nueva todavía. `null` cuando sí se
 * puede.
 *
 * Un botón deshabilitado que no dice por qué es lo mismo que un botón roto, y
 * acá el motivo no es adivinable: la versión nueva se lee comparando contra la
 * VIGENTE, así que sin una plantilla ya detectada y confirmada no hay contra
 * qué comparar. Es la misma negativa que devuelve el endpoint
 * (`SIN_VERSION_VIGENTE`), dicha antes de que el director elija el archivo.
 */
export function motivoParaNoSubirVersion(
  fila: Pick<FilaPlantilla, "version" | "estado">,
): string | null {
  if (fila.version === null) {
    return (
      "Para subir una versión nueva primero tiene que haber una versión vigente contra la cual compararla. " +
      "Detectá la plantilla con los documentos que ya tenés cargados y confirmala; después vas a poder subir " +
      "versiones nuevas desde acá."
    )
  }
  if (fila.estado !== "activa") {
    return (
      "Esta plantilla está en borrador: todavía no quedó confirmada, así que no se le puede subir una versión " +
      "nueva encima. Terminá de resolver lo que dice acá arriba y confirmala primero."
    )
  }
  return null
}

/**
 * El archivo elegido, para que el director vea que sigue ahí.
 *
 * ═══ Por qué esto es un renglón y no un detalle ═══
 *
 * El servidor **borra el archivo apenas lo lee**, salga bien o salga mal, así
 * que cualquier reintento tiene que volver a subirlo. La pantalla se queda con
 * el archivo en memoria justo para eso: si el director no tiene que volver a
 * buscarlo en el disco después de cada rechazo, hay que decírselo, porque
 * "elegí un archivo" con un error rojo al lado se lee como que hay que empezar
 * de cero.
 */
export function textoDelArchivoElegido(nombre: string, bytes: number): string {
  const kb = bytes / 1024
  const tamano = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`
  return `${nombre} · ${tamano}`
}

/** Y el aviso de que sigue elegido, para después de un rechazo. */
export const EL_ARCHIVO_SIGUE_ELEGIDO =
  "El archivo que elegiste sigue acá: arreglá lo de arriba en el Word, volvé a elegirlo si lo cambiaste, y probá " +
  "de nuevo. No hace falta empezar de cero."

/**
 * Quiénes pueden ser el asesor de referencia, y qué pasa si no hay ninguno.
 *
 * `null` cuando sí hay. Pausados y desvinculados no pueden serlo (spec §7.5, y
 * el endpoint lo rechaza): sus datos no pueden ser la referencia con la que se
 * lee la versión nueva de toda la inmobiliaria.
 */
export function motivoParaNoElegirAsesor(activosConDocumento: number): string | null {
  if (activosConDocumento > 0) return null
  return (
    "No hay ningún asesor activo con este documento cargado, así que no hay datos conocidos con los que leer la " +
    "versión nueva. Reactivá a alguno, o subile este documento a un asesor activo."
  )
}

/**
 * Quiénes NO están en la lista de asesores, y por qué. `null` cuando están
 * todos.
 *
 * Un asesor que el director ve en la solapa y no encuentra acá es una pregunta
 * sin respuesta; el spec §7.5 los deja afuera y eso se dice, no se esconde.
 *
 * Estaba escrito a mano adentro del JSX —la única excepción que había quedado a
 * la regla de esta etapa— y no hay motivo para que lo sea: los tests del repo
 * solo miran `lib/**`, y una excepción es el precedente de la siguiente.
 */
export function textoDeLosQueQuedanAfuera(nombres: string[]): string | null {
  if (nombres.length === 0) return null
  if (nombres.length === 1) {
    return (
      `${nombres[0]} no está en la lista: está pausado o desvinculado, así que su documento queda archivado como ` +
      `está y no entra en esto.`
    )
  }
  return (
    `${nombres.length} asesores no están en la lista (${nombres.join(", ")}): están pausados o desvinculados, ` +
    `así que sus documentos quedan archivados como están y no entran en esto.`
  )
}

/** El rótulo de la lista de campos que la versión nueva trae y antes no había. */
export function tituloDeCamposNuevos(cuantos: number): string {
  return cuantos === 1 ? "1 campo nuevo" : `${cuantos} campos nuevos`
}

/** El rótulo de los que ya no están. */
export function tituloDeCamposDesaparecidos(cuantos: number): string {
  return cuantos === 1 ? "1 campo que ya no está" : `${cuantos} campos que ya no están`
}

/** Qué es la vista previa (spec §7.4.3), y por qué hay que mirarla. */
export function tituloDeLaVistaPrevia(nombreDelAsesor: string): string {
  return `Así queda el documento de ${nombreDelAsesor} con la versión nueva`
}

export const PARA_QUE_SIRVE_LA_VISTA_PREVIA =
  "Es el texto del documento armado con la versión nueva y los datos de esa persona. Leelo: es lo último que se " +
  "puede mirar antes de que esto se convierta en el contrato de todos. Si algún dato aparece donde iba una frase " +
  "del contrato, arreglá el Word y volvé a subirlo."

/**
 * Que todavía no se aplicó nada. Va en la barra de abajo, siempre visible.
 *
 * Es el hermano de `NADA_SE_GUARDA_TODAVIA` de la §7.2 y existe por lo mismo:
 * ver la versión leída, con sus campos y su vista previa, se lee como que el
 * cambio ya está hecho. No lo está — el spec §7.4.4 dice que el reemplazo va
 * "recién con el OK explícito", y ese OK es el botón de al lado.
 */
export const NADA_SE_APLICO_TODAVIA =
  "La versión quedó guardada pero todavía no se le aplicó a nadie: cada asesor sigue con el documento que tiene " +
  "hoy. Al aplicar, PRISMA le arma el documento nuevo a cada uno con sus datos."

/**
 * Cómo corre el reemplazo (spec §7.5), dicho antes de arrancar.
 *
 * Las tres cosas que el director tiene que saber para no asustarse en el medio:
 * va de a uno, uno que falla no voltea a los otros, y no hay que tocar nada
 * mientras corre.
 */
export const COMO_SE_APLICA =
  "Se aplica de a un asesor por vez. Si a alguno le falta un dato o algo no cierra, ese queda con su documento de " +
  "antes y los demás siguen igual: ninguno se lleva puesto al otro. No cierres esta pantalla mientras corre."

/** Cómo terminó cada asesor. Es lo que la pantalla pinta y lo que se cuenta. */
export type ResultadoDeAplicacion = "esperando" | "corriendo" | "ok" | "pendiente" | "frenado" | "error"

/**
 * Cómo se lee la respuesta de `POST /aplicar-version/{advisorId}`.
 *
 * ═══ Vive acá y no adentro del componente porque es una DECISIÓN ═══
 *
 * El 200 tiene dos formas y confundirlas cuenta un pendiente como si estuviera
 * hecho: con la traducción rota, la pantalla diría *"Listo: los 3 asesores
 * activos ya tienen su documento de la versión nueva"* con uno en `pendiente`
 * —que llega con 200 y NO tiene documento nuevo— y habilitaría "Poner esta
 * versión en uso", que se comería un 409.
 *
 * Estaba escrita a mano adentro del `.tsx` y no la miraba ningún test: medido
 * por la revisión, devolver `"ok"` a secas dejaba los 1337 en verde. Es
 * exactamente lo que este archivo existe para evitar.
 *
 * Se falla del lado seguro en las dos puntas: un 200 sin `estado` reconocible NO
 * se cuenta como hecho, y cualquier respuesta que no sea 200 ni 409 es un error,
 * no un pendiente.
 */
export function resultadoDeLaAplicacion(args: {
  ok: boolean
  status: number
  /** `estado` del cuerpo, tal como vino: es `unknown` de verdad. */
  estado: unknown
}): ResultadoDeAplicacion {
  if (args.ok) {
    /**
     * `'ok'` es lo único que significa "su documento nuevo está escrito".
     * `'pendiente'` y `'revisar'` —el segundo cuando ya estaba en rojo— son
     * "le falta un dato y sigue con la versión anterior" (spec §7.4.2).
     */
    return args.estado === "ok" ? "ok" : "pendiente"
  }
  /** El 409 es LA RED: alguna de las cinco comprobaciones frenó la escritura. */
  if (args.status === 409) return "frenado"
  return "error"
}

/**
 * Le aplica la versión a cada asesor, **de a uno y en serie** (spec §7.5).
 *
 * ═══ Por qué esto no puede vivir adentro del componente ═══
 *
 * El §7.5 pide cuatro cosas, y ésta es la que más caro sale romper: *"para que
 * uno que falla no voltee a los otros"*. Estaba escrita como un `for…of` adentro
 * del panel, y medido por la revisión: agregarle un `break` cuando un asesor no
 * sale `ok` **dejaba los 1337 tests en verde**. El panel no se puede dibujar en
 * un test (el `Sheet` de Radix necesita un DOM), así que la regla se muda acá,
 * donde sí se puede correr.
 *
 * `aplicar` NUNCA tiene que tirar: quien la escribe es el que traduce la
 * respuesta, y una excepción suya cortaría el bucle igual que un `break`. Por
 * las dudas se la envuelve, y el que tira cuenta como `error` — nunca como
 * motivo para dejar a los demás sin su documento.
 *
 * `alEmpezar` y `alTerminar` son los que pintan la fila: sin ellos no hay
 * progreso que mostrar, que es la otra exigencia del §7.5.
 */
export async function aplicarDeAUno<T>(args: {
  asesores: T[]
  aplicar: (asesor: T) => Promise<{ estado: ResultadoDeAplicacion; mensaje: string | null }>
  alEmpezar: (asesor: T) => void
  alTerminar: (asesor: T, resultado: { estado: ResultadoDeAplicacion; mensaje: string | null }) => void
}): Promise<void> {
  for (const asesor of args.asesores) {
    args.alEmpezar(asesor)
    let resultado: { estado: ResultadoDeAplicacion; mensaje: string | null }
    try {
      resultado = await args.aplicar(asesor)
    } catch {
      resultado = {
        estado: "error",
        mensaje: "No se pudo hablar con el servidor. Revisá la conexión y probá con esta persona de nuevo.",
      }
    }
    args.alTerminar(asesor, resultado)
  }
}

/** La etiqueta corta de cada estado, la que va al lado del nombre. */
export function etiquetaDeResultado(estado: ResultadoDeAplicacion): string {
  switch (estado) {
    case "esperando":
      return "Todavía no"
    case "corriendo":
      return "Armando su documento…"
    case "ok":
      return "Listo"
    case "pendiente":
      return "Le falta un dato"
    case "frenado":
      return "Se frenó"
    case "error":
      return "No se pudo"
  }
}

/**
 * El renglón de arriba del progreso: cuántos van, y qué pasó con los que no
 * salieron bien.
 *
 * Dice el número Y la consecuencia, igual que el resto de esta etapa. "3 de 5"
 * sin decir qué pasó con los otros dos deja al director mirando una barra que
 * no llega al final y sin saber si tiene que hacer algo.
 */
export function resumenDelProgreso(args: {
  total: number
  ok: number
  pendientes: number
  frenados: number
  errores: number
}): string {
  const { total, ok, pendientes, frenados, errores } = args
  const hechos = ok + pendientes + frenados + errores

  if (hechos < total) {
    return `Aplicando: ${hechos} de ${total}. Esperá a que termine.`
  }

  const problemas = pendientes + frenados + errores
  if (problemas === 0) {
    return total === 1
      ? "Listo: el único asesor activo ya tiene su documento de la versión nueva."
      : `Listo: los ${total} asesores activos ya tienen su documento de la versión nueva.`
  }

  const detalle: string[] = []
  if (pendientes > 0) {
    detalle.push(
      pendientes === 1 ? "a 1 le falta cargar un dato" : `a ${pendientes} les falta cargar un dato`,
    )
  }
  if (frenados > 0) detalle.push(frenados === 1 ? "1 se frenó" : `${frenados} se frenaron`)
  if (errores > 0) detalle.push(errores === 1 ? "1 no se pudo intentar" : `${errores} no se pudieron intentar`)

  return (
    `${ok} de ${total} quedaron con la versión nueva, y ${detalle.join(", ")}. Los que no salieron siguen con el ` +
    `documento que tenían: leé el motivo de cada uno acá abajo, arreglá lo que haga falta y volvé a intentar con ` +
    `esa persona.`
  )
}

/**
 * Por qué NO se puede poner en uso la versión todavía. `null` cuando sí se
 * puede.
 *
 * ═══ El primer caso es un freno que la pantalla agrega, no uno que existía ═══
 *
 * `activar-version` solo exige que ningún asesor ACTIVO quede atrás. Con cero
 * asesores activos esa condición se cumple sola: la versión se activaría, y el
 * `estado` que calcula `estadoDeLaPlantilla` con la lista vacía es `borrador`
 * — o sea que poner en uso una versión **degradaría la plantilla de `activa` a
 * `borrador`** sin que nadie hubiera pedido eso. Hoy ese camino no se puede
 * alcanzar desde ninguna pantalla; esta pantalla es la primera que podría
 * alcanzarlo, así que lo frena de este lado antes de mandar el pedido.
 */
export function motivoParaNoPonerEnUso(args: {
  total: number
  ok: number
}): string | null {
  if (args.total === 0) {
    return (
      "No hay ningún asesor activo con este documento, así que no hay a quién aplicarle la versión y no tiene " +
      "sentido ponerla en uso: la plantilla volvería a quedar como borrador. Reactivá a alguien o subile el " +
      "documento a un asesor activo."
    )
  }
  if (args.ok < args.total) {
    const faltan = args.total - args.ok
    return (
      `Todavía no: ${faltan === 1 ? "queda 1 asesor" : `quedan ${faltan} asesores`} con el documento de la ` +
      `versión anterior. Si esta versión se pusiera en uso igual, la pantalla diría que están todos en la nueva ` +
      `mientras su contrato sigue siendo el viejo.`
    )
  }
  return null
}

/** Qué significa poner en uso, al lado del botón. */
export const PARA_QUE_SIRVE_PONER_EN_USO =
  "Poner en uso hace que esta pase a ser la versión vigente de la plantilla. La anterior no se borra: queda " +
  "archivada por si hay que volver atrás."

/**
 * El rótulo de los que faltan cuando el servidor se niega a activar.
 *
 * El mensaje del endpoint ya los nombra, y aun así la pantalla los lista
 * aparte: el pedido devuelve los ids en `faltan`, y traducirlos a nombres es lo
 * único que convierte "quedan 2 asesores" en algo sobre lo que el director
 * pueda actuar sin salir a buscar quiénes son.
 */
export function tituloDeLosQueFaltan(cuantos: number): string {
  return cuantos === 1 ? "Falta este asesor:" : `Faltan estos ${cuantos} asesores:`
}

/**
 * Los asesores de un tipo de documento, tal como la pantalla los necesita.
 *
 * Sale de cruzar los documentos con los perfiles, que es lo que la solapa ya
 * trae. Vive acá y no adentro del componente por lo de siempre: es la lista de
 * a quién se le va a escribir un contrato, y decidir mal quién entra es
 * exactamente el tipo de error que no se ve hasta que alguien firma.
 */
export type AsesorDeLaPlantilla = {
  advisorId: string
  nombre: string
  /** Si entra en la comparación y en la aplicación (spec §7.5). */
  participa: boolean
}

/** El nombre con el que se le habla al director. Nunca un uuid pelado. */
const SIN_NOMBRE = "Asesor sin nombre cargado"

/**
 * Quiénes tienen este tipo de documento, ordenados por nombre.
 *
 * El orden es por nombre y no por el que venga de la base: el director busca a
 * una persona en una lista, y una lista que cambia de orden entre dos recargas
 * lo obliga a leerla entera cada vez.
 */
export function asesoresDeLaPlantilla(args: {
  templateId: string
  documentos: DocumentoCrudo[]
  asesores: Array<AsesorCrudo & { full_name?: string | null }>
}): AsesorDeLaPlantilla[] {
  const perfil = new Map(args.asesores.map((a) => [a.id, a]))
  const vistos = new Set<string>()
  const salida: AsesorDeLaPlantilla[] = []

  for (const doc of args.documentos) {
    if (doc.template_id !== args.templateId) continue
    if (vistos.has(doc.advisor_id)) continue
    vistos.add(doc.advisor_id)
    const p = perfil.get(doc.advisor_id)
    salida.push({
      advisorId: doc.advisor_id,
      nombre: p?.full_name?.trim() || SIN_NOMBRE,
      /**
       * El que no aparece en la lista de perfiles NO participa, igual que en
       * `participan`: los dos endpoints lo dejan afuera, así que incluirlo
       * llevaría al director a pedir algo que va a fallar.
       */
      participa: p !== undefined && participaEnLaComparacion(p.estado),
    })
  }

  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

// ---------------------------------------------------------------------------
// El mismo dato escrito dos veces
// ---------------------------------------------------------------------------

/**
 * Vive acá y no en `confirmacion.ts` por el mismo motivo que el resto de este
 * archivo: lo necesita el NAVEGADOR. La barra de la pantalla de revisión tiene
 * que decir cuántos campos se van a guardar de verdad, y eso depende de esta
 * fusión — decir "23" cuando se guardan 8 es un número que miente. El tipo
 * viene con `import type`, que desaparece al compilar y no arrastra nada.
 */
/**
 * Junta en uno solo los huecos que son EL MISMO DATO escrito dos veces.
 *
 * El caso, que es el más común de todos en un contrato: el nombre del asesor
 * aparece en la cláusula de arriba y otra vez en la firma. La detección los ve
 * como dos lugares distintos y propone dos campos.
 *
 * Por qué hay que juntarlos, y no es una prolijidad: `ponerHuecosEnDocx`
 * reemplaza TODAS las apariciones de cada texto —está escrito así a propósito,
 * "si el nombre está en la cláusula y en la firma, las dos tienen que cambiar"—.
 * Así que el primer campo se lleva los dos lugares y el segundo se queda sin
 * ninguno. El documento sale bien (los dos lugares dicen lo que tienen que
 * decir), pero queda un campo de adorno: uno que va a figurar en el formulario
 * de la plantilla y que editarlo no va a cambiar nada. Y, peor, el segundo
 * aparecería como "no se pudo marcar" y trabaría la plantilla entera por algo
 * que no está mal.
 *
 * La condición para juntar es dura: los dos tienen que tener EXACTAMENTE el
 * mismo texto para TODOS los asesores. Si difieren aunque sea en uno, son dos
 * datos distintos que casualmente coinciden en el documento molde — y eso sí es
 * un problema, porque el .docx no tiene cómo distinguir dos textos idénticos.
 * En ese caso no se juntan, el segundo queda sin marcar y la verificación lo
 * pone en rojo, que es lo correcto.
 *
 * Un hueco sin ningún valor no se junta con nada: no hay con qué comparar.
 */
export function fusionarHuecosIguales(huecos: PropuestaHueco[]): {
  huecos: PropuestaHueco[]
  advertencias: string[]
} {
  const porContenido = new Map<string, PropuestaHueco>()
  const salida: PropuestaHueco[] = []
  const advertencias: string[] = []

  for (const h of huecos) {
    const claves = Object.keys(h.valores).sort()
    if (claves.length === 0) {
      salida.push(h)
      continue
    }
    const firma = JSON.stringify(claves.map((k) => [k, h.valores[k]]))

    const yaEsta = porContenido.get(firma)
    if (yaEsta) {
      advertencias.push(
        `"${h.nombre.trim() || h.id}" dice exactamente lo mismo que "${yaEsta.nombre.trim() || yaEsta.id}" en ` +
          `todos los asesores: se guarda un campo solo, y ese dato se escribe en los dos lugares del contrato.`,
      )
      continue
    }
    porContenido.set(firma, h)
    salida.push(h)
  }

  return { huecos: salida, advertencias }
}
