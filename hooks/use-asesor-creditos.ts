"use client"

import { useState, useEffect, useCallback } from "react"

export interface AsesorCreditData {
  limiteMensual: number
  consumidoMes: number
  disponible: number
  porcentaje: number
  desglosePorFeature: { feature: string; total: number }[]
  mesActual: string
  numAsesoresAgencia: number
  creditsAsesoresTotal: number
}

/**
 * Hook que obtiene los créditos personales del asesor autenticado.
 * Se refresca automáticamente cuando se dispara el evento
 * `prisma-refresh-credits` o `generation-complete`.
 */
export function useAsesorCreditos() {
  const [data, setData] = useState<AsesorCreditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/asesor/creditos")
      if (!res.ok) {
        // Si no es asesor (ej. director viendo la misma ruta), silenciar
        setData(null)
        return
      }
      const json: AsesorCreditData = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      console.error("[useAsesorCreditos] fetch error:", err)
      setError("Error al cargar créditos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCredits()

    const refresh = () => fetchCredits()
    window.addEventListener("prisma-refresh-credits", refresh)
    window.addEventListener("generation-complete", refresh)

    return () => {
      window.removeEventListener("prisma-refresh-credits", refresh)
      window.removeEventListener("generation-complete", refresh)
    }
  }, [fetchCredits])

  return { data, loading, error, refetch: fetchCredits }
}
