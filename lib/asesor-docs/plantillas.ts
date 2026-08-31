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
   * NO entran acá los desvinculados: tienen su propio balde, abajo.
   */
  sinComprobar: number
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
 * Se compara normalizado igual que en `separarPorEstado`: la columna es texto
 * libre, y un " Eliminado" con mayúscula dejaría al asesor del lado equivocado
 * justo en el balde que existe para no mentirle al director.
 */
function estaDesvinculado(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === ESTADO_DESVINCULADO
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

  const total = new Map<string, number>()
  const rojos = new Map<string, number>()
  const sinComprobar = new Map<string, number>()
  const desvinculados = new Map<string, number>()
  const sumar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

  for (const doc of args.documentos) {
    sumar(total, doc.template_id)

    /**
     * Antes que todo lo demás: el documento de un desvinculado no cuenta ni en
     * rojo ni en sin comprobar. Los dos avisos terminan en una instrucción
     * ("revisá esos documentos", "volvé a detectar con los activos") que sobre
     * un desvinculado no cambia nada, porque no entra ni en la detección ni en
     * la confirmación (spec §7.5). Lo único ejecutable es borrar el documento.
     */
    if (desvinculado.has(doc.advisor_id)) {
      sumar(desvinculados, doc.template_id)
      continue
    }

    const vigente = vigentePorTipo.get(doc.template_id) ?? null

    if (doc.version_id !== null && doc.version_id === vigente) {
      // Comprobado contra la versión que está en uso: su estado vale.
      if (doc.estado === "revisar") sumar(rojos, doc.template_id)
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
      enRojo: rojos.get(t.id) ?? 0,
      sinComprobar: sinComprobar.get(t.id) ?? 0,
      desvinculados: desvinculados.get(t.id) ?? 0,
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
 * Pero "borrá el documento" tampoco sirve como primera opción, por dos motivos
 * medidos:
 *
 *  · **un desvinculado puede volver.** El director lo reactiva él solo
 *    (`usuarios/[id]/desbloquear` pide `estado === 'eliminado'` y lo deja en
 *    `activo`), y apenas vuelve a estar activo su documento entra otra vez en
 *    la detección. Borrarlo es tirar algo que puede hacer falta la semana que
 *    viene, y que después hay que pedirle de nuevo a esa persona.
 *  · **borrar se pega un tiro en el pie.** El documento del desvinculado
 *    igual cuenta para el mínimo de `MINIMO_PARA_DETECTAR`: si la
 *    inmobiliaria tenía justo 3, borrarlo deja el botón "Detectar plantilla"
 *    deshabilitado y el director se queda sin poder hacer nada.
 *
 * Así que la instrucción es la verdad completa: no hay nada que hacer, el aviso
 * es informativo, y borrar es la última opción — con la advertencia del mínimo
 * al lado, que es la parte que no se puede deducir mirando la pantalla.
 */
function avisoDeDesvinculados(desvinculados: number): string | null {
  if (desvinculados <= 0) return null
  return desvinculados === 1
    ? "Aparte, hay 1 documento de un asesor desvinculado: no entra en ninguna comparación, y volver a detectar la " +
        "plantilla no lo va a cambiar. No tenés que hacer nada — si esa persona vuelve a la inmobiliaria, su " +
        "documento entra solo en la próxima detección. Borralo desde su ficha únicamente si estás seguro de que no " +
        `vuelve, y teniendo en cuenta que con menos de ${MINIMO_PARA_DETECTAR} documentos no se puede volver a ` +
        `detectar la plantilla.`
    : `Aparte, hay ${desvinculados} documentos de asesores desvinculados: no entran en ninguna comparación, y ` +
        `volver a detectar la plantilla no los va a cambiar. No tenés que hacer nada — si esas personas vuelven a ` +
        `la inmobiliaria, sus documentos entran solos en la próxima detección. Borralos desde sus fichas ` +
        `únicamente si estás seguro de que no vuelven, y teniendo en cuenta que con menos de ` +
        `${MINIMO_PARA_DETECTAR} documentos no se puede volver a detectar la plantilla.`
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
  fila: Pick<FilaPlantilla, "estado" | "version" | "enRojo"> & { sinComprobar?: number; desvinculados?: number },
): string {
  const sinComprobar = fila.sinComprobar ?? 0
  const avisoDesvinculados = avisoDeDesvinculados(fila.desvinculados ?? 0)

  if (fila.estado === "activa") {
    /**
     * "…se generan con esta versión" decía en presente lo mismo que el párrafo
     * de arriba: que PRISMA ya le arma el documento a cada asesor. No lo hace
     * (ver `PARA_QUE_SIRVE`). Lo que SÍ es cierto de una fila `activa` es que
     * esta versión quedó confirmada; generar con ella viene después.
     */
    const enUso = "Está en uso: es la versión confirmada. Con ella se le va a generar el documento a cada asesor."

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

    if (avisoDesvinculados) avisos.push(avisoDesvinculados)

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
    if (fila.enRojo > 0) {
      avisos.push(
        `Pero ${quienesQuedaron(fila.enRojo)} para revisar, y eso no debería pasar con una plantilla en ` +
          `uso: revisá esos documentos antes de darlos por buenos.`,
      )
    }

    return [enUso, ...avisos].join(" ")
  }

  const base = (() => {
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
    if (sinComprobar > 0) {
      const quienes = sinComprobar === 1 ? "1 asesor no se comparó" : `${sinComprobar} asesores no se compararon`
      return (
        `Es un borrador y todavía no se usa: ${quienes} contra la versión que está guardada. Volvé a detectar la ` +
        `plantilla para incluir${sinComprobar === 1 ? "lo" : "los"}.`
      )
    }
    return "Es un borrador y todavía no se usa: la plantilla ya está detectada pero falta confirmarla."
  })()

  return avisoDesvinculados ? `${base} ${avisoDesvinculados}` : base
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
