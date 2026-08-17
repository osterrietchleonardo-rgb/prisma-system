"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Sujeto, Operacion, AcmComparable, TOPE_COMPARABLES } from "@/lib/tasacion/types";
import { SubjectInput } from "./subject-input";
import { ComparablesResult } from "./comparables-result";
import { MisAcm } from "./mis-acm";

export const SUJETO_INICIAL: Sujeto = {
  direccion: "",
  barrio: "",
  tipo_propiedad: "departamento",
  m2_cubiertos: 0,
  m2_semicubiertos: 0,
  m2_descubiertos: 0,
  antiguedad_anios: 0,
  estado_conservacion: "bueno",
  calidad_construccion: "estandar",
  dormitorios: 0,
  banos: 0,
  orientacion: "norte",
  piso: 0,
  vista: "frente",
  amenidades: {
    cochera_cubierta: false,
    cochera_descubierta: false,
    baulera: false,
    pileta: false,
    gimnasio: false,
    sum: false,
    seguridad_24hs: false,
    jardin_privado: false,
    terraza_privada: false,
  },
  ocupacion: "libre",
  moneda: "USD",
  // Descripción de la IA de visión (fotos) y si va o no en la ficha del cliente. Viven DENTRO
  // de `sujeto` (no en estado aparte) a propósito: `sujeto` es lo único que efectivamente viaja
  // a /api/acm/ficha (revisarConclusiones y crearFicha en comparables-result.tsx lo postean tal
  // cual), así que un estado separado quedaba huérfano — se fusionaba solo para la búsqueda de
  // comparables (/api/acm/comparables) y nunca llegaba a la creación de la ficha ni al render.
  descripcion_ia: "",
  incluir_desc_ficha: true,
  incluir_linderos: false,
};

