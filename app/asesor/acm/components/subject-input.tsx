"use client";

import { useEffect, useState } from "react";
import { Sujeto, Operacion, Amenidades } from "@/lib/tasacion/types";
import { Step1Sujeto } from "./step1-sujeto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Building2, Link2, Search, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
}: SubjectInputProps) {
  const [modo, setModo] = useState<Modo>("manual");

  // ── Cartera ──
  const [cartera, setCartera] = useState<CarteraItem[]>([]);
  const [carteraLoading, setCarteraLoading] = useState(false);

  // ── Link ──
  const [url, setUrl] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [extractMeta, setExtractMeta] = useState<{ responsable: string | null; fecha: string | null; portal: string | null; aviso?: string } | null>(null);

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
    onChange(carteraToSujeto(p, sujeto));
    onExcludeIdChange(id);
    if (p.status === "Alquiler" || p.status === "Temporary rent") onOperacionChange("alquiler");
    else onOperacionChange("venta");
    toast.success("Propiedad cargada desde la cartera. Revisá los datos abajo.");
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
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onChange({
        ...sujeto,
        ...data.sujeto,
        amenidades: sujeto.amenidades, // las amenities del link no son confiables: se cargan a mano
        moneda: data.moneda || sujeto.moneda,
      });
      onExcludeIdChange(null);
      onOperacionChange(data.operacion === "alquiler" ? "alquiler" : "venta");
      setExtractMeta({ responsable: data.responsable, fecha: data.fecha_publicacion, portal: data.fuente_portal, aviso: data.aviso });

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
      onClick={() => setModo(value)}
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
          <Select onValueChange={handleCarteraSelect}>
            <SelectTrigger className="bg-card/50 border-accent/10">
              <SelectValue placeholder={carteraLoading ? "Cargando cartera..." : "Buscar propiedad..."} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {cartera.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title} {c.m2 ? `· ${c.m2}m²` : ""} {c.city ? `· ${c.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
