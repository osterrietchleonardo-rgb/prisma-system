// Asesores → Plantillas tiene dos cosas distintas adentro. La primera es la que pidió Leonardo
// desde el principio (documentos que el asesor comparte con sus clientes); la segunda es el
// módulo de contratos Word que se construyó antes, renombrado para que se entienda qué es.
"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlantillasClientes } from "@/components/documentos/PlantillasClientes";
import { PlantillasTab } from "./PlantillasTab";

export function PlantillasSolapas() {
  return (
    <Tabs defaultValue="clientes" className="flex h-full min-h-0 flex-col">
      <TabsList className="shrink-0 self-start mb-3">
        <TabsTrigger value="clientes">Documentos para clientes</TabsTrigger>
        <TabsTrigger value="word">Contratos desde Word</TabsTrigger>
      </TabsList>
      <TabsContent value="clientes" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-0 data-[state=inactive]:hidden">
        <PlantillasClientes />
      </TabsContent>
      <TabsContent value="word" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
        <PlantillasTab />
      </TabsContent>
    </Tabs>
  );
}
