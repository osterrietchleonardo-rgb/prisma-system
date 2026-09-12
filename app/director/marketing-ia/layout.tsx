import type { ReactNode } from "react"
import { Bot } from "lucide-react"
import { AiCreditBadge } from "@/components/ai-credit-badge"
import { NavegacionMarketing } from "@/components/marketing-ia/navegacion-marketing"

/**
 * Marketing IA del director. Antes era una sola página con 7 solapas; desde el
 * 12/9/2026 cada solapa es una página del grupo «Marketing IA» del menú. Este
 * layout es el encabezado que compartían, y el que escucha los saltos
 * automáticos entre secciones.
 */
export default function MarketingIaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full px-4 md:px-8 py-8 space-y-8 animate-in fade-in duration-700">
      <NavegacionMarketing rol="director" />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Bot className="w-8 h-8 text-accent" />
            Marketing IA Pro
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Cree perfiles de cliente ideal, genere copies estratégicos y diseñe anuncios de alto impacto en segundos.
          </p>
        </div>
        <AiCreditBadge className="w-fit" />
      </div>

      {children}
    </div>
  )
}
