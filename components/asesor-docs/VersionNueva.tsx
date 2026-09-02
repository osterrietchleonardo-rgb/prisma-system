"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Info,
  Loader2,
  PlayCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { rutaDeVersionNueva, validarArchivo, type Seccion } from "@/lib/asesor-docs/reglas";
import {
  aplicarDeAUno,
  COMO_SE_APLICA,
  COMO_TIENE_QUE_SER_EL_ARCHIVO,
  EL_ARCHIVO_SIGUE_ELEGIDO,
  etiquetaDeResultado,
  motivoParaNoElegirAsesor,
  motivoParaNoPonerEnUso,
  textoDeLosQueQuedanAfuera,
  NADA_SE_APLICO_TODAVIA,
  PARA_QUE_SIRVE_LA_VERSION_NUEVA,
  PARA_QUE_SIRVE_LA_VISTA_PREVIA,
  PARA_QUE_SIRVE_PONER_EN_USO,
  resultadoDeLaAplicacion,
  resumenDelProgreso,
  textoDelArchivoElegido,
  tituloDeCamposDesaparecidos,
  tituloDeCamposNuevos,
  tituloDeLaVistaPrevia,
  tituloDeLosQueFaltan,
  type AsesorDeLaPlantilla,
  type ResultadoDeAplicacion,
} from "@/lib/asesor-docs/plantillas";
// Solo el tipo: `import type` desaparece al compilar, así que traerlo NO
// arrastra al navegador la librería de comparación de textos que hay del otro
// lado de ese archivo.
import type { RespuestaVersionNueva, UbicacionDeValor } from "@/lib/asesor-docs/version-nueva";

/**
 * Subir una versión nueva de la plantilla, verla, y aplicársela a cada asesor
 * (spec §7.4 y §7.5).
 *
 * **Es la función que Leonardo pidió desde el principio**: cambiar la versión
 * de un documento sin volver a subirlo asesor por asesor. Los dos endpoints ya
 * existían y estaban probados; esto es la pantalla que los usa, y es la primera
 * vez que PRISMA le genera el documento a una persona desde un clic.
 *
 * ═══ Las tres cosas que NO se pueden tocar acá ═══
 *
 * 1. **El archivo se queda en memoria hasta el 200.** El servidor lo borra
 *    apenas lo lee, salga bien o salga mal —incluido el 409— así que cualquier
 *    reintento necesita volver a subirlo. Si esta pantalla soltara el `File`,
 *    el director tendría que volver a buscarlo en el disco después de CADA
 *    rechazo, y los rechazos son el camino normal (el §7.4.1 rechaza el archivo
 *    genérico, y hay cinco guardas más atrás de eso).
 *
 * 2. **Se aplica de a un asesor por pedido** (spec §7.5), en serie, con el
 *    botón bloqueado mientras corre para que dos clics no disparen dos
 *    procesos. Uno que falla no corta el bucle: los demás siguen.
 *
 * 3. **Poner la versión en uso es un paso aparte**, y solo cuando no quedó
 *    nadie atrás. El endpoint se niega igual; acá se frena antes para no
 *    mandarle al director a un 409 que ya se sabe que va a venir.
 *
 * ═══ Y el `agency_id` ═══
 *
 * La solapa entera está escrita para que el id de la inmobiliaria NO viaje
 * desde el navegador, y eso sigue valiendo: los tres pedidos de acá mandan
 * ids de plantilla, de versión y de asesor, y la agencia sale de la sesión del
 * servidor.
 *
 * Pero el .docx **no viaja en el pedido**: lo sube el navegador a Storage y al
 * servidor le llega la ruta. Y esa ruta incluye la agencia
 * (`asesores/{agencyId}/_versiones-nuevas/…`), así que el navegador necesita
 * saber cuál es la suya para poder escribir ahí. Se la pregunta a la base con
 * su propia sesión —no llega por prop ni por parámetro— y de todas formas **no
 * es un dato de autoridad**: `validarRutaDeVersionNueva` la compara contra el
 * `agency_id` de la SESIÓN del servidor, así que una ruta de otra inmobiliaria
 * se rechaza con un mensaje escrito para el director. Acá solo decide dónde
 * intentar escribir; quién sos lo sigue diciendo el servidor.
 */

const BUCKET = "documents";
const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Props = {
  templateId: string;
  /** Para el título: de qué tipo de documento es esta plantilla. */
  nombreDelTipo: string;
  /** Quiénes tienen este documento cargado, ya cruzados con su estado. */
  asesores: AsesorDeLaPlantilla[];
  /** Se cierra sin aplicar nada más. */
  onCerrar: () => void;
  /**
   * Algo cambió en la base y la solapa tiene que releer.
   *
   * Se avisa al CERRAR y no apenas responde el servidor, por lo mismo que en
   * `RevisionPlantilla`: la solapa recarga poniendo esqueletos en lugar de la
   * lista, y esta pantalla —que cuelga de una de esas filas— se desmontaría con
   * ella en medio de la aplicación.
   */
  onAplicado: () => void;
};

