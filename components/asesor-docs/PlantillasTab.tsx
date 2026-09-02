"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileStack, Loader2, RotateCcw, Sparkles, Users, UserMinus, AlertTriangle, Info, FileUp, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { BloqueError } from "@/components/asesor-docs/DocumentosDelAsesor";
import { RevisionPlantilla } from "@/components/asesor-docs/RevisionPlantilla";
import { VersionNueva } from "@/components/asesor-docs/VersionNueva";
import {
  armarFilas,
  asesoresDeLaPlantilla,
  botonDePonerEnUso,
  explicacionDelEstado,
  motivoParaNoDetectar,
  motivoParaNoPonerEnUsoDesdeLaFila,
  motivoParaNoSubirVersion,
  PARA_QUE_SIRVE,
  textoDesvinculados,
  textoPendientes,
  textoSinComprobar,
  textoYaAplicados,
  type AsesorCrudo,
  type DocumentoCrudo,
  type FilaPlantilla,
  type TipoCrudo,
  type VersionCruda,
} from "@/lib/asesor-docs/plantillas";
// Solo el tipo: `import type` desaparece al compilar, así que traerlo NO
// arrastra al navegador la librería de comparación de textos que hay del otro
// lado de ese archivo.
import type { Propuesta } from "@/lib/asesor-docs/propuesta";

/**
 * La solapa "Plantillas": una fila por tipo de documento de la inmobiliaria.
 *
 * **Acá NO se recibe ni se manda el `agency_id`.** Ni como prop ni en el
 * cuerpo del pedido. Las tres consultas van sin filtro de inmobiliaria a
 * propósito: las políticas de la base ya devuelven únicamente las filas de la
 * agencia del director que está mirando, y el endpoint de detectar saca la
 * agencia de la sesión del servidor. Un id de agencia que viaja desde el
 * navegador es un id que el navegador puede cambiar; el 26-ago-2026 se cerró
 * en producción un agujero exactamente así.
 */

