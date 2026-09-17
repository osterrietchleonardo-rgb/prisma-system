import type { Metadata } from "next"
import { FormaTrabajoForm } from "@/components/marketing-ia/forma-trabajo-form"

export const metadata: Metadata = { title: "Mi ADN | PRISMA" }

/** Antes: la solapa "Mi ADN" de Marketing IA. */
export default function MiAdnPage() {
  return <FormaTrabajoForm />
}
