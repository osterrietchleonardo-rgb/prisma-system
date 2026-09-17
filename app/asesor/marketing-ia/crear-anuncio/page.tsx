import type { Metadata } from "next"
import { CopyGeneratorFlow } from "@/components/marketing-ia/copy-generator-flow"

export const metadata: Metadata = { title: "Crear Anuncio | PRISMA" }

/** Antes: la solapa "Crear Anuncio" de Marketing IA. */
export default function CrearAnuncioPage() {
  return <CopyGeneratorFlow />
}
