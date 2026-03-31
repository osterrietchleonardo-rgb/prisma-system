"use client";

import { Sujeto, TipoPropiedad, EstadoConservacion, CalidadConstruccion, Orientacion, Vista, SituacionOcupacion, Moneda, Amenidades } from "@/lib/tasacion/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Step1SujetoProps {
  sujeto: Sujeto;
  onChange: (sujeto: Sujeto) => void;
  onNext: () => void;
}

export function Step1Sujeto({ sujeto, onChange, onNext }: Step1SujetoProps) {
  
  const handleAmenidadToggle = (key: keyof Amenidades) => {
    onChange({
      ...sujeto,
      amenidades: {
        ...sujeto.amenidades,
        [key]: !sujeto.amenidades[key]
      }
    });
  };

  const isValido = () => {
    return sujeto.direccion && sujeto.barrio && sujeto.m2_cubiertos > 0;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
      
      {/* IDENTIFICACIÓN */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold border-b border-accent/10 pb-2">1. Identificación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Dirección completa</Label>
            <Input 
              placeholder="Ej: Av. Libertador 1500, Piso 5 Dpto A" 
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.direccion}
              onChange={(e) => onChange({...sujeto, direccion: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Barrio / Zona</Label>
            <Input 
              placeholder="Ej: Recoleta" 
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.barrio}
              onChange={(e) => onChange({...sujeto, barrio: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tipo de propiedad</Label>
            <Select value={sujeto.tipo_propiedad} onValueChange={(v: TipoPropiedad) => onChange({...sujeto, tipo_propiedad: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="departamento">Departamento</SelectItem>
                <SelectItem value="casa">Casa</SelectItem>
                <SelectItem value="ph">PH</SelectItem>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="oficina">Oficina</SelectItem>
                <SelectItem value="terreno">Terreno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* SUPERFICIES */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold border-b border-accent/10 pb-2">2. Superficies (m²)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Cubiertos *</Label>
            <Input 
              type="number"
              min="0"
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.m2_cubiertos || ''}
              onChange={(e) => onChange({...sujeto, m2_cubiertos: Number(e.target.value)})}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Semicubiertos</Label>
            <Input 
              type="number"
              min="0"
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.m2_semicubiertos || ''}
              onChange={(e) => onChange({...sujeto, m2_semicubiertos: Number(e.target.value)})}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Descubiertos</Label>
            <Input 
              type="number"
              min="0"
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.m2_descubiertos || ''}
              onChange={(e) => onChange({...sujeto, m2_descubiertos: Number(e.target.value)})}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground lg:text-xs">Terreno (Casas)</Label>
            <Input 
              type="number"
              min="0"
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.m2_terreno || ''}
              onChange={(e) => onChange({...sujeto, m2_terreno: Number(e.target.value)})}
            />
          </div>
        </div>
      </div>

      {/* CARACTERISTICAS FISICAS */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold border-b border-accent/10 pb-2">3. Características</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Antigüedad (Años)</Label>
            <Input 
              type="number"
              min="0"
              className="bg-card/50 border-accent/10 focus-visible:ring-accent"
              value={sujeto.antiguedad_anios || ''}
              onChange={(e) => onChange({...sujeto, antiguedad_anios: Number(e.target.value)})}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Estado</Label>
            <Select value={sujeto.estado_conservacion} onValueChange={(v: EstadoConservacion) => onChange({...sujeto, estado_conservacion: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="muy_bueno">Muy Bueno / A nuevo</SelectItem>
                <SelectItem value="bueno">Bueno</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="malo">Malo</SelectItem>
                <SelectItem value="muy_malo">Muy Malo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Calidad Const.</Label>
            <Select value={sujeto.calidad_construccion} onValueChange={(v: CalidadConstruccion) => onChange({...sujeto, calidad_construccion: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="economica">Económica</SelectItem>
                <SelectItem value="estandar">Estándar</SelectItem>
                <SelectItem value="buena">Buena</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="lujo">Lujo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Orientación</Label>
            <Select value={sujeto.orientacion} onValueChange={(v: Orientacion) => onChange({...sujeto, orientacion: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="norte">Norte</SelectItem>
                <SelectItem value="sur">Sur</SelectItem>
                <SelectItem value="este">Este</SelectItem>
                <SelectItem value="oeste">Oeste</SelectItem>
                <SelectItem value="ne">Noreste</SelectItem>
                <SelectItem value="no">Noroeste</SelectItem>
                <SelectItem value="se">Sureste</SelectItem>
                <SelectItem value="so">Suroeste</SelectItem>
                <SelectItem value="nd">N/A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Dormitorios</Label>
            <Input type="number" min="0" value={sujeto.dormitorios || ''} onChange={(e) => onChange({...sujeto, dormitorios: Number(e.target.value)})} className="bg-card/50 border-accent/10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Baños</Label>
            <Input type="number" min="0" value={sujeto.banos || ''} onChange={(e) => onChange({...sujeto, banos: Number(e.target.value)})} className="bg-card/50 border-accent/10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Piso (0 = PB)</Label>
            <Input type="number" min="0" value={sujeto.piso || ''} onChange={(e) => onChange({...sujeto, piso: Number(e.target.value)})} className="bg-card/50 border-accent/10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Vista</Label>
            <Select value={sujeto.vista} onValueChange={(v: Vista) => onChange({...sujeto, vista: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frente">Frente</SelectItem>
                <SelectItem value="contrafrente">Contrafrente</SelectItem>
                <SelectItem value="lateral">Lateral</SelectItem>
                <SelectItem value="al_verde">Al Verde</SelectItem>
                <SelectItem value="panoramica">Panorámica</SelectItem>
                <SelectItem value="nd">N/A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* AMENIDADES */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold border-b border-accent/10 pb-2">4. Amenidades</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-card/20 p-4 rounded-xl border border-accent/5">
          {Object.entries({
            cochera_cubierta: "Cochera Cubierta",
            cochera_descubierta: "Cochera Descub.",
            baulera: "Baulera",
            pileta: "Pileta",
            gimnasio: "Gimnasio",
            sum: "SUM",
            seguridad_24hs: "Seguridad 24hs",
            jardin_privado: "Jardín Privado",
            terraza_privada: "Terraza Privada"
          }).map(([k, label]) => {
            const key = k as keyof Amenidades;
            return (
              <div key={key} className="flex items-center space-x-2">
                <Switch id={key} checked={sujeto.amenidades[key]} onCheckedChange={() => handleAmenidadToggle(key)} />
                <Label htmlFor={key} className="cursor-pointer font-medium">{label}</Label>
              </div>
            );
          })}
        </div>
      </div>

      {/* SITUACIÓN */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold border-b border-accent/10 pb-2">5. Situación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ocupación</Label>
            <Select value={sujeto.ocupacion} onValueChange={(v: SituacionOcupacion) => onChange({...sujeto, ocupacion: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="libre">Libre</SelectItem>
                <SelectItem value="alquilado">Alquilado</SelectItem>
                <SelectItem value="ocupado">Ocupado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Moneda de Valoración</Label>
            <Select value={sujeto.moneda} onValueChange={(v: Moneda) => onChange({...sujeto, moneda: v})}>
              <SelectTrigger className="bg-card/50 border-accent/10">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">Dólares (USD)</SelectItem>
                <SelectItem value="ARS">Pesos (ARS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <Button className="h-12 w-full md:w-auto px-8 bg-accent hover:bg-accent/90" size="lg" disabled={!isValido()} onClick={onNext}>
          Continuar a Comparables
        </Button>
      </div>
    </div>
  );
}
