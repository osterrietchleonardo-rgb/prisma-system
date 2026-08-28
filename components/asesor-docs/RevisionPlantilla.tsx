"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import {
  avisoDeDatoCorto,
  fusionarHuecosIguales,
  LIMITE_DE_LA_COMPROBACION,
  NADA_SE_GUARDA_TODAVIA,
  PARA_QUE_SIRVE_LA_REVISION,
  SI_ALGUNO_QUEDA_EN_ROJO,
} from "@/lib/asesor-docs/plantillas";
// Solo tipos: `import type` desaparece al compilar, así que traerlos NO
// arrastra al navegador la librería de comparación de textos que hay del otro
// lado de esos archivos.
import type { Propuesta, PropuestaHueco } from "@/lib/asesor-docs/propuesta";
import type { RespuestaConfirmacion } from "@/lib/asesor-docs/confirmacion";

/**
 * La revisión obligatoria antes de guardar nada (spec §7.2).
 *
 * Es la pantalla más delicada de la etapa: lo que el director apruebe acá se
 * convierte, al final del camino, en el contrato que una persona firma. Por eso
 * **no se guarda absolutamente nada hasta que aprieta Confirmar**, y eso está
 * dicho con todas las letras en la barra de abajo, que nunca se va de la vista.
 *
 * Acá NO viaja el `agency_id` ni el rol. Ni como prop ni en el cuerpo del
 * pedido: el endpoint los saca de la sesión del servidor. Un id de agencia que
 * sale del navegador es un id que el navegador puede cambiar, y el 27-ago-2026
 * se cerró en producción un agujero exactamente así.
 *
 * Los textos largos viven en `lib/asesor-docs/plantillas.ts`, donde los
 * alcanzan los tests: en este archivo no hay ninguno, y una promesa escrita
 * acá adentro ya se escapó una ronda entera sin que nadie la viera.
 */

type Props = {
  /** Para el título: de qué tipo de documento es esta plantilla. */
  nombreDelTipo: string;
  propuesta: Propuesta;
  /** Se cierra sin guardar nada. */
  onCerrar: () => void;
  /**
   * Se confirmó Y el director ya vio el resultado: recién ahí la solapa vuelve
   * a leer la lista.
   *
   * **No se avisa apenas responde el servidor, y eso costó una prueba en el
   * navegador.** La solapa recarga poniendo `cargando` en true, lo que cambia
   * la lista entera por unos esqueletos — y esta pantalla, que cuelga de una de
   * esas filas, se desmonta con ella. Resultado medido: la confirmación se
   * guardaba bien en la base y el director volvía a ver la lista de campos sin
   * tocar, como si no hubiera pasado nada. Peor que un error: parecía que no
   * había funcionado.
   */
  onConfirmado: () => void;
};

/** Un campo, tal como lo va editando el director. */
type Campo = PropuestaHueco & {
  /**
   * Sacar un campo NO lo borra de la lista: lo apaga. Así el director puede
   * arrepentirse sin volver a detectar, que es un minuto de espera y una
   * llamada a la IA. Al confirmar se mandan solo los encendidos.
   */
  incluido: boolean;
};