/** Cómo se ve cada estado. El texto largo lo pone `explicacionDelEstado`. */
const PINTA_DEL_ESTADO: Record<FilaPlantilla["estado"], string> = {
  activa: "bg-green-500/10 text-green-600 border-green-500/20",
  borrador: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

const ETIQUETA_DEL_ESTADO: Record<FilaPlantilla["estado"], string> = {
  activa: "Activa",
  borrador: "Borrador",
};

/**
 * El texto de "para qué sirve esta pantalla" NO se escribe acá: vive en
 * `lib/asesor-docs/plantillas.ts` junto con el resto de la prosa, que es donde
 * los tests lo alcanzan. Se muestra en dos lugares —fijo en el escritorio,
 * adentro del scroll en el celular— y una sola constante evita que las dos
 * copias se editen por separado y terminen diciendo cosas distintas.
 */

export function PlantillasTab() {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  /**
   * Distinto de "no hay plantillas": una consulta que falla (la conexión, los
   * permisos, el tope de 8 s del rol) NO es una lista vacía. Confundirlos hace
   * que el director crea que no tiene nada cargado cuando en realidad no se
   * pudo averiguar — el peor tipo de fallo, porque se disfraza de dato.
   */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaPlantilla[]>([]);

  const [detectandoId, setDetectandoId] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<{ fila: FilaPlantilla; datos: Propuesta } | null>(null);
  /**
   * Qué fila tiene abierta la pantalla de la versión nueva. Una sola por vez:
   * son dos endpoints que escriben, y dos aplicaciones en paralelo sobre la
   * misma inmobiliaria no tienen para qué existir.
   */
  const [subiendoVersionEn, setSubiendoVersionEn] = useState<string | null>(null);
  /** Qué fila está poniendo su versión en uso ahora mismo. */
  const [activandoEn, setActivandoEn] = useState<string | null>(null);
  /**
   * Los crudos se guardan además de las filas armadas: la pantalla de la
   * versión nueva necesita saber QUIÉNES son los asesores de ese tipo de
   * documento —con nombre y estado— y eso no entra en un contador. Se cruzan
   * con `asesoresDeLaPlantilla`, que vive en lib y está bajo test.
   */
  const [documentos, setDocumentos] = useState<DocumentoCrudo[]>([]);
  const [asesores, setAsesores] = useState<Array<AsesorCrudo & { full_name?: string | null }>>([]);

  /** Cuando la lista se cae, los crudos se caen con ella: ver `vaciar`. */
  const vaciar = useCallback(() => {
    setFilas([]);
    /**
     * Dejar los crudos pegados haría que la pantalla de la versión nueva
     * pudiera abrirse con una lista de asesores vieja — y esa lista decide a
     * quién se le escribe un contrato.
     */
    setDocumentos([]);
    setAsesores([]);
    setSubiendoVersionEn(null);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      /**
       * Tres consultas sueltas y no un join. Entre `advisor_doc_templates` y
       * `advisor_doc_template_versions` hay DOS caminos (la versión apunta al
       * tipo, y el tipo apunta a su versión vigente), así que un join anidado
       * hay que desambiguarlo a mano y se rompe en silencio si mañana cambia
       * una clave. Las tres tablas son chicas: son de una inmobiliaria.
       */
      const [t, v, d] = await Promise.all([
        supabase.from("advisor_doc_templates").select("id, nombre, estado, version_actual"),
        supabase.from("advisor_doc_template_versions").select("id, version"),
        // `version_id` no es opcional acá: sin él no se puede saber si un
        // "revisar" es de la versión que está en uso o de una vieja, y por ahí
        // se colaba una plantilla "Activa" con un asesor sin comprobar.
        // `advisor_id` tampoco: sin él no se sabe si el dueño del documento
        // sigue en la inmobiliaria, y el de un desvinculado se quedaba con un
        // aviso ámbar que no se apagaba nunca.
        //
        // Y `observacion` no se MUESTRA acá —es un párrafo largo por asesor y
        // va en su ficha— pero sí se mira: es el único lugar donde consta que
        // a un asesor que quedó en rojo le falta ADEMÁS un dato de la versión
        // nueva. Sin ella ese caso no cae en ningún balde y la solapa no lo
        // nombra en ningún lado. Ver `esperaUnDato` en lib.
        supabase.from("advisor_documents").select("template_id, estado, version_id, advisor_id, observacion"),
      ]);

      if (t.error || v.error || d.error) {
        // El mensaje crudo se pierde apenas se traduce: si algo no cuadra,
        // esto es lo único que le queda a quien tenga que investigar.
        console.error("[PlantillasTab] error al cargar:", t.error?.message, v.error?.message, d.error?.message);
        setErrorCarga("No se pudo cargar la lista de plantillas. Puede ser un problema de conexión — probá de nuevo.");
        vaciar();
        return;
      }

      const documentos = (d.data ?? []) as DocumentoCrudo[];

      /**
       * La cuarta consulta va después y no adentro del `Promise.all`: pregunta
       * por los asesores que tienen documento, y esa lista recién existe con la
       * respuesta de arriba.
       *
       * Se piden POR ID, como hacen `detectar-plantilla` y `confirmar-plantilla`,
       * y no la tabla entera: esta pantalla no tiene por qué mirar perfiles que
       * no son dueños de ninguno de estos documentos.
       */
      const idsDeAsesores = [...new Set(documentos.map((doc) => doc.advisor_id))];
      /**
       * `full_name` entra porque la pantalla de la versión nueva le pide al
       * director que ELIJA a una persona y después le muestra fila por fila
       * cómo le fue a cada una. Un uuid no le dice nada a nadie, y el nombre
       * del archivo no es el nombre de la persona.
       */
      const p = idsDeAsesores.length
        ? await supabase.from("profiles").select("id, estado, full_name").in("id", idsDeAsesores)
        : { data: [] as Array<AsesorCrudo & { full_name?: string | null }>, error: null };

      if (p.error) {
        /**
         * Si esto falla NO se sigue con la lista igual. Sin los estados, un
         * desvinculado se cuenta como si estuviera activo y la fila vuelve a
         * decir "volvé a detectar la plantilla" — la instrucción imposible que
         * este balde vino a sacar. Un dato que falta no es un dato en cero.
         */
        console.error("[PlantillasTab] error al leer los asesores:", p.error.message);
        setErrorCarga("No se pudo cargar la lista de plantillas. Puede ser un problema de conexión — probá de nuevo.");
        vaciar();
        return;
      }

      const perfiles = (p.data ?? []) as Array<AsesorCrudo & { full_name?: string | null }>;
      setDocumentos(documentos);
      setAsesores(perfiles);
      setFilas(
        armarFilas({
          tipos: (t.data ?? []) as TipoCrudo[],
          versiones: (v.data ?? []) as VersionCruda[],
          documentos,
          asesores: perfiles,
        }),
      );
    } catch (e) {
      /**
       * supabase-js devuelve los fallos de red en `error` y casi nunca tira,
       * pero "casi nunca" no alcanza acá: sin este `catch` una excepción se
       * comería el `setFilas`, la lista quedaría vacía y el director leería
       * "todavía no hay ningún tipo de documento" — que es exactamente la
       * confusión que esta pantalla tiene prohibida (ver `errorCarga`).
       */
      console.error("[PlantillasTab] excepción al cargar:", e);
      setErrorCarga("No se pudo cargar la lista de plantillas. Puede ser un problema de conexión — probá de nuevo.");
      vaciar();
    } finally {
      setCargando(false);
    }
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const detectar = async (fila: FilaPlantilla) => {
    setDetectandoId(fila.templateId);
    setPropuesta(null);
    try {
      const res = await fetch("/api/asesor-docs/detectar-plantilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Un solo dato: qué tipo de documento. Quién soy lo sabe el servidor
        // por la sesión.
        body: JSON.stringify({ templateId: fila.templateId }),
      });

      const cuerpo = await res.json().catch(() => null);

      if (!res.ok) {
        // Los mensajes del endpoint ya están escritos para el director.
        toast.error(cuerpo?.error ?? "No se pudo detectar la plantilla. Probá de nuevo en un rato.");
        return;
      }

      setPropuesta({ fila, datos: cuerpo as Propuesta });
      const cuantos = (cuerpo as Propuesta).huecos.length;
      toast.success(
        cuantos === 0
          ? "La comparación terminó, pero no encontró ningún dato que cambie de asesor a asesor."
          : cuantos === 1
            ? "Se encontró 1 dato que cambia de asesor a asesor."
            : `Se encontraron ${cuantos} datos que cambian de asesor a asesor.`,
      );
    } catch (e) {
      console.error("[PlantillasTab] falló el pedido de detección:", e);
      toast.error("No se pudo hablar con el servidor. Revisá la conexión y probá de nuevo.");
    } finally {
      setDetectandoId(null);
    }
  };

  /**
   * Poner en uso la versión que ya se le aplicó a todos, desde la fila.
   *
   * Es el mismo pedido que hace el panel; existe acá también porque el panel
   * arranca siempre pidiendo un Word, y el director que aplicó y cerró sin
   * activar se quedaba sin ninguna forma de terminar.
   *
   * El 409 se muestra tal cual: `activar-version` se niega con los NOMBRES de
   * los que quedaron atrás, y ese mensaje ya está escrito para el director.
   */
  const ponerEnUso = async (fila: FilaPlantilla) => {
    /**
     * El MISMO motivo que apaga el botón, comprobado también acá.
     *
     * El `disabled` del botón era todo lo que impedía activar cuando no
     * corresponde: a diferencia del panel, este handler no tenía guard propio.
     * Un `disabled` es un adorno del navegador —se saltea con un clic
     * programático, o con un cambio de estilos— y acá al otro lado hay un
     * `UPDATE` sobre `version_actual`, que es lo que la solapa lee para decir
     * "está en uso".
     *
     * El servidor igual frena los tres casos que importan (`activar-version`
     * mira los atrasados, los pendientes y los rojos), así que esto es la
     * segunda puerta, no la única. Pero una defensa sola es una defensa que el
     * día que alguien toque el botón desaparece sin ruido.
     */
    if (fila.versionIdYaAplicada === null || activandoEn !== null) return;
    if (motivoParaNoPonerEnUsoDesdeLaFila(fila) !== null) return;
    setActivandoEn(fila.templateId);
    try {
      const res = await fetch("/api/asesor-docs/activar-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Dos ids y nada más: quién soy y de qué inmobiliaria lo sabe el
        // servidor por la sesión.
        body: JSON.stringify({ templateId: fila.templateId, versionId: fila.versionIdYaAplicada }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(cuerpo?.error ?? "No se pudo poner en uso esa versión. Probá de nuevo.");
        return;
      }
      toast.success(cuerpo?.resumen ?? "La versión quedó en uso.");
      cargar();
    } catch (e) {
      console.error("[PlantillasTab] falló el pedido de activación:", e);
      toast.error("No se pudo hablar con el servidor. Revisá la conexión y probá de nuevo.");
    } finally {
      setActivandoEn(null);
    }
  };

  return (
    /**
     * El alto, que en la Etapa A costó una ronda entera: contenedor en
     * columna, el encabezado fijo (`shrink-0`) y la lista con SU PROPIO scroll
     * (`flex-1 min-h-0 overflow-y-auto`). Ninguna altura escrita en píxeles:
     * un `max-height` a mano solo cierra con el encabezado del día que se
     * escribió, y en cuanto el encabezado crece la parte de abajo queda
     * cortada y no hay forma de llegar a ella.
     */
    <div className="flex h-full min-h-0 flex-col">
      {/* En una sola fila también en el celular. Apilado, el título y el botón
          se comían 84 px de los 667 de un iPhone SE; al lado, 44. Medido: el
          botón entra sin desborde horizontal y sin pisar el título. */}
      <div className="shrink-0 flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">Plantillas de documentos</h3>
          {/* En el celular este párrafo NO va acá: ocupa media pantalla y, como
              el encabezado es fijo, le come el alto a la lista hasta dejarla en
              una ranura. Abajo se repite adentro del scroll, donde se lee una
              vez y después se va. En el escritorio sobra lugar y queda fijo,
              que es donde mejor funciona. */}
          <p className="hidden md:block text-sm text-muted-foreground max-w-2xl">{PARA_QUE_SIRVE}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 self-start"
          onClick={cargar}
          disabled={cargando}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-4 space-y-3">
        {/* La copia de celular del párrafo de arriba: acá adentro scrollea con
            la lista en vez de robarle alto para siempre. */}
        <p className="md:hidden text-sm text-muted-foreground">{PARA_QUE_SIRVE}</p>

        {cargando ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : errorCarga ? (
          <BloqueError mensaje={errorCarga} onReintentar={cargar} />
        ) : filas.length === 0 ? (
          // El estado vacío es DISTINTO del error de arriba, a propósito: acá
          // no falló nada, simplemente todavía no hay ningún tipo cargado.
          <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
            <FileStack className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-semibold text-foreground">Todavía no hay ningún tipo de documento</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Los tipos se crean al subir el primer documento de un asesor: abrí la ficha de cualquiera, entrá en
              Documentos y subí su contrato.
            </p>
          </div>
        ) : (
          filas.map((fila) => (
            <FilaDeLaSolapa
              key={fila.templateId}
              fila={fila}
              detectando={detectandoId === fila.templateId}
              onDetectar={() => detectar(fila)}
              onSubirVersion={() => setSubiendoVersionEn(fila.templateId)}
              onPonerEnUso={() => ponerEnUso(fila)}
              poniendoEnUso={activandoEn === fila.templateId}
            >
              {propuesta?.fila.templateId === fila.templateId && (
                /* La revisión es OBLIGATORIA antes de guardar (spec §7.2):
                   apenas la detección devuelve algo, se abre. Nada se guarda
                   hasta que el director confirma ahí adentro. */
                <RevisionPlantilla
                  nombreDelTipo={fila.nombre}
                  propuesta={propuesta.datos}
                  onCerrar={() => setPropuesta(null)}
                  onConfirmado={cargar}
                />
              )}
              {subiendoVersionEn === fila.templateId && (
                /* La versión nueva (spec §7.4 y §7.5): subir el Word, verlo, y
                   aplicárselo a cada asesor. Los asesores se cruzan acá y no
                   adentro: la pantalla no consulta la base, recibe la lista ya
                   armada por una función que está bajo test. */
                <VersionNueva
                  templateId={fila.templateId}
                  nombreDelTipo={fila.nombre}
                  asesores={asesoresDeLaPlantilla({ templateId: fila.templateId, documentos, asesores })}
                  onCerrar={() => setSubiendoVersionEn(null)}
                  onAplicado={cargar}
                />
              )}
            </FilaDeLaSolapa>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * UNA fila de la solapa: un tipo de documento, sus contadores y su botón.
 *
 * Está afuera de `PlantillasTab` y EXPORTADA a propósito, y no es una
 * prolijidad: es lo único que hace que los renglones de esta fila se puedan
 * RENDERIZAR en un test.
 *
 * El agujero que cierra, medido: los tests que había miraban el archivo como
 * texto (`toContain("textoSinComprobar(fila.sinComprobar)")`) y probaban que la
 * función existiera y devolviera la frase correcta. Cambiar `{avisoSinComprobar}`
 * por `{null}` acá abajo dejaba los 82 tests en verde y borraba el renglón de
 * la pantalla. Es el mismo hueco por el que en la Task 5 se coló una promesa
 * falsa en la primera línea que lee todo el mundo.
 *
 * `PlantillasTab` no se puede renderizar en un test: llama a `createClient()`
 * apenas arranca y trae las filas de la base. Esta sí — recibe todo por props y
 * no toca nada.
 *
 * La revisión de la plantilla entra por `children` y se sigue decidiendo
 * arriba: es lo único de la fila que necesita el estado del padre.
 */
export function FilaDeLaSolapa({
  fila,
  detectando,
  onDetectar,
  onSubirVersion,
  onPonerEnUso,
  poniendoEnUso = false,
  children,
}: {
  fila: FilaPlantilla;
  detectando: boolean;
  onDetectar: () => void;
  /** Abre la pantalla de la versión nueva. Opcional para poder dibujar la fila sola. */
  onSubirVersion?: () => void;
  /**
   * Pone en uso la versión que ya se le aplicó a todos.
   *
   * Existe porque el panel arranca SIEMPRE pidiendo un Word: el director que
   * aplicó y cerró sin activar se quedaba sin ninguna forma de terminar, y el
   * aviso de la fila le decía "falta ponerla en uso" sin nada que apretar. Una
   * instrucción que no se puede ejecutar es peor que no decir nada.
   */
  onPonerEnUso?: () => void;
  poniendoEnUso?: boolean;
  children?: React.ReactNode;
}) {
  /**
   * Los DOS números, y el orden importa: el que decide es `participan` —el
   * mismo que cuenta la ruta de detección— y `documentos` entra solo para poder
   * explicar la diferencia cuando la hay. Con `fila.documentos` a secas, el
   * botón se habilitaba con 3 documentos donde uno era de un pausado y la ruta
   * comparaba 2.
   */
  const motivo = motivoParaNoDetectar(fila.participan, fila.documentos);
  const motivoVersion = motivoParaNoSubirVersion(fila);
  const avisoYaAplicados = textoYaAplicados(fila.yaAplicados);
  /**
   * El botón de poner en uso solo existe cuando hay algo que poner en uso. El
   * `motivo` decide si se puede apretar, y se escribe abajo siempre visible por
   * lo mismo que los otros dos: un botón de shadcn deshabilitado lleva
   * `pointer-events: none` y nunca dibuja su tooltip.
   */
  const hayQuePonerEnUso = fila.versionIdYaAplicada !== null;
  const motivoActivar = motivoParaNoPonerEnUsoDesdeLaFila(fila);
  const avisoSinComprobar = textoSinComprobar(fila.sinComprobar);
  const avisoPendientes = textoPendientes(fila.pendientes);
  const avisoDesvinculados = textoDesvinculados(fila.desvinculados);

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground break-words">{fila.nombre}</p>
            <Badge variant="outline" className={PINTA_DEL_ESTADO[fila.estado]}>
              {ETIQUETA_DEL_ESTADO[fila.estado]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl">{explicacionDelEstado(fila)}</p>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2 self-start">
          <Button
            className="gap-2"
            // Deshabilitado por el mínimo de documentos, o mientras
            // corre. El PORQUÉ se escribe abajo, siempre visible.
            //
            // Y SOLO abajo: acá había además un `title={motivo}` que no
            // se mostraba nunca. Un botón deshabilitado de shadcn lleva
            // `pointer-events: none`, así que el navegador no registra
            // el mouse encima y jamás dibuja el tooltip — verificado.
            // En el celular tampoco hay dónde pasar el mouse. Dejarlo
            // hacía creer que el motivo estaba cubierto por ahí.
            disabled={motivo !== null || detectando}
            onClick={onDetectar}
          >
            {detectando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {detectando ? "Comparando…" : "Detectar plantilla"}
          </Button>

          {/* La versión nueva (spec §7.4): es LO QUE ESTA ETAPA VINO A HACER,
              cambiar el contrato una vez y que se rehaga el documento de todos
              sin volver a subirlo asesor por asesor. Va al lado de detectar y
              no escondido en un menú.

              Se apaga cuando no hay una versión vigente contra la cual
              comparar, y el motivo se escribe abajo con el otro: mismo motivo
              que el de detectar para no ponerlo en un tooltip. */}
          <Button
            variant="outline"
            className="gap-2"
            disabled={motivoVersion !== null || detectando}
            onClick={onSubirVersion}
          >
            <FileUp className="h-4 w-4" />
            Subir versión nueva
          </Button>

          {/* Y el tercero, que solo aparece cuando hay una versión aplicada
              esperando. No es un botón permanente de la fila: es la salida del
              estado intermedio, y desaparece apenas la versión queda en uso. */}
          {hayQuePonerEnUso && (
            <Button
              variant="secondary"
              className="gap-2"
              disabled={motivoActivar !== null || poniendoEnUso || detectando}
              onClick={onPonerEnUso}
            >
              {poniendoEnUso ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {botonDePonerEnUso(fila.versionYaAplicada)}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {/* "N asesores la usan" era literalmente falso al lado de
              "Versión vigente: todavía ninguna" —y esa es la fila por
              defecto de toda inmobiliaria que arranca—: sin versión
              no hay plantilla que usar. Lo que este número cuenta es
              cuántos tienen el documento CARGADO. */}
          {fila.documentos === 1
            ? "1 asesor tiene este documento cargado"
            : `${fila.documentos} asesores tienen este documento cargado`}
        </span>
        <span>
          Versión vigente:{" "}
          <span className="text-foreground font-medium">
            {fila.version === null ? "todavía ninguna" : `v${fila.version}`}
          </span>
        </span>
        {fila.enRojo > 0 && (
          <span className="flex items-center gap-1.5 text-destructive font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {fila.enRojo === 1
              ? "1 asesor con su documento para revisar"
              : `${fila.enRojo} asesores con su documento para revisar`}
          </span>
        )}
        {/* El tercer balde. No es rojo —no falló nada— pero tampoco
            es verde: de esa persona no se comprobó nada. Sin este
            renglón, una plantilla "Activa" con un asesor pausado
            adentro se ve exactamente igual que una donde se comparó
            a todos.

            El texto NO se escribe acá: lo arma `textoSinComprobar`,
            que vive en lib y sí está bajo test. Escrito a mano en el
            JSX no lo miraba nadie. */}
        {avisoSinComprobar && (
          <span className="flex items-center gap-1.5 text-amber-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {avisoSinComprobar}
          </span>
        )}
        {/* El estado intermedio: ya tienen su documento de la versión nueva y
            falta ponerla en uso. Sin color de alarma a propósito — de esas
            personas está todo hecho y todo comprobado; lo que falta es un paso
            del director. El texto lo arma `textoYaAplicados`, en lib. */}
        {avisoYaAplicados && (
          <span className="flex items-center gap-1.5 text-green-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {avisoYaAplicados}
          </span>
        )}
        {/* El cuarto balde: a esa persona le falta un dato que la versión
            nueva trajo, así que sigue con la versión anterior (spec §7.4.2).
            No es rojo —no hay nada roto— pero es lo que traba poner la versión
            en uso, y sin este renglón el director no tiene de dónde sacarlo.

            El texto lo arma `textoPendientes`, que vive en lib y sí está bajo
            test. Escrito a mano en el JSX no lo miraría nadie. */}
        {avisoPendientes && (
          <span className="flex items-center gap-1.5 text-amber-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {avisoPendientes}
          </span>
        )}
        {/* Los desvinculados van aparte del ámbar de arriba, y sin
            color de alarma a propósito: no hay nada roto ni nada que
            comprobar: hay documentos que sobran. Metidos en el mismo
            balde, el director leía "volvé a detectar la plantilla"
            sobre alguien que no va a entrar nunca más en la
            detección, y ese aviso no se apagaba jamás. Qué hacer con
            esto —nada, salvo que esté seguro de que la persona no
            vuelve— está en la explicación de arriba. */}
        {avisoDesvinculados && (
          <span className="flex items-center gap-1.5 font-medium">
            <UserMinus className="h-3.5 w-3.5" />
            {avisoDesvinculados}
          </span>
        )}
      </div>

      {motivo && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{motivo}</span>
        </p>
      )}

      {/* Y el del otro botón. Los dos se dicen, no el primero: son dos botones
          apagados por motivos distintos, y con uno solo escrito el director se
          queda mirando el otro sin saber qué le falta. */}
      {motivoVersion && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{motivoVersion}</span>
        </p>
      )}

      {/* Y el del tercero. Es el más importante de los tres cuando aparece: el
          director acaba de aplicarle la versión a todos y este renglón es el que
          le dice por qué todavía no la puede poner en uso. */}
      {hayQuePonerEnUso && motivoActivar && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{motivoActivar}</span>
        </p>
      )}

      {children}
    </div>
  );
}

export default PlantillasTab;
