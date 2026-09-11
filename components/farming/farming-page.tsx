"use client"

// La página Farming del asesor. Etapa 1: solo «Mis zonas». Las solapas «Relevamiento» y
// «A la venta en mi zona» llegan en las etapas 3 y 2: acá no se dibujan solapas vacías.
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { Dibujo } from "@/lib/farming/geometria"
import type { RespuestaZonas, ZonaFarming } from "@/lib/farming/tipos"
import { ListaZonas } from "./lista-zonas"
import { CompartirDialog } from "./compartir-dialog"
import { MapaFarming, type ModoMapa } from "./mapa-farming"

/** Un pedido a la API que, si viene 409, rechaza con los choques adentro. */
async function pedir(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e: any = new Error(d.error || "Algo salió mal")
    if (r.status === 409) e.choques = d.choques
    throw e
  }
  return d
}

export function FarmingPage() {
  const [datos, setDatos] = useState<RespuestaZonas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modo, setModo] = useState<ModoMapa | null>(null)
  const [compartiendo, setCompartiendo] = useState<ZonaFarming | null>(null)

  const recargar = useCallback(async () => {
    try {
      setDatos(await pedir("/api/farming/zonas"))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { recargar() }, [recargar])

  // El diálogo de compartir muestra la zona con su lista de compartidos al día.
  useEffect(() => {
    if (!compartiendo || !datos) return
    const fresca = datos.mias.find((z) => z.id === compartiendo.id)
    if (fresca && fresca !== compartiendo) setCompartiendo(fresca)
  }, [datos, compartiendo])

  const guardar = async ({ nombre, geojson }: { nombre?: string; geojson: Dibujo }) => {
    if (!modo || modo.tipo === "ver") return
    if (modo.tipo === "nueva") {
      await pedir("/api/farming/zonas", { method: "POST", body: JSON.stringify({ nombre, geojson }) })
      toast.success("Zona guardada")
    } else {
      await pedir(`/api/farming/zonas/${modo.zonaId}`, { method: "PATCH", body: JSON.stringify({ accion: modo.tipo, geojson }) })
      toast.success(modo.tipo === "sumar" ? "Pedazo sumado" : "Zona redibujada")
    }
    setModo(null)
    await recargar()
  }

  const borrar = async (z: ZonaFarming) => {
    // ETAPA 3: si la zona tiene tarjetas, el texto cambia: "se archiva, tus tarjetas quedan".
    if (!window.confirm(`¿Borrar «${z.nombre}»? Esas cuadras quedan libres para otro asesor.`)) return
    try {
      await pedir(`/api/farming/zonas/${z.id}`, { method: "DELETE" })
      toast.success("Zona borrada")
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const sumarColega = async (zonaId: string, userId: string) => {
    try {
      await pedir(`/api/farming/zonas/${zonaId}/compartir`, { method: "POST", body: JSON.stringify({ user_id: userId }) })
      toast.success("Zona compartida")
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const sacarColega = async (zonaId: string, userId: string) => {
    try {
      await pedir(`/api/farming/zonas/${zonaId}/compartir?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" })
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (cargando || !datos) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Farming</h1>
        <p className="text-sm text-muted-foreground">Tu territorio: las cuadras que trabajás para captar propiedades.</p>
      </div>

      {modo ? (
        // Key con el modo: MapaFarming arranca lapizActivo a partir de modo.tipo solo al
        // montarse, así que cambiar de "ver" a "redibujar" (u otro modo) sin desmontar dejaría
        // el lápiz en el estado del modo anterior.
        <MapaFarming key={`${modo.tipo}-${"zonaId" in modo ? modo.zonaId : ""}`} modo={modo} ajenas={datos.ajenas} onGuardar={guardar} onCerrar={() => setModo(null)} />
      ) : (
        <ListaZonas
          mias={datos.mias}
          compartidasConmigo={datos.compartidas_conmigo}
          topes={datos.topes}
          onNueva={() => setModo({ tipo: "nueva" })}
          onVer={(z) => setModo({ tipo: "ver", actual: z.geojson })}
          onRedibujar={(z) => setModo({ tipo: "redibujar", zonaId: z.id, actual: z.geojson })}
          onSumar={(z) => setModo({ tipo: "sumar", zonaId: z.id, actual: z.geojson })}
          onCompartir={(z) => setCompartiendo(z)}
          onBorrar={borrar}
        />
      )}

      <CompartirDialog
        zona={compartiendo}
        colegas={datos.colegas}
        onSumar={sumarColega}
        onSacar={sacarColega}
        onCerrar={() => setCompartiendo(null)}
      />
    </div>
  )
}
