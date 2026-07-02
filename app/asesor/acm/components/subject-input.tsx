"use client";

import { useEffect, useState } from "react";
import { Sujeto, Operacion, Amenidades } from "@/lib/tasacion/types";
import { Step1Sujeto } from "./step1-sujeto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, Building2, Link2, Search, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Modo = "manual" | "cartera" | "link";

interface CarteraItem {
  id: string;
  title: string;
  address: string | null;
  city: string | null;
  property_type: string | null;
  status: string | null;
  operacion: Operacion;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  m2: number | null;
  room_amount: number | null;
  antiguedad: number | null;
  amenidades: Amenidades;
}

interface SubjectInputProps {
  sujeto: Sujeto;
  onChange: (s: Sujeto) => void;
  operacion: Operacion;
  onOperacionChange: (o: Operacion) => void;
  onBuscar: () => void;
  loading: boolean;
  excludeId: string | null;
  onExcludeIdChange: (id: string | null) => void;
  onReset: () => void;
}

// Mapea una fila de la cartera (properties) → Sujeto del ACM.
function carteraToSujeto(p: CarteraItem, base: Sujeto): Sujeto {
  const amb = p.room_amount ?? null;
  const dormitorios = p.bedrooms != null ? p.bedrooms : amb && amb > 1 ? amb - 1 : 0;
  const tipo = (p.property_type || "").toLowerCase();
  const tipo_propiedad = tipo.includes("casa")
    ? "casa"
    : tipo.includes("ph")
      ? "ph"
      : tipo.includes("oficina") || tipo.includes("office")
        ? "oficina"
        : tipo.includes("local") || tipo.includes("premises")
          ? "local"
          : tipo.includes("lote") || tipo.includes("terreno") || tipo.includes("land")
            ? "terreno"
            : "departamento";
  return {
    ...base,
    direccion: p.address || p.title || "",
    barrio: p.city || "",
    tipo_propiedad,
    m2_cubiertos: p.m2 || 0,
    dormitorios,
    banos: p.bathrooms || 0,
    antiguedad_anios: p.antiguedad ?? base.antiguedad_anios,
    amenidades: p.amenidades || base.amenidades,
    moneda: (p.currency as any) === "ARS" ? "ARS" : "USD",
  };
}

