"use client"

import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"

// COMPONENTE LOCAL (Para evitar errores de importación en el celular)
function WhatsAppTabsLocal({ instance }: { instance: any }) {
  return (
    <div className="flex-1 flex flex-col bg-background p-10">
      <div className="bg-purple-600 p-4 text-white text-sm font-bold text-center rounded-lg shadow-lg">
        ¡VIOLETA OK! COMPONENTE LOCAL MONTADO.<br/>
        ID: {instance?.id}
      </div>
      <div className="mt-10 p-4 border border-dashed rounded-lg text-center text-muted-foreground">
        Si ves este mensaje violeta, el problema era la importación del archivo externo.<br/>
        Estamos progresando.
      </div>
    </div>
  )
}

export default function AsesorIAWhatsAppPage() {
  const [instance, setInstance] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadInstance() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("agency_id", user.id)
        .maybeSingle()

      setInstance(data)
      setLoading(false)
    }
    loadInstance()
  }, [])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div id="whatsapp-ia-page" className="flex-1 flex flex-col min-h-0 whatsapp-page-container bg-background">
      {/* Banner de Diagnóstico */}
      <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-1 flex items-center justify-between">
        <span className="text-[10px] font-mono text-yellow-600">
          DEBUG: ID={instance?.id?.substring(0,8) || "NULL"} | AG={instance?.agency_id?.substring(0,8) || "NULL"} | ST={instance?.status || "UNK"}
        </span>
        <span className="text-[10px] font-mono text-green-600 animate-pulse">● LIVE</span>
      </div>

      {!instance ? (
        <SetupWizard />
      ) : (
        <WhatsAppErrorBoundary>
          <WhatsAppTabsLocal instance={instance} />
        </WhatsAppErrorBoundary>
      )}
    </div>
  )
}