// Componente principal del ACM (lo reutilizan tanto el asesor como el director).
export function AcmModule() {
  const [sujeto, setSujeto] = useState<Sujeto>(SUJETO_INICIAL);
  const [operacion, setOperacion] = useState<Operacion>("venta");
  const [considerarPh, setConsiderarPh] = useState(true); // ACM: considerar PH como comparables (solo aplica a Casa)
  // Barrios linderos: apagado por defecto. Un comparable de Núñez en un ACM de Belgrano
  // es técnicamente defendible pero le rompe la confianza al cliente, así que se pide.
  const [incluirLinderos, setIncluirLinderos] = useState(false);
  const [excludeId, setExcludeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"input" | "results">("input");
  const [results, setResults] = useState<{
    cartera: AcmComparable[];
    roomix: AcmComparable[];
    conSemantica: boolean;
    carteraFallo: boolean;
    roomixFallo: boolean;
  } | null>(null);
  // Historial "Mis ACM": id de la búsqueda guardada (para linkearle la ficha) + solapa activa.
  const [tab, setTab] = useState<"nuevo" | "historial">("nuevo");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [abriendoId, setAbriendoId] = useState<string | null>(null);

  // Reset del formulario al cambiar de solapa (manual / cartera / link),
  // para que no queden datos escritos de un modo al pasar a otro.
  const handleReset = () => {
    setSujeto(SUJETO_INICIAL);
    setOperacion("venta");
    setConsiderarPh(true);
    setIncluirLinderos(false);
    setExcludeId(null);
  };

  const handleBuscar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/acm/comparables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // incluir_linderos viaja DENTRO de sujeto (no aparte) para que quede en el
          // snapshot de acm_searches.sujeto y "Mis ACM" pueda reabrir la búsqueda sabiendo
          // qué modo la produjo — ver el comentario de Sujeto.incluir_linderos.
          sujeto: { ...sujeto, descripcion_ia: (sujeto.descripcion_ia || "").trim(), incluir_linderos: incluirLinderos },
          operacion,
          exclude_id: excludeId,
          considerar_ph: considerarPh,
          // Traer la lista larga, no una muestra de 50. El tope y el porqué están en
          // TOPE_COMPARABLES. Como cada sección ahora scrollea en su propio recuadro, una lista
          // larga ya no estira la página.
          limit: TOPE_COMPARABLES,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const carteraFallo = Boolean(data.meta?.cartera_fallo);
      const roomixFallo = Boolean(data.meta?.roomix_fallo);
      setResults({
        cartera: data.cartera || [],
        roomix: data.roomix || [],
        conSemantica: data.meta?.con_semantica ?? false,
        carteraFallo,
        roomixFallo,
      });
      setSearchId(data.search_id ?? null);
      setRefreshKey((k) => k + 1); // la búsqueda quedó guardada en "Mis ACM"
      setView("results");
      // La búsqueda en cartera y/o en la red puede fallar (ej. timeout) sin que el endpoint
      // devuelva un error general — cartera/roomix simplemente vienen vacíos. Si no se avisa
      // acá, el asesor ve "sin comparables" y lo confunde con que la zona no tiene nada.
      if (carteraFallo || roomixFallo) {
        toast.error(
          carteraFallo && roomixFallo
            ? "No pudimos completar la búsqueda ni en tu cartera ni en la red de comparables. Probá de nuevo o angostá los filtros."
            : carteraFallo
              ? "No pudimos completar la búsqueda en tu cartera. Probá de nuevo o angostá los filtros."
              : "No pudimos completar la búsqueda en la red de comparables. Probá de nuevo o angostá los filtros."
        );
      } else if ((data.meta?.total ?? 0) === 0) {
        toast.info("No se encontraron comparables con estos criterios. Probá ampliar la zona o cambiar la operación.");
      }
    } catch (e: any) {
      toast.error("Error buscando comparables: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Abrir un ACM del historial: trae el snapshot guardado y muestra la MISMA pantalla de resultados.
  const handleAbrirGuardado = async (id: string) => {
    setAbriendoId(id);
    try {
      const res = await fetch(`/api/acm/searches/${id}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo abrir el ACM.");
      setSujeto({ ...SUJETO_INICIAL, ...(data.sujeto || {}) });
      setOperacion(data.operacion === "alquiler" ? "alquiler" : "venta");
      setExcludeId(data.exclude_id ?? null);
      // Restaura el modo de zona con el que se hizo esta búsqueda (ver Sujeto.incluir_linderos).
      // Ausente (búsquedas guardadas antes de este fix) = false = estricto, el default seguro.
      setIncluirLinderos(Boolean(data.sujeto?.incluir_linderos));
      // Búsqueda del historial: es un snapshot ya guardado, no hay una llamada en vivo que
      // pueda fallar AHORA — pero si la búsqueda ORIGINAL falló parcialmente (cartera y/o red
      // no completaron, ej. timeout), ese fallo quedó guardado dentro del propio snapshot
      // (ver /api/acm/comparables y /api/acm/searches/[id]) y hay que seguir mostrándolo: un
      // estudio incompleto sigue incompleto al reabrirlo, y sin el banner el asesor podría armar
      // y mandar una ficha con datos que nunca terminaron de traerse (hallazgo I2 de la revisión
      // final — antes esto se hardcodeaba en `false` con el argumento de que "un snapshot no
      // puede fallar", que es cierto para la LECTURA de hoy pero ignora que la búsqueda que lo
      // generó sí pudo haber fallado).
      setResults({
        cartera: data.cartera || [],
        roomix: data.roomix || [],
        conSemantica: Boolean(data.con_semantica),
        carteraFallo: Boolean(data.cartera_fallo),
        roomixFallo: Boolean(data.roomix_fallo),
      });
      setSearchId(data.id);
      setView("results");
      setTab("nuevo");
    } catch (e: any) {
      toast.error("Error abriendo el ACM: " + e.message);
    } finally {
      setAbriendoId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Scale className="h-7 w-7 text-accent" />
            Análisis Comparativo de Mercado
          </h2>
          <p className="text-muted-foreground mt-1">
            Encontrá comparables reales de una propiedad en tu cartera y en la red de colaboración, con % de comparabilidad.
          </p>
        </div>
      </div>

      {/* Solapas: análisis nuevo / historial guardado */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-accent/10 bg-card/30">
        {([
          ["nuevo", "Nuevo ACM"],
          ["historial", "Mis ACM"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-bold transition-colors",
              tab === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="border-accent/10 bg-card/20 backdrop-blur-md shadow-xl overflow-hidden">
        <CardHeader className="border-b border-accent/5 pb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">
              {tab === "historial"
                ? "Historial · Tus análisis guardados"
                : view === "input"
                  ? "1 · Elegí la propiedad a analizar"
                  : "2 · Comparables encontrados"}
            </p>
            <Badge variant="outline" className="text-[10px] border-accent/10">ACM</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-8">
          {tab === "historial" ? (
            <MisAcm onAbrir={handleAbrirGuardado} abriendoId={abriendoId} refreshKey={refreshKey} />
          ) : view === "input" ? (
            <SubjectInput
              sujeto={sujeto}
              onChange={setSujeto}
              operacion={operacion}
              onOperacionChange={setOperacion}
              considerarPh={considerarPh}
              onConsiderarPhChange={setConsiderarPh}
              incluirLinderos={incluirLinderos}
              onIncluirLinderosChange={setIncluirLinderos}
              descripcionIa={sujeto.descripcion_ia ?? ""}
              onDescripcionIaChange={(v) => setSujeto((s) => ({ ...s, descripcion_ia: v }))}
              incluirDescFicha={sujeto.incluir_desc_ficha ?? true}
              onIncluirDescFichaChange={(v) => setSujeto((s) => ({ ...s, incluir_desc_ficha: v }))}
              atributosFotosIa={sujeto.atributos_fotos_ia ?? null}
              onAtributosFotosIaChange={(a) => setSujeto((s) => ({ ...s, atributos_fotos_ia: a }))}
              anclajeEstado={sujeto.anclaje_estado_conservacion}
              anclajeLuminosidad={sujeto.anclaje_luminosidad}
              onAnclajeChange={(v) =>
                setSujeto((s) => ({
                  ...s,
                  ...(v.estado !== undefined ? { anclaje_estado_conservacion: v.estado } : {}),
                  ...(v.luminosidad !== undefined ? { anclaje_luminosidad: v.luminosidad } : {}),
                }))
              }
              onBuscar={handleBuscar}
              loading={loading}
              excludeId={excludeId}
              onExcludeIdChange={setExcludeId}
              onReset={handleReset}
            />
          ) : (
            results && (
              <ComparablesResult
                sujeto={sujeto}
                operacion={operacion}
                cartera={results.cartera}
                roomix={results.roomix}
                conSemantica={results.conSemantica}
                carteraFallo={results.carteraFallo}
                roomixFallo={results.roomixFallo}
                searchId={searchId}
                onFichaCreada={(nuevoId) => {
                  setSearchId(nuevoId);
                  setRefreshKey((k) => k + 1);
                }}
                onVolver={() => setView("input")}
              />
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
