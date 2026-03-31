"use client";

import { useMemo } from "react";
import { 
  Sujeto, Comparable, ResultadoTasacion, FactorAjusteValor 
} from "@/lib/tasacion/types";
import { calcularResultadoTasacion } from "@/lib/tasacion/calculos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { RefreshCcw, AlertCircle, Trash2, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Step3GrillaProps {
  sujeto: Sujeto;
  comparables: Comparable[];
  // Estados alzados al Wizard
  configGlobal: {
    meses_transcurridos_por_comp: Record<string, number>;
    variacion_mensual: number;
    descuento_oferta: number;
    margen_negociacion: number;
  };
  setConfigGlobal: (conf: any) => void;
  sobrescrituras: Record<string, Partial<FactorAjusteValor>>;
  setSobrescrituras: (sob: any) => void;
  excluidos: string[];
  setExcluidos: (ex: string[]) => void;
  onNext: (resultado: ResultadoTasacion) => void;
  onPrev: () => void;
}

export function Step3Grilla({ 
  sujeto, comparables, configGlobal, setConfigGlobal, 
  sobrescrituras, setSobrescrituras,
  excluidos, setExcluidos,
  onNext, onPrev 
}: Step3GrillaProps) {

  // CALCULO REACTIVO
  const resultado = useMemo(() => {
    return calcularResultadoTasacion(
      sujeto,
      comparables,
      configGlobal,
      sobrescrituras,
      excluidos
    );
  }, [sujeto, comparables, configGlobal, sobrescrituras, excluidos]);

  // Handler para celdas editables
  const handleCellEdit = (comp_id: string, factor_key: keyof FactorAjusteValor, e: React.ChangeEvent<HTMLInputElement>) => {
    const valueStr = e.target.value;
    const value = valueStr === "" ? undefined : Number(valueStr);
    
    setSobrescrituras((prev: any) => ({
      ...prev,
      [comp_id]: {
        ...(prev[comp_id] || {}),
        [factor_key]: value
      }
    }));
  };

  const toggleExclusion = (comp_id: string) => {
    if (excluidos.includes(comp_id)) {
      setExcluidos(excluidos.filter(id => id !== comp_id));
    } else {
      setExcluidos([...excluidos, comp_id]);
    }
  };

  const handleGlobalConfig = (key: string, value: string) => {
    setConfigGlobal((prev: any) => ({
      ...prev,
      [key]: Number(value)
    }));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      
      {/* HEADER DE CONFIGURACION */}
      <div className="bg-card/30 border border-accent/10 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label className="text-xs uppercase text-muted-foreground font-bold">Variación Mensual (%)</Label>
          <Input 
            type="number" step="0.1"
            className="h-8 mt-1 border-accent/20 bg-background"
            value={configGlobal.variacion_mensual}
            onChange={(e) => handleGlobalConfig('variacion_mensual', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground font-bold">Descuento Oferta (%)</Label>
          <Input 
            type="number" step="1"
            className="h-8 mt-1 border-accent/20 bg-background"
            value={configGlobal.descuento_oferta}
            onChange={(e) => handleGlobalConfig('descuento_oferta', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground font-bold">Margen Negociación (%)</Label>
          <Input 
            type="number" step="1"
            className="h-8 mt-1 border-accent/20 bg-background"
            value={configGlobal.margen_negociacion}
            onChange={(e) => handleGlobalConfig('margen_negociacion', e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" className="w-full border-accent/30 gap-2 h-8" onClick={() => setSobrescrituras({})}>
            <RefreshCcw className="w-3 h-3" /> Restaurar Automáticos
          </Button>
        </div>
      </div>

      {/* MATRIZ DE HOMOGENEIZACION */}
      <div className="border border-accent/20 rounded-2xl overflow-x-auto bg-card/10">
        <Table className="text-sm">
          <TableHeader className="bg-muted align-top">
            <TableRow>
              <TableHead className="w-[120px] font-bold">Datos</TableHead>
              <TableHead className="w-[80px]">Precio/m²<br/><span className="text-[10px] uppercase opacity-70">S/Homogenizar</span></TableHead>
              <TableHead className="w-[80px]">Sup.<br/>Equiv</TableHead>
              <TableHead className="w-[80px]">Antig.<br/>Estado</TableHead>
              <TableHead className="w-[80px]">Piso<br/>Vista</TableHead>
              <TableHead className="w-[80px]">Ameni-<br/>dades</TableHead>
              <TableHead className="w-[80px]">Oferta<br/>Cierre</TableHead>
              <TableHead className="w-[80px]">Manual<br/>Extra</TableHead>
              <TableHead className="w-[90px] font-bold">Precio/m²<br/><span className="text-accent underline underline-offset-2">Ajustado</span></TableHead>
              <TableHead className="text-center w-[60px]">Peso</TableHead>
              <TableHead className="text-center w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.resultados_comparables.map((rc, i) => {
              const comp = comparables.find(c => c.id === rc.comparable_id);
              if (!comp) return null;
              
              const isExcluded = rc.excluido;
              const isOutlier = rc.es_outlier;

              return (
                <TableRow key={rc.comparable_id} className={`${isExcluded ? 'opacity-30 line-through grayscale' : isOutlier ? 'bg-amber-500/5 hover:bg-amber-500/10' : ''}`}>
                  <TableCell className="align-middle">
                    <div className="font-bold flex items-center gap-1">
                      Comp #{i+1}
                      {isOutlier && !isExcluded && <AlertCircle className="w-4 h-4 text-amber-500 inline-block ml-1 animate-pulse" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate w-24">
                      {comp.fuente}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs opacity-70">
                    $ {Math.round(rc.precio_base_m2).toLocaleString()}
                  </TableCell>
                  
                  {/* CELDAS DE AJUSTES EDITABLES */}
                  <TableCell>
                    <Input 
                      type="number" className="h-8 max-w-[70px] px-1 text-center font-mono text-xs"
                      value={sobrescrituras[comp.id]?.superficie !== undefined ? sobrescrituras[comp.id]?.superficie : rc.factores_aplicados.superficie.toFixed(1)}
                      onChange={(e) => handleCellEdit(comp.id, 'superficie', e)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" className="h-8 max-w-[70px] px-1 text-center font-mono text-xs"
                      value={sobrescrituras[comp.id]?.antiguedad_estado !== undefined ? sobrescrituras[comp.id]?.antiguedad_estado : rc.factores_aplicados.antiguedad_estado.toFixed(1)}
                      onChange={(e) => handleCellEdit(comp.id, 'antiguedad_estado', e)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" className="h-8 max-w-[70px] px-1 text-center font-mono text-xs"
                      value={sobrescrituras[comp.id]?.piso_vista !== undefined ? sobrescrituras[comp.id]?.piso_vista : rc.factores_aplicados.piso_vista.toFixed(1)}
                      onChange={(e) => handleCellEdit(comp.id, 'piso_vista', e)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" className="h-8 max-w-[70px] px-1 text-center font-mono text-xs"
                      value={sobrescrituras[comp.id]?.amenidades !== undefined ? sobrescrituras[comp.id]?.amenidades : rc.factores_aplicados.amenidades.toFixed(1)}
                      onChange={(e) => handleCellEdit(comp.id, 'amenidades', e)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" className="h-8 max-w-[70px] px-1 text-center font-mono text-xs"
                      value={sobrescrituras[comp.id]?.oferta_cierre !== undefined ? sobrescrituras[comp.id]?.oferta_cierre : rc.factores_aplicados.oferta_cierre.toFixed(1)}
                      onChange={(e) => handleCellEdit(comp.id, 'oferta_cierre', e)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" className="h-8 max-w-[70px] px-1 text-center font-mono text-xs"
                      value={sobrescrituras[comp.id]?.manual !== undefined ? sobrescrituras[comp.id]?.manual : rc.factores_aplicados.manual.toFixed(1)}
                      onChange={(e) => handleCellEdit(comp.id, 'manual', e)}
                    />
                  </TableCell>

                  {/* PRECIO AJUSTADO FINAL */}
                  <TableCell className="font-black text-accent font-mono text-sm bg-accent/5">
                    $ {Math.round(rc.precio_m2_ajustado).toLocaleString()}
                  </TableCell>

                  <TableCell className="font-bold text-center">
                    {comp.peso}
                  </TableCell>

                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => toggleExclusion(comp.id)} className="w-6 h-6 rounded-full opacity-60 hover:opacity-100">
                      {isExcluded ? <Eye className="w-3 h-3 text-accent" /> : <Trash2 className="w-3 h-3 text-destructive" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="bg-muted/80">
            <TableRow>
              <TableCell colSpan={8} className="text-right font-bold uppercase tracking-wider text-xs">
                Precio x m² Promedio Ponderado
              </TableCell>
              <TableCell colSpan={3} className="text-lg font-black text-foreground">
                USD {Math.round(resultado.precio_medio_m2_ponderado).toLocaleString()}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {resultado.resultados_comparables.some(c => c.es_outlier && !c.excluido) && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 font-medium text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>Hay comparables que se desvían más de un 20% de la media (Outliers). Revise sus características o exclúyalos.</span>
          </div>
          <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-500 hover:bg-amber-500/20 whitespace-nowrap" onClick={() => {
            const outLiersIds = resultado.resultados_comparables.filter(c => c.es_outlier).map(c => c.comparable_id);
            setExcluidos([...new Set([...excluidos, ...outLiersIds])]);
          }}>
            Ocultar Outliers
          </Button>
        </div>
      )}

      <div className="pt-4 flex justify-between">
        <Button variant="outline" className="h-12 border-accent/20" onClick={onPrev}>
          Volver a Comparables
        </Button>
        <Button className="h-12 px-8 bg-accent hover:bg-accent/90" onClick={() => onNext(resultado)}>
          Finalizar Tasación
        </Button>
      </div>
    </div>
  );
}
