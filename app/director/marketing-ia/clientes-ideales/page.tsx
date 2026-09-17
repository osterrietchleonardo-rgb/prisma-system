import type { Metadata } from "next"
import { IpcManager } from "@/components/marketing-ia/ipc-manager"

export const metadata: Metadata = { title: "Clientes Ideales (IPC) | PRISMA" }

/** Antes: la solapa "Clientes Ideales (IPC)" de Marketing IA. */
export default function ClientesIdealesPage() {
  return <IpcManager />
}
