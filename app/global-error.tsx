"use client"

import { useEffect } from "react"

// Respaldo final: se muestra solo si el error ocurre tan arriba que ni siquiera
// el layout principal pudo cargar. Reemplaza toda la página, por eso lleva su
// propio <html> y <body> y usa estilos en línea (no depende de nada del sistema).
function isStaleChunkError(error: Error) {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase()
  return (
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed")
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error boundary:", error)

    if (isStaleChunkError(error)) {
      const KEY = "prisma_chunk_reload"
      const last = Number(sessionStorage.getItem(KEY) || "0")
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
      }
    }
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h2 style={{ fontSize: "1.875rem", fontWeight: 700, margin: "0 0 1rem" }}>
            Algo salió mal
          </h2>
          <p style={{ fontSize: "1.125rem", color: "#94a3b8", margin: "0 0 2rem" }}>
            Hubo un problema al cargar el sistema. Probá recargar; casi siempre se
            soluciona al instante.
          </p>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#A855F7",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Recargar la página
            </button>
            <button
              onClick={() => reset()}
              style={{
                background: "transparent",
                color: "#e2e8f0",
                border: "1px solid rgba(168,85,247,0.3)",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
