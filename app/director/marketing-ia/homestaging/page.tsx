import type { Metadata } from "next"
import { FotosIA } from "@/components/marketing-ia/fotos-ia"

export const metadata: Metadata = { title: "HomeStaging | PRISMA" }

/** Antes: la solapa "Fotos" de Marketing IA. Cambió el nombre, no el contenido. */
export default function HomeStagingPage() {
  return <FotosIA />
}
