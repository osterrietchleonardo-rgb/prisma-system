"use client"

import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppTabsWrapper } from "@/components/whatsapp/WhatsAppTabsWrapper"

export default function AsesorIAWhatsAppPage() {
  const [instance, setInstance] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadInstance() {
      try {
        // 1. Obtener el usuario actual
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        // 2. Obtener el agency_id del perfil del usuario
        const { data: profile } = await supabase
          .from("profiles")
          .select("agency_id")
          .eq("id", user.id)
          .single()

        if (!profile?.agency_id) {
          setLoading(false)
          return
        }

        // 3. Buscar la instancia de WhatsApp usando el agency_id REAL
        const { data: instanceData, error } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("agency_id", profile.agency_id)
          .maybeSingle()

        if (error) {
          console.error("Error loading instance:", error)
        }

        setInstance(instanceData)
      } catch (err) {
        console.error("Critical error in loadInstance:", err)
      } finally {
        setLoading(false)
      }
    }
    loadInstance()
  }, [])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground animate-pulse">Cargando tus mensajes...</p>
      </div>
    </div>
  )

  return (
    <div id="whatsapp-ia-page" className="flex-1 flex flex-col min-h-0 whatsapp-page-container bg-background">
      {!instance ? (
        <SetupWizard />
      ) : (
        <WhatsAppErrorBoundary>
          <WhatsAppTabsWrapper instance={instance} />
        </WhatsAppErrorBoundary>
      )}
    </div>
  )
}
