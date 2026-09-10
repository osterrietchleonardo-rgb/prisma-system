import { listarAprobaciones, listarConversacionesConActividad } from "@/app/actions/equipo"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AprobacionesClient from "./AprobacionesClient"
import TrazabilidadClient from "./TrazabilidadClient"
import OperacionesClient from "./OperacionesClient"
import { listarOperacionesDelEquipo } from "@/actions/tracking/operacionesDelEquipo"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Equipo - Prisma System",
}

export default async function EquipoPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const [aprobaciones, actividad, operaciones] = await Promise.all([
    listarAprobaciones(),
    listarConversacionesConActividad(),
    listarOperacionesDelEquipo(),
  ])
  const solapasValidas = ["aprobaciones", "trazabilidad", "operaciones"]
  const solapa = solapasValidas.includes(searchParams?.tab ?? "") ? searchParams!.tab! : "aprobaciones"
  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Equipo
        </h1>
        <p className="text-muted-foreground">
          Lo que necesita tu decisión y la historia completa de cada cliente con su asesor.
        </p>
      </div>
      <Tabs defaultValue={solapa} className="space-y-4">
        <TabsList>
          <TabsTrigger value="aprobaciones">
            Aprobaciones{aprobaciones.pendientes.length > 0 ? ` (${aprobaciones.pendientes.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="trazabilidad">Trazabilidad</TabsTrigger>
          <TabsTrigger value="operaciones">
            Operaciones{operaciones.sospechosos.length > 0 ? ` (${operaciones.sospechosos.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="aprobaciones">
          <AprobacionesClient pendientes={aprobaciones.pendientes} historial={aprobaciones.historial} asesores={aprobaciones.asesores} />
        </TabsContent>
        <TabsContent value="trazabilidad">
          <TrazabilidadClient conversaciones={actividad.conversaciones} asesores={actividad.asesores} />
        </TabsContent>
        <TabsContent value="operaciones">
          <OperacionesClient datos={operaciones} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
