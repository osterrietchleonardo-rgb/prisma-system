"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileStack, Loader2, RotateCcw, Sparkles, Users, UserMinus, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { BloqueError } from "@/components/asesor-docs/DocumentosDelAsesor";
import { RevisionPlantilla } from "@/components/asesor-docs/RevisionPlantilla";
import {
  armarFilas,
  explicacionDelEstado,
  motivoParaNoDetectar,
  PARA_QUE_SIRVE,
  textoDesvinculados,
  textoSinComprobar,
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
        supabase.from("advisor_documents").select("template_id, estado, version_id, advisor_id"),
      ]);

      if (t.error || v.error || d.error) {
        // El mensaje crudo se pierde apenas se traduce: si algo no cuadra,
        // esto es lo único que le queda a quien tenga que investigar.
        console.error("[PlantillasTab] error al cargar:", t.error?.message, v.error?.message, d.error?.message);
        setErrorCarga("No se pudo cargar la lista de plantillas. Puede ser un problema de conexión — probá de nuevo.");
        setFilas([]);
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
      const p = idsDeAsesores.length
        ? await supabase.from("profiles").select("id, estado").in("id", idsDeAsesores)
        : { data: [] as AsesorCrudo[], error: null };

      if (p.error) {
        /**
         * Si esto falla NO se sigue con la lista igual. Sin los estados, un
         * desvinculado se cuenta como si estuviera activo y la fila vuelve a
         * decir "volvé a detectar la plantilla" — la instrucción imposible que
         * este balde vino a sacar. Un dato que falta no es un dato en cero.
         */
        console.error("[PlantillasTab] error al leer los asesores:", p.error.message);
        setErrorCarga("No se pudo cargar la lista de plantillas. Puede ser un problema de conexión — probá de nuevo.");
        setFilas([]);
        return;
      }

      setFilas(
        armarFilas({
          tipos: (t.data ?? []) as TipoCrudo[],
          versiones: (v.data ?? []) as VersionCruda[],
          documentos,
          asesores: (p.data ?? []) as AsesorCrudo[],
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
      setFilas([]);
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
  children,
}: {
  fila: FilaPlantilla;
  detectando: boolean;
  onDetectar: () => void;
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
  const avisoSinComprobar = textoSinComprobar(fila.sinComprobar);
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

        <Button
          className="shrink-0 gap-2 self-start"
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

      {children}
    </div>
  );
}

export default PlantillasTab;