export function SubjectInput({
  sujeto,
  onChange,
  operacion,
  onOperacionChange,
  onBuscar,
  loading,
  excludeId,
  onExcludeIdChange,
  onReset,
}: SubjectInputProps) {
  const [modo, setModo] = useState<Modo>("manual");

  // ── Cartera ──
  const [cartera, setCartera] = useState<CarteraItem[]>([]);
  const [carteraLoading, setCarteraLoading] = useState(false);
  const [carteraSearch, setCarteraSearch] = useState("");
  const [carteraSel, setCarteraSel] = useState<CarteraItem | null>(null);
  const [carteraOpen, setCarteraOpen] = useState(false);

  // ── Link ──
  const [url, setUrl] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [extractMeta, setExtractMeta] = useState<{ responsable: string | null; fecha: string | null; portal: string | null; expensas?: number | null; aviso?: string } | null>(null);

  useEffect(() => {
    if (modo === "cartera" && cartera.length === 0 && !carteraLoading) {
      setCarteraLoading(true);
      fetch("/api/acm/cartera", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setCartera(d.items || []))
        .catch(() => toast.error("No se pudo cargar la cartera"))
        .finally(() => setCarteraLoading(false));
    }
  }, [modo, cartera.length, carteraLoading]);

  const handleCarteraSelect = (id: string) => {
    const p = cartera.find((c) => c.id === id);
    if (!p) return;
    setCarteraSel(p);
    setCarteraOpen(false);
    onChange(carteraToSujeto(p, sujeto));
    onExcludeIdChange(id);
    if (p.status === "Alquiler" || p.status === "Temporary rent") onOperacionChange("alquiler");
    else onOperacionChange("venta");
    toast.success("Propiedad cargada desde la cartera. Revisá los datos abajo.");
  };

  // Filtrado por texto (título / dirección / ciudad), para no depender solo del desplegable
  // cuando la cartera tiene muchas propiedades.
  const carteraFiltrada = cartera.filter((c) => {
    const q = carteraSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.title || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q)
    );
  });

  // Cambiar de solapa (manual / cartera / link) limpia lo escrito en el form,
  // así no se mezclan datos de un modo con otro.
  const cambiarModo = (value: Modo) => {
    if (value === modo) return;
    setModo(value);
    onReset();
    setUrl("");
    setExtractMeta(null);
    onExcludeIdChange(null);
    setCarteraSel(null);
    setCarteraSearch("");
    setCarteraOpen(false);
  };

  const handleAnalizar = async () => {
    if (!url || !/^https?:\/\//i.test(url)) {
      toast.error("Pegá un link válido (http...)");
      return;
    }
    setAnalizando(true);
    setExtractMeta(null);
    try {
      const res = await fetch("/api/acm/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      // La respuesta puede NO ser JSON (timeout de la función, error de la plataforma,
      // página de error en texto/HTML). Leemos como texto y parseamos con cuidado,
      // para no romper con "Unexpected token ... is not valid JSON".
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          res.status === 504 || res.status === 408 || res.status === 524
            ? "El análisis tardó demasiado (el portal es lento o bloquea la lectura). Probá de nuevo o cargá los datos a mano."
            : "No se pudo leer este link automáticamente. Cargá los datos a mano."
        );
      }
      if (!res.ok || data.error) throw new Error(data.error || `No se pudo analizar el link (error ${res.status}).`);

      onChange({
        ...sujeto,
        ...data.sujeto,
        // Mergeamos las amenities detectadas (solo vienen las true) sobre las 9 por defecto.
        amenidades: { ...sujeto.amenidades, ...((data.sujeto?.amenidades as Partial<Amenidades>) || {}) },
        moneda: data.moneda || sujeto.moneda,
      });
      onExcludeIdChange(null);
      onOperacionChange(data.operacion === "alquiler" ? "alquiler" : "venta");
      setExtractMeta({ responsable: data.responsable, fecha: data.fecha_publicacion, portal: data.fuente_portal, expensas: data.expensas, aviso: data.aviso });

      if (data.requiere_completar_manual) toast.warning(data.aviso || "Completá los datos faltantes a mano.");
      else toast.success("Datos extraídos. Revisá y completá si falta algo.");
    } catch (e: any) {
      toast.error("No se pudo analizar el link: " + e.message);
    } finally {
      setAnalizando(false);
    }
  };

  const isValido = sujeto.barrio && sujeto.m2_cubiertos > 0;

  const ModoBtn = ({ value, icon: Icon, label }: { value: Modo; icon: any; label: string }) => (
    <button
      onClick={() => cambiarModo(value)}
      className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
        modo === value ? "border-accent bg-accent/10 text-accent" : "border-accent/10 bg-card/30 text-muted-foreground hover:border-accent/30"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-bold">{label}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Selector de modo */}
      <div className="flex gap-3">
        <ModoBtn value="manual" icon={Pencil} label="Cargar a mano" />
        <ModoBtn value="cartera" icon={Building2} label="Desde la cartera" />
        <ModoBtn value="link" icon={Link2} label="Desde un link" />
      </div>

      {/* Operación */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Operación</Label>
        <Select value={operacion} onValueChange={(v: Operacion) => onOperacionChange(v)}>
          <SelectTrigger className="w-40 bg-card/50 border-accent/10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="venta">Venta</SelectItem>
            <SelectItem value="alquiler">Alquiler</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Modo cartera */}
      {modo === "cartera" && (
        <div className="space-y-2 p-4 rounded-2xl border border-accent/10 bg-card/20">
          <Label className="text-sm font-bold">Elegí una propiedad de tu agencia</Label>
          <Popover open={carteraOpen} onOpenChange={setCarteraOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left bg-card/50 border-accent/10 h-auto p-3 font-normal">
                {carteraSel ? (
                  <div className="flex flex-col">
                    <span className="font-bold line-clamp-1">{carteraSel.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[carteraSel.m2 ? `${carteraSel.m2}m²` : null, carteraSel.city].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">{carteraLoading ? "Cargando cartera..." : "Buscar o elegir propiedad..."}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Escribí para buscar (título, dirección o zona)..."
                    className="pl-8 bg-transparent border-none focus-visible:ring-0 shadow-none"
                    value={carteraSearch}
                    onChange={(e) => setCarteraSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2 flex flex-col gap-1">
                {carteraLoading ? (
                  <p className="p-4 text-sm text-center text-muted-foreground">Cargando cartera...</p>
                ) : carteraFiltrada.length === 0 ? (
                  <p className="p-4 text-sm text-center text-muted-foreground">No se encontraron propiedades.</p>
                ) : (
                  carteraFiltrada.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "w-full text-left p-2 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5",
                        carteraSel?.id === c.id && "bg-accent/10"
                      )}
                      onClick={() => handleCarteraSelect(c.id)}
                    >
                      <span className="font-semibold line-clamp-1">{c.title}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {[c.m2 ? `${c.m2}m²` : null, c.address || c.city].filter(Boolean).join(" · ") || "Sin datos de ubicación"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          {excludeId && <p className="text-xs text-accent">Se excluirá esta propiedad de los comparables (no se compara consigo misma).</p>}
        </div>
      )}

      {/* Modo link */}
      {modo === "link" && (
        <div className="space-y-3 p-4 rounded-2xl border border-accent/10 bg-card/20">
          <Label className="text-sm font-bold">Pegá el link del aviso (ZonaProp, Argenprop, MercadoLibre, etc.)</Label>
          <div className="flex gap-2">
            <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} className="bg-card/50 border-accent/10" />
            <Button onClick={handleAnalizar} disabled={analizando} className="bg-accent hover:bg-accent/90 shrink-0">
              {analizando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Analizar
            </Button>
          </div>
          {extractMeta && (
            <div className="text-xs space-y-1 pt-1">
              {extractMeta.portal && <p className="text-muted-foreground">Fuente: <span className="text-foreground">{extractMeta.portal}</span></p>}
              {extractMeta.responsable && <p className="text-muted-foreground">Publica: <span className="text-foreground">{extractMeta.responsable}</span></p>}
              {extractMeta.fecha && <p className="text-muted-foreground">Publicado: <span className="text-foreground">{extractMeta.fecha}</span></p>}
              {extractMeta.expensas ? <p className="text-muted-foreground">Expensas: <span className="text-foreground">$ {extractMeta.expensas.toLocaleString("es-AR")}</span></p> : null}
              {extractMeta.aviso && (
                <p className="flex items-center gap-1 text-amber-500"><AlertTriangle className="w-3 h-3" /> {extractMeta.aviso}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Formulario del sujeto (siempre visible y editable, para revisar/completar) */}
      <div className="pt-2">
        <Step1Sujeto sujeto={sujeto} onChange={onChange} hideNextButton />
      </div>

      {/* Acción principal */}
      <div className="pt-2 flex justify-end border-t border-accent/10">
        <Button
          className="h-12 w-full md:w-auto px-8 bg-accent hover:bg-accent/90 mt-4"
          size="lg"
          disabled={!isValido || loading}
          onClick={onBuscar}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
          Buscar comparables
        </Button>
      </div>
    </div>
  );
}
