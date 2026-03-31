"use client";

import { useState } from "react";
import { Comparable, SituacionOcupacion, Moneda } from "@/lib/tasacion/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Building, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Step2ComparablesProps {
  comparables: Comparable[];
  onChange: (comparables: Comparable[]) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Step2Comparables({ comparables, onChange, onNext, onPrev }: Step2ComparablesProps) {
  const [modalManualOpen, setModalManualOpen] = useState(false);
  const [modalTokkoOpen, setModalTokkoOpen] = useState(false);
  
  const [tokkoQuery, setTokkoQuery] = useState("");
  const [isSearchingTokko, setIsSearchingTokko] = useState(false);
  const [tokkoResults, setTokkoResults] = useState<any[]>([]);

  // Partial comparable state for manual entry
  const [newComp, setNewComp] = useState<Partial<Comparable>>({
    tipo_precio: 'oferta',
    fuente: 'ZonaProp',
    peso: 3,
    amenidades: {
        cochera_cubierta: false,
        cochera_descubierta: false,
        baulera: false,
        pileta: false,
        gimnasio: false,
        sum: false,
        seguridad_24hs: false,
        jardin_privado: false,
        terraza_privada: false
    }
  });

  const handleAddManual = () => {
    // Generate simple ID
    const comp: Comparable = {
      ...newComp,
      id: "MANUAL-" + Date.now().toString(),
    } as Comparable;
    onChange([...comparables, comp]);
    setModalManualOpen(false);
  };

  const handleTokkoSearch = async () => {
    if (!tokkoQuery) return;
    setIsSearchingTokko(true);
    try {
      const res = await fetch(`/api/tokko-proxy/property?limit=15&offset=0&q=${encodeURIComponent(tokkoQuery)}`);
      if (!res.ok) throw new Error("Error in Tokko search");
      const data = await res.json();
      setTokkoResults(data.objects || []);
    } catch (e) {
      toast.error("Error buscando en Tokko");
    } finally {
      setIsSearchingTokko(false);
    }
  };

  const importFromTokko = (p: any) => {
    // Extraer precio principal (usualmente 'Venta' de operations)
    const saleOp = p.operations?.find((o: any) => o.operation_type === 'Venta') || p.operations?.[0];
    const precio = saleOp?.prices?.[0]?.price || 0;

    const comp: Comparable = {
      id: `TOKKO-${p.id}`,
      fuente: 'Tokko',
      url_referencia: `https://tokkobroker.com/properties/${p.id}`,
      precio: precio,
      fecha_operacion: new Date().toISOString(),
      tipo_precio: 'oferta', // por default los listados son de oferta
      peso: 3,

      direccion: p.fake_address || p.address || "",
      barrio: p.location?.name || "",
      tipo_propiedad: p.type?.name?.toLowerCase()?.includes('departamento') ? 'departamento' : 'casa',
      
      m2_cubiertos: p.roofed_surface || p.surface || 0,
      m2_semicubiertos: p.semiroofed_surface || 0,
      m2_descubiertos: p.unroofed_surface || 0,
      m2_terreno: p.surface || 0,

      antiguedad_anios: p.age || 0,
      estado_conservacion: 'bueno', // por defecto asumimos bueno porque Tokko usa id ids para el estado
      calidad_construccion: 'estandar',
      dormitorios: p.room_amount ? p.room_amount - 1 : 0,
      banos: p.bathroom_amount || 0,
      orientacion: 'norte', // Default
      piso: 0,
      vista: 'frente', // Default
      amenidades: {
        cochera_cubierta: p.parking_lot_amount > 0,
        cochera_descubierta: false,
        baulera: false,
        pileta: Boolean(p.tags?.some((t:any) => t.type === 2 && t.name.toLowerCase().includes('pileta'))),
        gimnasio: Boolean(p.tags?.some((t:any) => t.type === 2 && t.name.toLowerCase().includes('gimnasio'))),
        sum: Boolean(p.tags?.some((t:any) => t.type === 2 && t.name.toLowerCase().includes('sum'))),
        seguridad_24hs: false,
        jardin_privado: false,
        terraza_privada: false
      },
      moneda: saleOp?.prices?.[0]?.currency || 'USD'
    };

    if (comparables.find(c => c.id === comp.id)) {
      toast.warning("Este comparable ya ha sido agregado.");
      return;
    }

    onChange([...comparables, comp]);
    toast.success("Comparable de Tokko importado.");
    setModalTokkoOpen(false);
  };

  const removeComparable = (id: string) => {
    onChange(comparables.filter(c => c.id !== id));
  };

  const isNextValid = comparables.length >= 3;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <div className="flex justify-between items-center border-b border-accent/10 pb-4">
        <div>
          <h3 className="text-xl font-black">Comparables de Mercado</h3>
          <p className="text-sm text-muted-foreground">Debes agregar al menos 3 comparables para la homogeneización.</p>
        </div>
        <div className="flex gap-2">
          {/* TOKKO BUTTON */}
          <Dialog open={modalTokkoOpen} onOpenChange={(open) => {
            setModalTokkoOpen(open);
            if (!open) { setTokkoResults([]); setTokkoQuery(""); }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-accent/20 bg-accent/5">
                <Search className="w-4 h-4" /> Buscar en Tokko
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Importar desde Tokko Broker</DialogTitle>
              </DialogHeader>
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="ID, Ubicación o Tipo (Ej: Belgrano)" 
                  value={tokkoQuery} 
                  onChange={(e) => setTokkoQuery(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                       await handleTokkoSearch();
                    }
                  }}
                />
                <Button onClick={handleTokkoSearch} disabled={isSearchingTokko || !tokkoQuery}>
                  {isSearchingTokko ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Buscar
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {tokkoResults.length === 0 && !isSearchingTokko ? (
                  <div className="py-8 text-center space-y-4">
                    <Building className="w-12 h-12 text-accent/50 mx-auto" />
                    <p className="text-muted-foreground text-sm">Busca por ubicación, ID, o palabra clave para encontrar propiedades comparables.</p>
                  </div>
                ) : (
                  tokkoResults.map(p => (
                     <div key={p.id} className="p-3 border border-accent/10 rounded-xl bg-card/50 flex justify-between items-center transition-all hover:border-accent/40">
                       <div>
                         <p className="font-bold text-sm bg-accent/10 text-accent px-2 rounded w-max mb-1 uppercase text-[10px]">Tokko ID: {p.reference_code}</p>
                         <p className="font-semibold">{p.fake_address || p.address}</p>
                         <p className="text-xs text-muted-foreground flex gap-2 mt-1">
                           <span>{p.surface} m²</span>
                           <span>•</span>
                           <span>{p.room_amount} Amb.</span>
                           <span>•</span>
                           <span>{p.bathroom_amount} Baños</span>
                         </p>
                       </div>
                       <div className="text-right flex items-center gap-4">
                         {p.operations?.map((op: any) => (
                           <div key={op.operation_type}>
                             <p className="text-lg font-black">{op.prices[0]?.currency} {op.prices[0]?.price.toLocaleString()}</p>
                           </div>
                         ))}
                         <Button size="sm" onClick={() => importFromTokko(p)}>Importar</Button>
                       </div>
                     </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* MANUAL BUTTON */}
          <Dialog open={modalManualOpen} onOpenChange={setModalManualOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-accent hover:bg-accent/90">
                <Plus className="w-4 h-4" /> Agregar Manual
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo Comparable Manual</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label>Fuente</Label>
                  <Select value={newComp.fuente} onValueChange={(v: any) => setNewComp({...newComp, fuente: v})}>
                    <SelectTrigger><SelectValue placeholder="Fuente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZonaProp">ZonaProp</SelectItem>
                      <SelectItem value="Argenprop">Argenprop</SelectItem>
                      <SelectItem value="MercadoLibre">MercadoLibre</SelectItem>
                      <SelectItem value="Operación propia cerrada">Cierre Propio</SelectItem>
                      <SelectItem value="Tokko">Tokko</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor Total (USD)</Label>
                  <Input type="number" onChange={(e) => setNewComp({...newComp, precio: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>m² Cubiertos</Label>
                  <Input type="number" onChange={(e) => setNewComp({...newComp, m2_cubiertos: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>m² Semicub.</Label>
                  <Input type="number" onChange={(e) => setNewComp({...newComp, m2_semicubiertos: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>Dirección referencial</Label>
                  <Input onChange={(e) => setNewComp({...newComp, direccion: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo Precio</Label>
                  <Select value={newComp.tipo_precio} onValueChange={(v: any) => setNewComp({...newComp, tipo_precio: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oferta">Oferta Publicada</SelectItem>
                      <SelectItem value="cierre">Cierre Confirmado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full bg-accent hover:bg-accent/90" onClick={handleAddManual}>Guardar Comparable</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-accent/10 rounded-2xl overflow-hidden bg-card/20">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Fuente</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Tipo Precio</TableHead>
              <TableHead>USD Total</TableHead>
              <TableHead>m² Cub.</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay comparables agregados. Usa los botones superiores.
                </TableCell>
              </TableRow>
            ) : (
              comparables.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-xs">{c.fuente}</TableCell>
                  <TableCell className="text-xs">{c.direccion}</TableCell>
                  <TableCell>
                    <span className={`text-[10px] uppercase px-2 py-1 rounded-full ${c.tipo_precio === 'cierre' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}>
                      {c.tipo_precio}
                    </span>
                  </TableCell>
                  <TableCell className="font-bold">US$ {c.precio?.toLocaleString()}</TableCell>
                  <TableCell>{c.m2_cubiertos} m²</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeComparable(c.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="pt-4 flex justify-between">
        <Button variant="outline" className="h-12 border-accent/20" onClick={onPrev}>
          Volver a Sujeto
        </Button>
        <Button className="h-12 px-8 bg-accent hover:bg-accent/90" disabled={!isNextValid} onClick={onNext}>
          Ir a Grilla Homogeneizadora ({comparables.length}/3 min)
        </Button>
      </div>
    </div>
  );
}
