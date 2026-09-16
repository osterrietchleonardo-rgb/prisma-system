import { MessagesSquare, MessageSquareText } from "lucide-react"
import type { ConversationalData } from "@/lib/queries/conversacional"
import { etiquetaPeriodo } from "@/lib/dashboard/periodo"
import { Block1KPIs } from "./Block1_KPIs"
import { Block2Funnel } from "./Block2_Funnel"
import { Block3LeadProfile } from "./Block3_LeadProfile"
import { Block4DemandAnalysis } from "./Block4_DemandAnalysis"
import { Block5Temporal } from "./Block5_Temporal"
import { Block6AttentionQuality } from "./Block6_AttentionQuality"

/**
 * Inteligencia Conversacional: solo pinta. Los números llegan calculados desde el servidor
 * (`getConversationalData`), en vivo y con el filtro de arriba. Hasta el 15/9/2026 la sección
 * tenía su propio selector de período, un botón "Actualizar análisis" y leía un análisis
 * guardado: el director veía números viejos o de otro período sin saberlo.
 */
export function ConversationalIntelligence({ data }: { data: ConversationalData }) {
  const periodo = etiquetaPeriodo(data.from, data.to)

  return (
    <div className="mt-12 space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-6 w-6 text-accent shrink-0" />
          <h2 className="text-2xl font-bold tracking-tight">Inteligencia Conversacional</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Calculado en vivo con las conversaciones de WhatsApp que entraron en el período ({periodo}).
          Cada número sale de lo que quedó registrado en esas conversaciones; al lado se explica cómo se cuenta.
        </p>
      </div>

      {data.chats === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-card/30 border border-accent/10 rounded-2xl min-h-[220px] text-center">
          <MessageSquareText className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-bold mb-2">No hubo conversaciones de WhatsApp en este período</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Probá con un período más largo o con otro asesor en el filtro de arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          <Block1KPIs chats={data.chats} kpis={data.kpis} />
          <div className="border-t border-accent/10" />
          <Block2Funnel chats={data.chats} embudo={data.embudo} />
          <div className="border-t border-accent/10" />
          <Block3LeadProfile perfil={data.perfil} chats={data.chats} />
          <div className="border-t border-accent/10" />
          <Block4DemandAnalysis demanda={data.demanda} />
          <div className="border-t border-accent/10" />
          <Block5Temporal temporal={data.temporal} chats={data.chats} />
          <div className="border-t border-accent/10" />
          <Block6AttentionQuality
            atencion={data.atencion}
            chats={data.chats}
            pidieron={data.kpis.pidieronAsesor}
            tasaDerivacion={data.kpis.tasaDerivacion}
          />
        </div>
      )}
    </div>
  )
}