/** Lo que se sabe de cada asesor mientras corre la aplicación. */
type EstadoPorAsesor = { estado: ResultadoDeAplicacion; mensaje: string | null };

export function VersionNueva({ templateId, nombreDelTipo, asesores, onCerrar, onAplicado }: Props) {
  const supabase = createClient();

  /** Los que entran: pausados y desvinculados quedan afuera (spec §7.5). */
  const activos = useMemo(() => asesores.filter((a) => a.participa), [asesores]);
  const afuera = useMemo(() => asesores.filter((a) => !a.participa), [asesores]);

  const [agencyId, setAgencyId] = useState<string | null>(null);

  const [moldeAdvisorId, setMoldeAdvisorId] = useState<string>("");
  /**
   * EL `File` EN MEMORIA. No se suelta hasta el 200, y esa es la mitad del
   * diseño de esta pantalla: ver el comentario de arriba.
   */
  const [archivo, setArchivo] = useState<File | null>(null);

  const [leyendo, setLeyendo] = useState(false);
  const [errorAlLeer, setErrorAlLeer] = useState<{ error: string; advertencias: string[] } | null>(null);
  const [leida, setLeida] = useState<RespuestaVersionNueva | null>(null);

  const [porAsesor, setPorAsesor] = useState<Record<string, EstadoPorAsesor>>({});
  const [aplicando, setAplicando] = useState(false);
  /**
   * Si el director ya apretó "Aplicar", aunque todavía no haya terminado ni uno.
   *
   * Es un estado propio y no se deduce de los resultados a propósito: el primer
   * pedido puede tardar hasta un minuto —baja el molde, el original y hasta
   * tres documentos más por cada asesor—, y dedujera de los resultados, durante
   * todo ese rato la pantalla se quedaría igual que antes de apretar. El
   * director no tendría forma de saber si el clic entró.
   */
  const [arranco, setArranco] = useState(false);
  const [activando, setActivando] = useState(false);
  const [errorAlActivar, setErrorAlActivar] = useState<{ error: string; faltan: string[] } | null>(null);
  const [enUso, setEnUso] = useState(false);
  /** Si se escribió algo en la base: decide si al cerrar hay que releer la solapa. */
  const [huboCambios, setHuboCambios] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data: sesion } = await supabase.auth.getUser();
      const usuario = sesion.user;
      if (!usuario) return;
      const { data, error } = await supabase.from("profiles").select("agency_id").eq("id", usuario.id).single();
      if (!vigente) return;
      if (error) {
        console.error("[VersionNueva] no se pudo leer la inmobiliaria:", error.message);
        return;
      }
      if (data?.agency_id) setAgencyId(data.agency_id);
    })();
    return () => {
      vigente = false;
    };
  }, [supabase]);

  const comoSeLlama = useCallback(
    (advisorId: string) => asesores.find((a) => a.advisorId === advisorId)?.nombre ?? advisorId,
    [asesores],
  );

  /**
   * Borra el .docx que este navegador acaba de subir.
   *
   * El servidor lo borra solo apenas lo lee, salga bien o salga mal, así que
   * casi siempre esto no encuentra nada — y borrar algo que ya no está es un
   * no-op. Existe para los caminos en que el servidor NO llegó a leerlo: el
   * pedido que no salió, el que se cortó, y el 400 de la guarda de la ruta
   * (que a propósito no borra, porque ahí el archivo puede no ser nuestro).
   *
   * Sin esto, cada uno de esos casos dejaría un contrato **legible por URL** en
   * el bucket `documents`, que es público. Es exactamente el daño que el
   * endpoint ya cierra por su lado.
   *
   * La ruta que borra es la que este mismo componente acaba de generar con un
   * uuid nuevo: no puede llevarse puesto el archivo de nadie.
   */
  const limpiarSiQuedo = useCallback(
    async (path: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) console.error("[VersionNueva] quedó un archivo sin borrar:", path, error.message);
    },
    [supabase],
  );

  const elegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setErrorAlLeer(null);
    if (!file) {
      setArchivo(null);
      return;
    }
    // La misma validación que la subida del documento de un asesor, y el mismo
    // mensaje: acá solo entran .docx, porque hay que abrirlo por dentro.
    const validacion = validarArchivo(file.name, file.size, "plantilla" as Seccion);
    if (!validacion.ok) {
      setArchivo(null);
      setErrorAlLeer({ error: validacion.error, advertencias: [] });
      return;
    }
    setArchivo(file);
  };

  const leerLaVersion = async () => {
    if (!archivo || !moldeAdvisorId || leyendo) return;
    if (!agencyId) {
      setErrorAlLeer({
        error: "Todavía no se pudo leer de qué inmobiliaria sos. Recargá la página y probá de nuevo.",
        advertencias: [],
      });
      return;
    }

    setLeyendo(true);
    setErrorAlLeer(null);
    /** Un id nuevo por intento: el anterior ya lo borró el servidor. */
    const path = rutaDeVersionNueva(agencyId, crypto.randomUUID());

    try {
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(path, archivo, { upsert: false, contentType: TIPO_DOCX });
      if (errSubida) {
        console.error("[VersionNueva] no se pudo subir el archivo:", errSubida.message);
        setErrorAlLeer({
          error: "No se pudo subir el archivo. Revisá la conexión y probá de nuevo.",
          advertencias: [],
        });
        return;
      }

      let res: Response;
      try {
        res = await fetch("/api/asesor-docs/aplicar-version", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, moldeAdvisorId, archivoPath: path }),
        });
      } catch (e) {
        console.error("[VersionNueva] falló el pedido de la versión nueva:", e);
        await limpiarSiQuedo(path);
        setErrorAlLeer({
          error: "No se pudo hablar con el servidor. Revisá la conexión y probá de nuevo.",
          advertencias: [],
        });
        return;
      }

      const cuerpo = await res.json().catch(() => null);

      if (!res.ok) {
        // Los mensajes del endpoint ya están escritos para el director, y los
        // avisos que vienen con el error son la lista de qué arreglar en el
        // Word: van en la pantalla y se quedan, no en un toast que se va solo.
        await limpiarSiQuedo(path);
        setErrorAlLeer({
          error: cuerpo?.error ?? "No se pudo leer la versión nueva. Probá de nuevo en un rato.",
          advertencias: Array.isArray(cuerpo?.advertencias) ? (cuerpo.advertencias as string[]) : [],
        });
        return;
      }

      const r = cuerpo as RespuestaVersionNueva;
      setLeida(r);
      /**
       * La versión ya quedó guardada en la base aunque todavía no se aplique a
       * nadie, así que la solapa tiene algo nuevo que leer al cerrar.
       */
      setHuboCambios(true);
      setPorAsesor(
        Object.fromEntries(
          activos.map((a) => [a.advisorId, { estado: "esperando" as ResultadoDeAplicacion, mensaje: null }]),
        ),
      );
      toast.success(r.resumen);
    } finally {
      setLeyendo(false);
    }
  };

  /** Le aplica la versión a UNA persona. Nunca tira: devuelve cómo salió. */
  const aplicarAUno = async (asesor: AsesorDeLaPlantilla, versionId: string): Promise<EstadoPorAsesor> => {
    try {
      const res = await fetch(`/api/asesor-docs/aplicar-version/${asesor.advisorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, versionId }),
      });
      const cuerpo = await res.json().catch(() => null);

      /**
       * Quién decide qué significa esta respuesta vive en lib
       * (`resultadoDeLaAplicacion`) y no acá: escrita a mano en el `.tsx` no la
       * miraba ningún test, y contar todo 200 como "Listo" dejaba los 1337 en
       * verde — con la pantalla diciendo que están todos hechos con uno en
       * `pendiente`, que llega con 200 y no tiene documento nuevo.
       */
      const estado = resultadoDeLaAplicacion({ ok: res.ok, status: res.status, estado: cuerpo?.estado });

      /** Cada resultado tiene su propio campo, porque el endpoint los manda aparte. */
      if (estado === "ok") return { estado, mensaje: cuerpo?.resumen ?? null };
      if (estado === "pendiente") return { estado, mensaje: cuerpo?.mensaje ?? null };
      return { estado, mensaje: cuerpo?.error ?? "No se pudo aplicar la versión a esta persona." };
    } catch (e) {
      console.error("[VersionNueva] falló el pedido de aplicación:", e);
      return {
        estado: "error",
        mensaje: "No se pudo hablar con el servidor. Revisá la conexión y probá con esta persona de nuevo.",
      };
    }
  };

  const marcar = (advisorId: string, valor: EstadoPorAsesor) =>
    setPorAsesor((previo) => ({ ...previo, [advisorId]: valor }));

  /**
   * De a UNO y en serie (spec §7.5).
   *
   * El bucle NO está acá: está en `aplicarDeAUno`, en lib, y no es una
   * prolijidad. La exigencia que más caro sale romper del §7.5 es "que uno que
   * falla no voltee a los otros", y estando el `for` adentro de este componente
   * **nadie la medía**: agregarle un `break` dejaba los 1337 tests en verde,
   * porque el panel no se puede dibujar en un test (el `Sheet` de Radix necesita
   * un DOM). Movida a lib, tiene sus tests y sus mutaciones.
   */
  const aplicarATodos = async () => {
    if (!leida || aplicando) return;
    const versionId = leida.versionId;
    setAplicando(true);
    setArranco(true);
    setErrorAlActivar(null);
    try {
      await aplicarDeAUno({
        asesores: activos,
        aplicar: (asesor) => aplicarAUno(asesor, versionId),
        alEmpezar: (asesor) => marcar(asesor.advisorId, { estado: "corriendo", mensaje: null }),
        alTerminar: (asesor, resultado) => {
          setHuboCambios(true);
          marcar(asesor.advisorId, resultado);
        },
      });
    } finally {
      setAplicando(false);
    }
  };

  /** Reintentar con UNA persona, después de arreglar lo suyo. */
  const reintentarUno = async (asesor: AsesorDeLaPlantilla) => {
    if (!leida || aplicando) return;
    setAplicando(true);
    setErrorAlActivar(null);
    try {
      marcar(asesor.advisorId, { estado: "corriendo", mensaje: null });
      const resultado = await aplicarAUno(asesor, leida.versionId);
      setHuboCambios(true);
      marcar(asesor.advisorId, resultado);
    } finally {
      setAplicando(false);
    }
  };

  const cuenta = useMemo(() => {
    const valores = activos.map((a) => porAsesor[a.advisorId]?.estado ?? "esperando");
    return {
      total: activos.length,
      ok: valores.filter((e) => e === "ok").length,
      pendientes: valores.filter((e) => e === "pendiente").length,
      frenados: valores.filter((e) => e === "frenado").length,
      errores: valores.filter((e) => e === "error").length,
      esperando: valores.filter((e) => e === "esperando" || e === "corriendo").length,
    };
  }, [activos, porAsesor]);

  const motivoParaNoActivar = motivoParaNoPonerEnUso({ total: cuenta.total, ok: cuenta.ok });

  const ponerEnUso = async () => {
    if (!leida || activando || motivoParaNoActivar !== null) return;
    setActivando(true);
    setErrorAlActivar(null);
    try {
      const res = await fetch("/api/asesor-docs/activar-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, versionId: leida.versionId }),
      });
      const cuerpo = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorAlActivar({
          error: cuerpo?.error ?? "No se pudo poner en uso esta versión. Probá de nuevo.",
          /** Los ids de los que faltan: acá abajo se traducen a nombres. */
          faltan: Array.isArray(cuerpo?.faltan) ? (cuerpo.faltan as string[]) : [],
        });
        return;
      }

      setEnUso(true);
      setHuboCambios(true);
      toast.success(cuerpo?.resumen ?? "La versión quedó en uso.");
    } catch (e) {
      console.error("[VersionNueva] falló el pedido de activación:", e);
      setErrorAlActivar({
        error: "No se pudo hablar con el servidor. Revisá la conexión y probá de nuevo.",
        faltan: [],
      });
    } finally {
      setActivando(false);
    }
  };

  const cerrar = () => {
    /**
     * También durante `activando`, no solo durante `aplicando`.
     *
     * Miraba solo `aplicando`, así que un Escape mientras corría "poner en uso"
     * cerraba el panel: la solapa recargaba **antes** de que el servidor
     * terminara y mostraba el estado intermedio unos segundos sobre una versión
     * que ya estaba en uso. No hace daño —la operación es idempotente y el
     * servidor la termina igual— pero el director ve un estado que ya no es
     * cierto, que es lo único que esta pantalla no puede hacer.
     */
    if (aplicando || activando) return;
    if (huboCambios) onAplicado();
    onCerrar();
  };

  const motivoSinAsesores = motivoParaNoElegirAsesor(activos.length);

  return (
    <Sheet open onOpenChange={(abierto) => !abierto && cerrar()}>
      {/*
        El mismo alto que la pantalla de revisión: columna, encabezado y barra
        `shrink-0`, y el medio con SU PROPIO scroll. Ninguna altura en píxeles
        ni en vh — el panel es `inset-y-0`, así que mide lo que mide la pantalla
        y la barra de abajo nunca queda cortada. En el celular ocupa el ancho
        entero.
      */}
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col p-0 gap-0">
        <div className="shrink-0 border-b px-4 py-4 sm:px-6 space-y-1.5">
          <SheetTitle className="text-base sm:text-lg pr-8">Versión nueva de {nombreDelTipo}</SheetTitle>
          <SheetDescription className="text-sm">{PARA_QUE_SIRVE_LA_VERSION_NUEVA}</SheetDescription>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
          {leida === null ? (
            <PasoElegir
              archivo={archivo}
              onElegirArchivo={elegirArchivo}
              moldeAdvisorId={moldeAdvisorId}
              onElegirAsesor={setMoldeAdvisorId}
              activos={activos}
              afuera={afuera}
              motivoSinAsesores={motivoSinAsesores}
              error={errorAlLeer}
            />
          ) : (
            <>
              <LoQueSeLeyo leida={leida} />

              <ElProgreso
                arranco={arranco}
                activos={activos}
                porAsesor={porAsesor}
                cuenta={cuenta}
                aplicando={aplicando}
                onReintentar={reintentarUno}
              />

              {errorAlActivar && (
                <BloqueDeError error={errorAlActivar.error}>
                  {errorAlActivar.faltan.length > 0 && (
                    <div className="pl-6 space-y-1">
                      <p className="text-xs font-medium text-foreground">
                        {tituloDeLosQueFaltan(errorAlActivar.faltan.length)}
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {errorAlActivar.faltan.map((id) => (
                          <li key={id} className="break-words">
                            · {comoSeLlama(id)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </BloqueDeError>
              )}

              {enUso && (
                <p className="flex items-start gap-2 rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                  <span>
                    La versión {leida.version} quedó en uso. Ya podés cerrar esta pantalla.
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        {/* La barra fija. Lo último que el director lee antes de apretar dice lo
            único que importa en cada paso: qué falta para que esto se convierta
            en el contrato de todos. */}
        <div className="shrink-0 border-t px-4 py-3 sm:px-6 space-y-3">
          {leida === null ? (
            <>
              <p className="text-xs text-muted-foreground">{COMO_TIENE_QUE_SER_EL_ARCHIVO}</p>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                <Button variant="outline" onClick={cerrar} disabled={leyendo} className="flex-1 sm:flex-none">
                  Cancelar
                </Button>
                <Button
                  onClick={leerLaVersion}
                  disabled={leyendo || !archivo || moldeAdvisorId === "" || motivoSinAsesores !== null}
                  className="flex-1 sm:flex-none gap-2"
                >
                  {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {leyendo ? "Leyendo el archivo…" : "Leer la versión nueva"}
                </Button>
              </div>
            </>
          ) : (
            <BarraDeLaAplicacion
              arranco={arranco}
              aplicando={aplicando}
              activando={activando}
              enUso={enUso}
              motivoParaNoActivar={motivoParaNoActivar}
              onAplicar={aplicarATodos}
              onPonerEnUso={ponerEnUso}
              onCerrar={cerrar}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Paso 1: qué archivo y de quién son los datos.
 *
 * Exportado a propósito, igual que `FilaDeLaSolapa`: es lo único que hace que
 * los renglones que el director lee acá se puedan DIBUJAR en un test. Recibe
 * todo por props y no toca la base ni la red.
 */
export function PasoElegir({
  archivo,
  onElegirArchivo,
  moldeAdvisorId,
  onElegirAsesor,
  activos,
  afuera,
  motivoSinAsesores,
  error,
}: {
  archivo: File | null;
  onElegirArchivo: (e: React.ChangeEvent<HTMLInputElement>) => void;
  moldeAdvisorId: string;
  onElegirAsesor: (id: string) => void;
  activos: AsesorDeLaPlantilla[];
  afuera: AsesorDeLaPlantilla[];
  motivoSinAsesores: string | null;
  error: { error: string; advertencias: string[] } | null;
}) {
  /**
   * El texto sale de lib y no de acá. Era la única prosa de esta pantalla
   * escrita a mano en el JSX, y la regla de la etapa no tiene excepciones por
   * un motivo medido: ningún test del repo mira los `.tsx`.
   */
  const avisoDeLosQueQuedanAfuera = textoDeLosQueQuedanAfuera(afuera.map((a) => a.nombre));

  return (
    <div className="space-y-4">
      {error && (
        <BloqueDeError error={error.error}>
          {error.advertencias.length > 0 && (
            <ul className="space-y-1.5 text-xs text-muted-foreground pl-6">
              {error.advertencias.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
          {/* El archivo NO se pierde con el rechazo, y hay que decirlo: el
              servidor lo borró de su lado, pero esta pantalla se lo quedó en
              memoria para poder volver a subirlo sin que el director lo busque
              otra vez en el disco. El texto vive en lib, donde lo ven los
              tests. */}
          {archivo && <p className="pl-6 text-xs text-muted-foreground">{EL_ARCHIVO_SIGUE_ELEGIDO}</p>}
        </BloqueDeError>
      )}

      <div className="space-y-2">
        <Label htmlFor="archivo-version-nueva">El Word de la versión nueva</Label>
        <Input
          id="archivo-version-nueva"
          type="file"
          accept=".docx"
          onChange={onElegirArchivo}
        />
        {archivo && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileUp className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{textoDelArchivoElegido(archivo.name, archivo.size)}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="asesor-de-referencia">¿Con los datos de quién está completado?</Label>
        {motivoSinAsesores !== null ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{motivoSinAsesores}</span>
          </p>
        ) : (
          <Select value={moldeAdvisorId} onValueChange={onElegirAsesor}>
            <SelectTrigger id="asesor-de-referencia">
              <SelectValue placeholder="Elegí el asesor" />
            </SelectTrigger>
            <SelectContent>
              {activos.map((a) => (
                <SelectItem key={a.advisorId} value={a.advisorId}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Quiénes NO están en la lista, y por qué. Un asesor que el director
            ve en la solapa y no encuentra acá es una pregunta sin respuesta; el
            spec §7.5 los deja afuera y eso se dice, no se esconde. */}
        {avisoDeLosQueQuedanAfuera && (
          <p className="text-xs text-muted-foreground">{avisoDeLosQueQuedanAfuera}</p>
        )}
      </div>
    </div>
  );
}


/**
 * TODO lo que el §7.5 pide que se vea mientras corre la aplicación, junto.
 *
 * ═══ Por qué esto es un componente y no dos etiquetas en el panel ═══
 *
 * Es la misma receta de `LoQueSeLeyo`, aplicada al bloque que aquel arreglo dejó
 * afuera — y es el que tiene las exigencias que más caro sale romper. Medido por
 * la revisión sobre el panel anterior: sacar `<BarraDeProgreso>` **sobrevivía**,
 * y reemplazar `activos.map` por `[].map` **también**. Cada pieza se dibujaba
 * bien en su propio test; nadie miraba si el panel las montaba.
 *
 * El panel entero no se puede dibujar en un test (el `Sheet` de Radix necesita
 * un DOM). Esto sí, y con esto lo que queda sin red es UNA línea, que tiene su
 * test estructural.
 */
export function ElProgreso({
  arranco,
  activos,
  porAsesor,
  cuenta,
  aplicando,
  onReintentar,
}: {
  /**
   * Si el director ya apretó "Aplicar". Antes de eso no hay progreso que
   * mostrar y esto no dibuja nada.
   *
   * La condición vive ACÁ ADENTRO y no en el panel a propósito: en el panel era
   * un `{arranco && (` que ningún test podía ver — cambiarlo por `{false && (`
   * borraba la barra de progreso y las filas de estado sin poner nada en rojo,
   * porque el panel no se puede dibujar. Acá adentro se dibuja, y el cableado
   * del panel queda siendo una sola expresión fija que un assert estructural
   * fija entera.
   */
  arranco: boolean;
  activos: AsesorDeLaPlantilla[];
  porAsesor: Record<string, EstadoPorAsesor>;
  cuenta: { total: number; ok: number; pendientes: number; frenados: number; errores: number; esperando: number };
  aplicando: boolean;
  onReintentar: (asesor: AsesorDeLaPlantilla) => void;
}) {
  if (!arranco) return null;
  return (
    <div className="space-y-3">
      <BarraDeProgreso
        hechos={cuenta.total - cuenta.esperando}
        total={cuenta.total}
        resumen={resumenDelProgreso(cuenta)}
      />
      {activos.map((asesor) => (
        <FilaDeAplicacion
          key={asesor.advisorId}
          asesor={asesor}
          resultado={porAsesor[asesor.advisorId] ?? { estado: "esperando", mensaje: null }}
          /**
           * Bloqueado mientras corre, que es la cuarta exigencia del §7.5: dos
           * clics no pueden disparar dos procesos.
           */
          bloqueado={aplicando}
          onReintentar={() => onReintentar(asesor)}
        />
      ))}
    </div>
  );
}

/**
 * La barra de abajo del paso "ya se leyó la versión": qué falta, y los botones.
 *
 * Exportada y dibujable por lo mismo que `ElProgreso`, y además porque acá vive
 * el cartel que evita el peor malentendido de toda la pantalla: que ver la vista
 * previa se lea como "el cambio ya está hecho". Medido por la revisión: cambiar
 * el ternario por `PARA_QUE_SIRVE_PONER_EN_USO` fijo —o sea, borrar
 * `NADA_SE_APLICO_TODAVIA` de la pantalla— no ponía nada en rojo. El texto estaba
 * usado por nombre y nadie miraba CUÁNDO.
 */
export function BarraDeLaAplicacion({
  arranco,
  aplicando,
  activando,
  enUso,
  motivoParaNoActivar,
  onAplicar,
  onPonerEnUso,
  onCerrar,
}: {
  /** Si el director ya apretó "Aplicar", aunque todavía no haya terminado ninguno. */
  arranco: boolean;
  aplicando: boolean;
  activando: boolean;
  enUso: boolean;
  motivoParaNoActivar: string | null;
  onAplicar: () => void;
  onPonerEnUso: () => void;
  onCerrar: () => void;
}) {
  return (
    <>
      {/* Antes de arrancar, lo que importa es que TODAVÍA NO SE APLICÓ NADA;
          después, qué significa poner la versión en uso. Los dos textos viven en
          lib, y cuál va en cada momento es una decisión, no una cosmética. */}
      <p className="text-xs text-muted-foreground">
        {arranco ? PARA_QUE_SIRVE_PONER_EN_USO : `${NADA_SE_APLICO_TODAVIA} ${COMO_SE_APLICA}`}
      </p>
      {/* El motivo de por qué el botón de poner en uso está apagado va SIEMPRE
          visible y no en un tooltip: un botón de shadcn deshabilitado lleva
          `pointer-events: none`, así que el navegador nunca dibuja el tooltip, y
          en el celular no hay dónde pasar el mouse. Está medido en la solapa. */}
      {arranco && motivoParaNoActivar !== null && !enUso && (
        <p className="text-xs text-amber-600">{motivoParaNoActivar}</p>
      )}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <Button variant="outline" onClick={onCerrar} disabled={aplicando || activando} className="flex-1 sm:flex-none">
          Cerrar
        </Button>
        {!arranco ? (
          /**
           * Bloqueado mientras corre: la cuarta exigencia del §7.5, para que dos
           * clics no disparen dos procesos. El guard de verdad está adentro de
           * `aplicarATodos` (`if (!leida || aplicando) return`); esto es lo que
           * el director ve.
           */
          <Button onClick={onAplicar} disabled={aplicando} className="flex-1 sm:flex-none gap-2">
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {aplicando ? "Aplicando…" : "Aplicar a los asesores"}
          </Button>
        ) : (
          !enUso && (
            <Button
              onClick={onPonerEnUso}
              disabled={aplicando || activando || motivoParaNoActivar !== null}
              className="flex-1 sm:flex-none gap-2"
            >
              {activando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {activando ? "Poniendo en uso…" : "Poner esta versión en uso"}
            </Button>
          )
        )}
      </div>
    </>
  );
}

/**
 * TODO lo que el director lee de la versión recién leída, en un solo lugar.
 *
 * ═══ Por qué esto existe y no son cinco etiquetas sueltas en el panel ═══
 *
 * Las cinco piezas de abajo se dibujan una por una en los tests, y aun así
 * sacar cualquiera de ellas del panel **no ponía nada en rojo**: la pieza
 * seguía existiendo, seguía dibujando bien, y nadie miraba si el panel la
 * montaba. Es el mismo agujero de `{avisoX}` → `{null}` de la solapa, un piso
 * más arriba — medido con mutación: borrar `<ListaDeAvisos>` dejaba los 1331
 * tests en verde y el director perdía la cuenta cruzada, que es lo único que
 * ve el caso "nuestra oficina de Palermo" antes de que salga el contrato de
 * todos.
 *
 * El panel completo NO se puede dibujar en un test: el `Sheet` de Radix
 * necesita un DOM. Esto sí, y con esto la parte sin red queda en UNA sola
 * línea del panel, que además tiene su test estructural.
 */
export function LoQueSeLeyo({ leida }: { leida: RespuestaVersionNueva }) {
  return (
    <>
      <ResumenDeLaVersion resumen={leida.resumen} />
      <CamposQueCambian campos={leida.campos} />
      <ListaDeAvisos avisos={leida.advertencias} />
      <TablaDeUbicaciones ubicaciones={leida.ubicaciones} />
      <VistaPrevia nombre={leida.vistaPrevia.nombre} texto={leida.vistaPrevia.texto} />
    </>
  );
}

/** El renglón de arriba de todo, ya escrito por el servidor. */
export function ResumenDeLaVersion({ resumen }: { resumen: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-foreground">
      <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <span>{resumen}</span>
    </p>
  );
}

/**
 * Qué campos cambian de una versión a la otra (spec §7.4.2).
 *
 * Los dos avisos largos —el de los nuevos y el de los desaparecidos, con su
 * consecuencia— los escribe el servidor y salen en `advertencias`. Acá van los
 * NOMBRES, que es lo que el aviso no puede mostrar de un vistazo.
 */
export function CamposQueCambian({
  campos,
}: {
  campos: { nuevos: string[]; desaparecidos: string[]; iguales: string[] };
}) {
  if (campos.nuevos.length === 0 && campos.desaparecidos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
      {campos.nuevos.length > 0 && (
        <div className="flex-1 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-600">{tituloDeCamposNuevos(campos.nuevos.length)}</p>
          <div className="flex flex-wrap gap-1.5">
            {campos.nuevos.map((c) => (
              <Badge key={c} variant="outline" className="font-mono text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {campos.desaparecidos.length > 0 && (
        <div className="flex-1 rounded-xl border p-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {tituloDeCamposDesaparecidos(campos.desaparecidos.length)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {campos.desaparecidos.map((c) => (
              <Badge key={c} variant="outline" className="font-mono text-[10px] line-through opacity-70">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Los avisos que ya vienen escritos del servidor.
 *
 * Se muestran TODOS y enteros. Son los que dicen que un dato aparece dos veces,
 * que uno es muy corto, o que la cuenta cruzada sospecha de una frase fija — y
 * ese último es el único lugar donde el caso "nuestra oficina de Palermo" se
 * puede ver antes de que salga el contrato de todos.
 */
export function ListaDeAvisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-600">Antes de aplicar, mirá esto</p>
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        {avisos.map((a, i) => (
          <li key={i} className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            <span className="break-words">{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cómo se ve cada situación de un campo adentro del documento nuevo. */
const COMO_SE_VE_LA_SITUACION: Record<UbicacionDeValor["situacion"], { texto: string; clase: string }> = {
  encontrado: { texto: "1 lugar", clase: "text-muted-foreground" },
  repetido: { texto: "varios lugares", clase: "text-amber-600" },
  ausente: { texto: "no aparece", clase: "text-amber-600" },
  "sin-dato": { texto: "sin dato cargado", clase: "text-amber-600" },
};

/** Campo por campo: qué buscó y qué encontró adentro del Word nuevo. */
export function TablaDeUbicaciones({ ubicaciones }: { ubicaciones: UbicacionDeValor[] }) {
  if (ubicaciones.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Qué encontró de esa persona adentro del archivo</p>
      <div className="rounded-lg border divide-y">
        {ubicaciones.map((u) => {
          const pinta = COMO_SE_VE_LA_SITUACION[u.situacion];
          return (
            <div
              key={u.campo}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_1fr_auto] gap-0.5 sm:gap-3 px-2.5 py-2 text-xs"
            >
              <span className="font-mono text-foreground break-words">{u.campo}</span>
              <span className="break-words text-muted-foreground">
                {u.valor.trim() === "" ? "(vacío en su ficha)" : u.valor}
              </span>
              <span className={`${pinta.clase} sm:text-right`}>
                {u.situacion === "repetido" ? `${u.veces} lugares` : pinta.texto}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** La vista previa del §7.4.3: el documento de una persona real, en texto. */
export function VistaPrevia({ nombre, texto }: { nombre: string; texto: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">{tituloDeLaVistaPrevia(nombre)}</p>
      <p className="text-xs text-muted-foreground">{PARA_QUE_SIRVE_LA_VISTA_PREVIA}</p>
      {/* `whitespace-pre-wrap` respeta los saltos del documento y `break-words`
          evita que un CUIT largo desborde en el celular. Alto acotado con su
          propio scroll: un contrato de quince páginas adentro del panel dejaría
          la barra de abajo a diez pantallas de distancia. */}
      <pre className="max-h-80 overflow-y-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words font-sans">
        {texto}
      </pre>
    </div>
  );
}

/**
 * La barra de progreso del §7.5.
 *
 * A mano y no con el `Progress` de Radix, a propósito: es un `div` con un ancho
 * en porcentaje, se dibuja igual en un test sin DOM, y lo que de verdad importa
 * —el renglón que dice cuántos van y qué pasó con los que no— es texto que sale
 * de `lib`.
 */
export function BarraDeProgreso({
  hechos,
  total,
  resumen,
}: {
  hechos: number;
  total: number;
  resumen: string;
}) {
  const porcentaje = total === 0 ? 0 : Math.round((hechos / total) * 100);
  return (
    <div className="space-y-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={hechos}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{resumen}</p>
    </div>
  );
}

/** Cómo se pinta cada resultado. La etiqueta la escribe `etiquetaDeResultado`. */
const PINTA_DEL_RESULTADO: Record<ResultadoDeAplicacion, string> = {
  esperando: "bg-muted text-muted-foreground border-transparent",
  corriendo: "bg-muted text-muted-foreground border-transparent",
  ok: "bg-green-500/10 text-green-600 border-green-500/20",
  pendiente: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  frenado: "bg-destructive/10 text-destructive border-destructive/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * Un asesor y cómo le fue (spec §7.5: "estado por fila").
 *
 * El mensaje del servidor se muestra ENTERO y se queda: es la lista de qué
 * arreglar en el Word, y son párrafos escritos para el director. Un toast que
 * se va solo a los tres segundos no sirve para eso.
 */
export function FilaDeAplicacion({
  asesor,
  resultado,
  bloqueado,
  onReintentar,
}: {
  asesor: AsesorDeLaPlantilla;
  resultado: { estado: ResultadoDeAplicacion; mensaje: string | null };
  bloqueado: boolean;
  onReintentar: () => void;
}) {
  const { estado, mensaje } = resultado;
  const salioMal = estado === "pendiente" || estado === "frenado" || estado === "error";

  return (
    <div className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {estado === "corriendo" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : estado === "ok" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        ) : estado === "pendiente" ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        ) : estado === "esperando" ? (
          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="text-sm font-medium text-foreground break-words">{asesor.nombre}</span>
        <Badge variant="outline" className={PINTA_DEL_RESULTADO[estado]}>
          {etiquetaDeResultado(estado)}
        </Badge>
        {salioMal && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            disabled={bloqueado}
            onClick={onReintentar}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Probar de nuevo
          </Button>
        )}
      </div>
      {mensaje && <p className="text-xs text-muted-foreground pl-6 break-words">{mensaje}</p>}
    </div>
  );
}

/** El bloque rojo que se queda en la pantalla, con lo que venga adentro. */
function BloqueDeError({ error, children }: { error: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
        <span className="break-words">{error}</span>
      </p>
      {children}
    </div>
  );
}

export default VersionNueva;
