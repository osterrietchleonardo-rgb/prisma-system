"use client";

import { useMemo } from "react";
import { 
  Sujeto, Comparable, ResultadoTasacion 
} from "@/lib/tasacion/types";
import { Button } from "@/components/ui/button";
import { FileDown, MapPin, Building, Printer, Tag } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

// Minimal Scatter Chart using pure HTML/SVG
function SimpleScatterChart({ resultado, comparables }: { resultado: ResultadoTasacion, comparables: Comparable[] }) {
  const data = resultado.resultados_comparables.filter(rc => !rc.excluido);
  if (data.length === 0) return null;

  const minPrecio = Math.min(...data.map(d => d.precio_m2_ajustado));
  const maxPrecio = Math.max(...data.map(d => d.precio_m2_ajustado));
  const minPeso = Math.min(...comparables.map(c => c.peso));
  const maxPeso = Math.max(...comparables.map(c => c.peso));

  const padPrecio = (maxPrecio - minPrecio) * 0.1 || 100;

  return (
    <div className="w-full h-48 border border-accent/10 rounded-xl relative p-6 bg-card/20">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {data.map((rc, i) => {
          const comparable = comparables.find(c => c.id === rc.comparable_id);
          const x = comparable ? ((comparable.peso - minPeso) / ((maxPeso - minPeso) || 1)) * 90 + 5 : 50;
          const y = 100 - (((rc.precio_m2_ajustado - (minPrecio - padPrecio)) / ((maxPrecio - minPrecio + 2*padPrecio) || 1)) * 100);
          return (
            <circle 
              key={rc.comparable_id} cx={`${x}%`} cy={`${y}%`} r={3} 
              className="fill-accent stroke-background stroke-[0.5]" 
            />
          );
        })}
        {/* Draw the average line */}
        <line 
          x1="0" y1={`${100 - (((resultado.precio_medio_m2_ponderado - (minPrecio - padPrecio)) / ((maxPrecio - minPrecio + 2*padPrecio) || 1)) * 100)}%`} 
          x2="100%" y2={`${100 - (((resultado.precio_medio_m2_ponderado - (minPrecio - padPrecio)) / ((maxPrecio - minPrecio + 2*padPrecio) || 1)) * 100)}%`} 
          className="stroke-accent/50 stroke-1 stroke-dasharray-[2_2]"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-1 flex justify-between px-6 text-[10px] text-muted-foreground">
        <span>Peso Menor</span>
        <span>Peso Mayor</span>
      </div>
      <div className="absolute inset-y-0 left-1 flex flex-col justify-between py-6 text-[10px] text-muted-foreground rotate-180" style={{ writingMode: "vertical-rl" }}>
        <span>Menor Valor / m²</span>
        <span>Mayor Valor / m²</span>
      </div>
    </div>
  );
}

interface Step4ResultadoProps {
  sujeto: Sujeto;
  comparables: Comparable[];
  resultado: ResultadoTasacion;
  observaciones: string;
  setObservaciones: (obs: string) => void;
  clienteNombre: string;
  setClienteNombre: (n: string) => void;
  onPrev: () => void;
  onFinishSave: () => void;
}

