import { listarAprobaciones } from "@/app/actions/equipo"
import AprobacionesClient from "./AprobacionesClient"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Aprobaciones - Prisma System",
}

export default async function AprobacionesPage() {
  const datos = await listarAprobaciones()
  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto w-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Aprobaciones
        </h1>
        <p className="text-muted-foreground">
          Lo que el equipo o el agente necesitan que decidas. Cada pedido se resuelve una sola vez; si nadie responde en 48 h, no se ejecuta nada.
        </p>
      </div>
      <AprobacionesClient pendientes={datos.pendientes} historial={datos.historial} asesores={datos.asesores} />
    </div>
  )
}
