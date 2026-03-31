"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, ShieldCheck, Tags, Database, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataStructureTab() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <StructureCard 
          icon={<User className="h-6 w-6 text-blue-500" />}
          title="Capa 1: Contacto"
          description="Datos básicos de identidad y comunicación recolectados del lead."
          items={[
            "Nombre completo / 'Sin nombre'",
            "Email principal y secundarios",
            "Teléfono de contacto y celular",
            "Estado del lead (Activo, Cerrado, etc.)"
          ]}
          color="border-blue-500/20 bg-blue-500/5"
        />
        <StructureCard 
          icon={<ShieldCheck className="h-6 w-6 text-emerald-500" />}
          title="Capa 2: Agente Asignado"
          description="Información vinculada del asesor responsable dentro de la inmobiliaria."
          items={[
            "ID único del agente",
            "Nombre y apellido del asesor",
            "Avatar y datos de contacto",
            "Estado de actividad (agente_activo)"
          ]}
          color="border-emerald-500/20 bg-emerald-500/5"
        />
        <StructureCard 
          icon={<Tags className="h-6 w-6 text-purple-500" />}
          title="Capa 3: Etiquetas (Tags)"
          description="Meta-información para segmentación y automatización de procesos."
          items={[
            "Origen de contacto (Zonaprop, Web, etc.)",
            "Tipo de propiedad (Departamento, Casa, etc.)",
            "Tipo de pedido y operación",
            "Etiquetas libres de sistema"
          ]}
          color="border-purple-500/20 bg-purple-500/5"
        />
      </div>

      <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
        <CardHeader>
           <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-accent" />
              <CardTitle className="text-lg">Interconexión de Datos</CardTitle>
           </div>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="relative p-6 border border-accent/10 rounded-xl bg-accent/5 overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Database className="h-24 w-24" />
              </div>
              <div className="space-y-4 max-w-2xl">
                 <p className="text-sm leading-relaxed">
                    La estructura de Tokko CRM permite una **trazabilidad completa**. Cada lead no es solo un registro aislado, sino un nodo conectado con:
                 </p>
                 <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <li className="flex items-center gap-2 text-xs">
                       <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                       <span>**Temporalidad:** `created_at` vs `deleted_at` para velocidad de respuesta.</span>
                    </li>
                    <li className="flex items-center gap-2 text-xs">
                       <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                       <span>**Segmentación:** Agrupación por grupo de tag (e.g. Origen vs Operación).</span>
                    </li>
                    <li className="flex items-center gap-2 text-xs">
                       <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                       <span>**Responsabilidad:** Vinculación directa con la performance del agente.</span>
                    </li>
                    <li className="flex items-center gap-2 text-xs">
                       <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                       <span>**Calidad:** Análisis de completitud de campos obligatorios.</span>
                    </li>
                 </ul>
              </div>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StructureCard({ icon, title, description, items, color }: { 
  icon: React.ReactNode, title: string, description: string, items: string[], color: string 
}) {
  return (
    <Card className={cn("border transition-all hover:scale-[1.02]", color)}>
      <CardContent className="p-6 space-y-4">
        <div className="p-3 rounded-xl bg-background/50 inline-block">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-lg">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-2 pt-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span className="text-xs text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