export function Step4Resultado({ 
  sujeto, comparables, resultado,
  observaciones, setObservaciones,
  clienteNombre, setClienteNombre,
  onPrev, onFinishSave
}: Step4ResultadoProps) {

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 relative" id="pdf-content">

      {/* HEADER DE INFORME */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-6 border-b border-accent/20">
        <div>
          <h2 className="text-3xl font-black uppercase text-foreground">Informe de Tasación</h2>
          <div className="text-muted-foreground flex items-center gap-2 mt-2 font-medium">
            <Building className="w-4 h-4" /> {sujeto.tipo_propiedad.toUpperCase()}
            <MapPin className="w-4 h-4 ml-4" /> {sujeto.direccion}, {sujeto.barrio}
          </div>
        </div>
        <div className="md:w-1/3 w-full space-y-3 print:hidden">
          <Input 
            placeholder="Nombre del Cliente" 
            className="h-10 border-accent/20 bg-card/50" 
            value={clienteNombre} 
            onChange={(e) => setClienteNombre(e.target.value)} 
          />
          <Textarea 
            placeholder="Observaciones internas / comentarios" 
            className="min-h-[80px] border-accent/20 bg-card/50"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
      </div>

      {/* GAUGE DE VALORES */}
      <div className="py-6 space-y-8">
        <h3 className="text-center text-xs uppercase font-bold tracking-[0.2em] text-muted-foreground">Rango de Comercialización Estimado</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          
          {/* Card Minimo */}
          <div className="bg-card/40 p-6 rounded-3xl border border-accent/10 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-bold text-muted-foreground">Valor Mínimo</span>
            <span className="text-2xl font-black opacity-80 mt-2">
              US$ {Math.round(resultado.valor_minimo).toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground mt-1">US$ {Math.round(resultado.precio_minimo_m2).toLocaleString()} / m²</span>
          </div>
          
          {/* Card Medio / Sugerido */}
          <div className="bg-accent/10 p-8 rounded-3xl border border-accent flex flex-col items-center justify-center text-center shadow-[0_0_40px_-10px] shadow-accent/20 scale-105 z-10">
            <div className="bg-accent text-accent-foreground text-[10px] uppercase font-bold px-3 py-1 rounded-full mb-3 shadow-md inline-flex items-center gap-1">
              <Tag className="w-3 h-3" /> Sugerido Venta
            </div>
            <span className="text-4xl font-black text-accent drop-shadow-sm tracking-tight">
              US$ {Math.round(resultado.valor_sugerido_publicacion).toLocaleString()}
            </span>
            <span className="text-sm font-medium opacity-80 mt-2">Medio US$ {Math.round(resultado.precio_medio_m2_ponderado).toLocaleString()} / m²</span>
          </div>

          {/* Card Maximo */}
          <div className="bg-card/40 p-6 rounded-3xl border border-accent/10 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-bold text-muted-foreground">Valor Máximo</span>
            <span className="text-2xl font-black opacity-80 mt-2">
              US$ {Math.round(resultado.valor_maximo).toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground mt-1">US$ {Math.round(resultado.precio_maximo_m2).toLocaleString()} / m²</span>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* RESUMEN SUJETO */}
        <div className="space-y-4">
          <h4 className="font-bold flex items-center gap-2 border-b border-accent/10 pb-2">
            Superficie de Cálculo
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex justify-between"><span>Sup. Cubierta:</span> <span className="font-mono font-bold text-foreground">{sujeto.m2_cubiertos} m²</span></li>
            <li className="flex justify-between"><span>Sup. Semicubierta:</span> <span className="font-mono font-bold text-foreground">{sujeto.m2_semicubiertos} m² (x0.5)</span></li>
            <li className="flex justify-between"><span>Sup. Descubierta:</span> <span className="font-mono font-bold text-foreground">{sujeto.m2_descubiertos} m² (x0.2)</span></li>
            <li className="flex justify-between pt-2 border-t border-accent/10 mt-2">
              <span className="font-bold">Superficie Equivalente:</span> 
              <span className="font-mono font-black text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">{resultado.superficie_equivalente_sujeto} m²</span>
            </li>
          </ul>
        </div>

        {/* GRAFICO DISPERSION */}
        <div className="space-y-4">
          <h4 className="font-bold flex items-center gap-2 border-b border-accent/10 pb-2">
            Dispersión de Muestra ({resultado.resultados_comparables.filter(c => !c.excluido).length} comps)
          </h4>
          <SimpleScatterChart resultado={resultado} comparables={comparables} />
        </div>
      </div>

      {/* RESUMEN COMPARABLES TABLA */}
      <div className="space-y-4 pt-4">
          <h4 className="font-bold flex items-center gap-2 border-b border-accent/10 pb-2">
            Detalle de Testigos Activos
          </h4>
          <div className="border border-accent/10 rounded-2xl overflow-hidden text-sm bg-card/20">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted capitalize text-xs">
                  <tr>
                    <th className="p-3">Fuente</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Valor Cierre/Oferta</th>
                    <th className="p-3">US$/m² Base</th>
                    <th className="p-3 text-accent text-right">US$/m² Ajustado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-accent/5">
                  {resultado.resultados_comparables.filter(c => !c.excluido).map((rc, idx) => {
                    const comp = comparables.find(c => c.id === rc.comparable_id);
                    if(!comp) return null;
                    return (
                      <tr key={idx}>
                        <td className="p-3"><span className="text-[10px] uppercase font-bold text-muted-foreground mr-1">#{idx+1}</span>{comp.fuente}</td>
                        <td className="p-3">{comp.tipo_precio}</td>
                        <td className="p-3 font-mono text-xs">US$ {comp.precio.toLocaleString()}</td>
                        <td className="p-3 font-mono text-xs">US$ {Math.round(rc.precio_base_m2).toLocaleString()}</td>
                        <td className="p-3 font-mono text-sm font-black text-right text-foreground">US$ {Math.round(rc.precio_m2_ajustado).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
      </div>

      {/* ACCIONES FOOTER NON-PRINTABLE */}
      <div className="pt-8 flex flex-col md:flex-row justify-between gap-4 border-t border-accent/20 print:hidden">
        <Button variant="ghost" className="h-12 border border-accent/10" onClick={onPrev}>
          Revisar Homogeneización
        </Button>
        <div className="flex gap-4">
          <Button variant="outline" className="h-12 border-accent/20 gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          <Button className="h-12 px-8 bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20 font-bold" onClick={onFinishSave}>
            Guardar Tasación Definitiva
          </Button>
        </div>
      </div>

    </div>
  );
}
