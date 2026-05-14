"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { getInstanceStatus } from "@/app/actions/whatsapp"

export function ConnectionIndicator({ instanceId, initialStatus }: { instanceId: string, initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus)

  useEffect(() => {
    let interval: NodeJS.Timeout
    async function check() {
      const res = await getInstanceStatus(instanceId)
      if (res.success && res.data?.state) {
        setStatus(res.data.state)
      }
    }

    interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [instanceId])

  const dotColor = status === "connected" ? "bg-green-500" : status === "pending" ? "bg-yellow-500" : "bg-red-500"
  const label = status === "connected" ? "Conectado" : status === "pending" ? "Conectando..." : "Desconectado"

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 ml-4 rounded-full border bg-muted/50">
      <div className={`w-2 h-2 rounded-full ${dotColor} ${status === "connected" || status === "pending" ? "animate-pulse" : ""}`} aria-hidden="true" />
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  )
}