export function RevisionPlantilla({ nombreDelTipo, propuesta, onCerrar, onConfirmado }: Props) {
  const supabase = createClient();

  const [campos, setCampos] = useState<Campo[]>(() =>
    propuesta.huecos.map((h) => ({ ...h, incluido: true })),
  );
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaConfirmacion | null>(null);
  /**
   * El error del servidor y SUS AVISOS, que son lo que le dice al director qué
   * campo sacar. Un `toast` no alcanza: se va solo a los pocos segundos, y
   * justo acá el director tiene que leer una lista de campos y actuar sobre
   * ella. Va en la pantalla, arriba de todo, y se queda.
   */
  const [errorAlConfirmar, setErrorAlConfirmar] = useState<{ error: string; advertencias: string[] } | null>(null);

  /**
   * Los nombres de las personas. La propuesta trae ids de asesor y nada más;
   * un uuid no le dice nada a nadie, y esta pantalla es justamente la que tiene
   * que mostrar QUÉ VALOR le extrajo a cada asesor.
   *
   * Se pide sin filtro de inmobiliaria a propósito: las políticas de la base ya
   * devuelven únicamente los perfiles de la agencia del director que mira.
   */
  const [nombres, setNombres] = useState<Record<string, string>>({});

  useEffect(() => {
    let vigente = true;
    (async () => {
      const ids = propuesta.documentosUsados;
      if (ids.length === 0) return;
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      if (!vigente) return;
      if (error) {
        // No es motivo para romper la pantalla: se sigue mostrando por id, que
        // es feo pero cierto. Lo que no puede pasar es que no se vea nada.
        console.error("[RevisionPlantilla] no se pudieron leer los nombres:", error.message);
        return;
      }
      const mapa: Record<string, string> = {};
      for (const p of data ?? []) if (p.full_name?.trim()) mapa[p.id] = p.full_name.trim();
      setNombres(mapa);
    })();
    return () => {
      vigente = false;
    };
  }, [supabase, propuesta.documentosUsados]);

  const comoSeLlama = useCallback(
    (advisorId: string) => nombres[advisorId] ?? "Asesor sin nombre",
    [nombres],
  );

  const incluidos = useMemo(() => campos.filter((c) => c.incluido), [campos]);

  /**
   * Cuántos campos se van a guardar DE VERDAD.
   *
   * No es `incluidos.length`: el servidor junta los que son el mismo dato
   * escrito dos veces (el nombre en la cláusula y en la firma). En la corrida
   * real fueron 23 detectados, 15 mandados y **8 guardados**. Un contador que
   * dice 15 cuando se guardan 8 es un número que miente, y el director lo lee
   * justo antes de apretar. Se usa la MISMA función que usa el servidor, para
   * que no puedan discrepar.
   */
  const aGuardar = useMemo(() => fusionarHuecosIguales(incluidos), [incluidos]);

  const renombrar = (id: string, nombre: string) =>
    setCampos((cs) => cs.map((c) => (c.id === id ? { ...c, nombre } : c)));

  const alternarIncluido = (id: string) =>
    setCampos((cs) => cs.map((c) => (c.id === id ? { ...c, incluido: !c.incluido } : c)));

  const confirmar = async () => {
    setConfirmando(true);
    setErrorAlConfirmar(null);
    try {
      const res = await fetch("/api/asesor-docs/confirmar-plantilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /**
         * La MISMA forma que devolvió la detección, con los nombres cambiados y
         * los campos apagados afuera. Quién soy y de qué inmobiliaria lo sabe
         * el servidor por la sesión.
         */
        body: JSON.stringify({
          templateId: propuesta.templateId,
          moldeAdvisorId: propuesta.moldeAdvisorId,
          huecos: incluidos.map(({ id, nombre, contexto, valores }) => ({ id, nombre, contexto, valores })),
        }),
      });

      const cuerpo = await res.json().catch(() => null);

      if (!res.ok) {
        // Los mensajes del endpoint ya están escritos para el director. Los
        // avisos que vienen con el error se MUESTRAN en la pantalla, no solo en
        // un toast: son la lista de campos que hay que sacar.
        const error = cuerpo?.error ?? "No se pudo confirmar la plantilla. Probá de nuevo en un rato.";
        const advertencias = Array.isArray(cuerpo?.advertencias) ? (cuerpo.advertencias as string[]) : [];
        setErrorAlConfirmar({ error, advertencias });
        toast.error(error);
        return;
      }

      const r = cuerpo as RespuestaConfirmacion;
      setResultado(r);
      if (r.estado === "activa") toast.success(r.resumen);
      else toast.warning(r.resumen);
    } catch (e) {
      console.error("[RevisionPlantilla] falló el pedido de confirmación:", e);
      toast.error("No se pudo hablar con el servidor. Revisá la conexión y probá de nuevo.");
    } finally {
      setConfirmando(false);
    }
  };

  /**
   * Cerrar: y si hubo confirmación, avisarle a la solapa para que relea la
   * lista. En este orden y no antes (ver `onConfirmado` en los props).
   */
  const cerrar = () => {
    if (resultado) onConfirmado();
    onCerrar();
  };

  return (
    <Sheet open onOpenChange={(abierto) => !abierto && cerrar()}>
      {/*
        El alto: contenedor en columna, encabezado y barra `shrink-0`, y el
        medio con SU PROPIO scroll (`flex-1 min-h-0 overflow-y-auto`). Ninguna
        altura escrita en píxeles ni en vh: el panel es `inset-y-0`, así que
        mide lo que mide la pantalla y la barra de abajo nunca queda cortada.
        En el celular ocupa el ancho entero (el `w-3/4` que trae por defecto
        dejaba una franja inútil a la izquierda y el contenido apretado).
      */}
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col p-0 gap-0">
        <div className="shrink-0 border-b px-4 py-4 sm:px-6 space-y-1.5">
          <SheetTitle className="text-base sm:text-lg pr-8">Revisar la plantilla de {nombreDelTipo}</SheetTitle>
          {/* Como SheetDescription y no como <p>: Radix lo engancha al panel con
              aria-describedby, así un lector de pantalla lo lee al abrirlo. Sin
              esto avisa por consola que el panel no tiene descripción. */}
          <SheetDescription className="text-sm">{PARA_QUE_SIRVE_LA_REVISION}</SheetDescription>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
          {resultado ? (
            <Resultado resultado={resultado} />
          ) : (
            <>
              {errorAlConfirmar && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <p className="flex items-start gap-2 text-sm text-foreground">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                    <span>{errorAlConfirmar.error}</span>
                  </p>
                  {errorAlConfirmar.advertencias.length > 0 && (
                    <ul className="space-y-1.5 text-xs text-muted-foreground pl-6">
                      {errorAlConfirmar.advertencias.map((a, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Encabezado propuesta={propuesta} comoSeLlama={comoSeLlama} />

              {campos.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  La comparación no encontró ningún dato que cambie de asesor a asesor. No hay plantilla que armar:
                  revisá que no hayas subido el mismo archivo para todos.
                </div>
              ) : (
                campos.map((campo, i) => (
                  <TarjetaDeCampo
                    key={campo.id}
                    campo={campo}
                    numero={i + 1}
                    asesores={propuesta.documentosUsados}
                    moldeAdvisorId={propuesta.moldeAdvisorId}
                    comoSeLlama={comoSeLlama}
                    onRenombrar={renombrar}
                    onAlternar={alternarIncluido}
                  />
                ))
              )}

              {propuesta.advertencias.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-600">Antes de confirmar, mirá esto</p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {propuesta.advertencias.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                        <span>{a}</span>
                      </li>
                    ))}
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <span>{LIMITE_DE_LA_COMPROBACION}</span>
                    </li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* La barra fija. Lo que dice acá es lo último que el director lee
            antes de apretar, así que dice lo único que importa: que hasta ese
            clic no se guardó nada, y qué pasa si algo no coincide. */}
        <div className="shrink-0 border-t px-4 py-3 sm:px-6 space-y-3">
          {resultado ? (
            <div className="flex justify-end">
              <Button onClick={cerrar}>Cerrar</Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {NADA_SE_GUARDA_TODAVIA} {SI_ALGUNO_QUEDA_EN_ROJO}
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {aGuardar.huecos.length === 1
                    ? "1 campo se va a guardar"
                    : `${aGuardar.huecos.length} campos se van a guardar`}
                  {campos.length !== incluidos.length && ` · ${campos.length - incluidos.length} sacados`}
                  {aGuardar.advertencias.length > 0 &&
                    ` · ${aGuardar.advertencias.length} ${
                      aGuardar.advertencias.length === 1 ? "es el mismo dato repetido" : "son el mismo dato repetido"
                    }`}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={cerrar} disabled={confirmando} className="flex-1 sm:flex-none">
                    Cancelar
                  </Button>
                  <Button
                    onClick={confirmar}
                    disabled={confirmando || incluidos.length === 0}
                    className="flex-1 sm:flex-none gap-2"
                  >
                    {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {confirmando ? "Comprobando…" : "Confirmar la plantilla"}
                  </Button>
                </div>
              </div>
              {incluidos.length === 0 && campos.length > 0 && (
                // Un botón deshabilitado que no dice por qué es un botón roto.
                <p className="text-xs text-amber-600">
                  Sacaste todos los campos. Una plantilla sin ninguno sería el contrato de una sola persona copiado
                  para todos: volvé a incluir alguno, o cerrá y detectá de nuevo.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Cuántos documentos se compararon y cuál se usa de molde. */
function Encabezado({
  propuesta,
  comoSeLlama,
}: {
  propuesta: Propuesta;
  comoSeLlama: (id: string) => string;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
      <p>
        {propuesta.documentosUsados.length === 1
          ? "Se comparó 1 documento: "
          : `Se compararon ${propuesta.documentosUsados.length} documentos: `}
        <span className="text-foreground">
          {propuesta.documentosUsados.map((id) => comoSeLlama(id)).join(", ")}
        </span>
        .
      </p>
      {propuesta.moldeAdvisorId && (
        <p>
          {/* De cuál sale el molde no es un detalle: es el .docx que conserva el
              formato, el logo y las tablas de la inmobiliaria. */}
          El documento de <span className="text-foreground">{comoSeLlama(propuesta.moldeAdvisorId)}</span> se usa de
          molde: de ahí salen el formato, el logo y las tablas.
        </p>
      )}
      {!propuesta.laIaRespondio && propuesta.huecos.length > 0 && (
        <p className="text-amber-600">
          Los campos que dicen CAMPO_1, CAMPO_2… no los pudo nombrar la IA. Ponéles vos un nombre que se entienda.
        </p>
      )}
    </div>
  );
}

/** Un campo: su nombre, dónde aparece, y qué dice cada asesor ahí. */
function TarjetaDeCampo({
  campo,
  numero,
  asesores,
  moldeAdvisorId,
  comoSeLlama,
  onRenombrar,
  onAlternar,
}: {
  campo: Campo;
  numero: number;
  asesores: string[];
  moldeAdvisorId: string;
  comoSeLlama: (id: string) => string;
  onRenombrar: (id: string, nombre: string) => void;
  onAlternar: (id: string) => void;
}) {
  // El del molde, que es el texto que de verdad se va a buscar en el .docx.
  const avisoCorto = avisoDeDatoCorto(campo.valores[moldeAdvisorId] ?? "");
  return (
    <div className={`rounded-xl border p-3 sm:p-4 space-y-3 ${campo.incluido ? "" : "bg-muted/40 opacity-70"}`}>
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`campo-${campo.id}`}>
            Campo {numero} — ¿qué dato es?
          </label>
          <Input
            id={`campo-${campo.id}`}
            value={campo.nombre}
            onChange={(e) => onRenombrar(campo.id, e.target.value)}
            disabled={!campo.incluido}
            placeholder="Por ejemplo: CUIT"
            className="font-mono text-sm"
          />
        </div>
        <Button
          type="button"
          variant={campo.incluido ? "outline" : "secondary"}
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => onAlternar(campo.id)}
        >
          {campo.incluido ? (
            <>
              <Trash2 className="h-3.5 w-3.5" />
              Sacar este campo
            </>
          ) : (
            <>
              <Undo2 className="h-3.5 w-3.5" />
              Volver a incluirlo
            </>
          )}
        </Button>
      </div>

      {!campo.incluido && (
        <p className="text-xs text-amber-600">
          Este campo no se va a usar: en el contrato de todos va a quedar el texto que tiene hoy el documento que se
          usa de molde. Si de verdad es un dato de cada persona, dejalo.
        </p>
      )}

      {campo.incluido && avisoCorto !== null && (
        /* El caso que más cuesta caro: un dato de una o dos letras se reemplaza
           en medio contrato. Se muestra acá, al lado del campo, y no en la lista
           general de avisos: el director tiene que poder sacarlo de un clic sin
           buscar cuál era. */
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{avisoCorto}</span>
        </p>
      )}

      {campo.contexto.trim() !== "" && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Dónde aparece</p>
          {/* El contexto viene con saltos de línea del documento: `whitespace-pre-wrap`
              los respeta y `break-words` evita que un CUIT largo desborde en el celular. */}
          <p className="rounded-lg bg-muted/50 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words">
            …{campo.contexto}…
          </p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Qué dice cada asesor acá</p>
        <div className="rounded-lg border divide-y">
          {asesores.map((id) => {
            const valor = campo.valores[id];
            return (
              <div
                key={id}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_1fr] gap-0.5 sm:gap-3 px-2.5 py-2 text-xs"
              >
                <span className="text-muted-foreground truncate flex items-center gap-1.5">
                  {comoSeLlama(id)}
                  {id === moldeAdvisorId && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal">
                      molde
                    </Badge>
                  )}
                </span>
                {/* Un valor vacío se DICE, no se deja en blanco: en blanco parece
                    que la pantalla no cargó. */}
                <span className={`break-words ${valor ? "font-mono text-foreground" : "italic text-amber-600"}`}>
                  {valor && valor.trim() !== "" ? valor : "(vacío en su documento)"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Cómo salió, después de confirmar. */
function Resultado({ resultado }: { resultado: RespuestaConfirmacion }) {
  const bien = resultado.estado === "activa";
  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-3 flex items-start gap-2.5 ${
          bien ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5"
        }`}
      >
        {bien ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        ) : (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        )}
        <p className="text-sm text-foreground">{resultado.resumen}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Asesor por asesor</p>
        {resultado.resultados.map((r) => (
          <div key={r.advisorId} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2">
              {r.estado === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className="text-sm font-medium text-foreground break-words">{r.nombre}</span>
              <Badge
                variant="outline"
                className={
                  r.estado === "ok"
                    ? "bg-green-500/10 text-green-600 border-green-500/20"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }
              >
                {r.estado === "ok" ? "Coincide" : "Hay que revisarlo"}
              </Badge>
            </div>
            {r.observacion && <p className="text-xs text-muted-foreground pl-6 break-words">{r.observacion}</p>}
          </div>
        ))}
      </div>

      {resultado.advertencias.length > 0 && (
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {resultado.advertencias.map((a, i) => (
            <li key={i} className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      {!bien && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            La versión quedó guardada y no se pierde. Corregí en Word el documento del asesor que no coincide y
            volvé a detectar la plantilla: se va a crear una versión nueva y esta queda archivada.
          </span>
        </p>
      )}
    </div>
  );
}

export default RevisionPlantilla;
