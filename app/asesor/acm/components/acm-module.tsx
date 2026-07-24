"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Sujeto, Operacion, AcmComparable } from "@/lib/tasacion/types";
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
};

// Componente principal del ACM (lo reutilizan tanto el asesor como el director).
export function AcmModule() {
  const [sujeto, setSujeto] = useState<Sujeto>(SUJETO_INICIAL);
  const [operacion, setOperacion] = useState<Operacion>("venta");
  const [considerarPh, setConsiderarPh] = useState(true); // ACM: considerar PH como comparables (solo aplica a Casa)
  const [excludeId, setExcludeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"input" | "results">("input");
  const [results, setResults] = useState<{ cartera: AcmComparable[]; roomix: AcmComparable[]; conSemantica: boolean } | null>(null);
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
    setExcludeId(null);
  };

  const handleBuscar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/acm/comparables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sujeto, operacion, exclude_id: excludeId, considerar_ph: considerarPh }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults({ cartera: data.cartera || [], roomix: data.roomix || [], conSemantica: data.meta?.con_semantica ?? false });
      setSearchId(data.search_id ?? null);
      setRefreshKey((k) => k + 1); // la búsqueda quedó guardada en "Mis ACM"
      setView("results");
      if ((data.meta?.total ?? 0) === 0) toast.info("No se encontraron comparables con estos criterios. Probá ampliar la zona o cambiar la operación.");
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
      setResults({ cartera: data.cartera || [], roomix: data.roomix || [], conSemantica: Boolean(data.con_semantica) });
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
