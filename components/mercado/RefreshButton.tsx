"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type RefreshState = "idle" | "loading" | "success" | "error"

export function RefreshButton() {
  const [state, setState] = useState<RefreshState>("idle")
  const router = useRouter()

  const handleClick = async () => {
    if (state === "loading") return
    setState("loading")

    try {
      const res = await fetch("/api/mercado/refresh", { method: "POST" })
      if (!res.ok) throw new Error("Refresh failed")

      setState("success")
      router.refresh()
      setTimeout(() => setState("idle"), 2000)
    } catch {
      setState("error")
      setTimeout(() => setState("idle"), 3000)
    }
  }

  const config = {
    idle: {
      icon: <RefreshCw className="w-4 h-4" />,
      label: "Actualizar datos",
      className: "bg-accent text-accent-foreground hover:bg-accent/90",
    },
    loading: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      label: "Actualizando...",
      className: "bg-accent/70 text-accent-foreground cursor-not-allowed",
    },
    success: {
      icon: <Check className="w-4 h-4 text-emerald-400" />,
      label: "Actualizado",
      className: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    },
    error: {
      icon: <X className="w-4 h-4 text-red-400" />,
      label: "Error al actualizar",
      className: "bg-red-500/20 text-red-400 border border-red-500/30",
    },
  }

  const { icon, label, className } = config[state]

  return (
    <Button
      onClick={handleClick}
      disabled={state === "loading"}
      className={`gap-2 text-sm font-semibold transition-all duration-200 ${className}`}
      size="sm"
    >
      {icon}
      <span>{label}</span>
    </Button>
  )
}
