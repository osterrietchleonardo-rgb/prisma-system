"use client"

// La página Farming del asesor. Etapa 1: solo «Mis zonas». Las solapas «Relevamiento» y
// «A la venta en mi zona» llegan en las etapas 3 y 2: acá no se dibujan solapas vacías.
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { Dibujo } from "@/lib/farming/geometria"
import { contornosParaDibujar } from "@/lib/farming/armar"
import { pedir } from "@/lib/farming/cliente"
import type { RespuestaZonas, ZonaFarming } from "@/lib/farming/tipos"
import { ListaZonas } from "./lista-zonas"
import { CompartirDialog } from "./compartir-dialog"
import { MapaFarming, type ModoMapa } from "./mapa-farming"

export function FarmingPage() {
  const [datos, setDatos] = useState<RespuestaZonas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modo, setModo] = useState<ModoMapa | null>(null)
  const [compartiendo, setCompartiendo] = useState<ZonaFarming | null>(null)
  // El título del mapa en modo "ver": distinto según si la zona es mía o de un colega.
  const [tituloVer, setTituloVer] = useState("")

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
    let zona: ZonaFarming
    if (modo.tipo === "nueva") {
      zona = (await pedir("/api/farming/zonas", { method: "POST", body: JSON.stringify({ nombre, geojson }) })).zona
      toast.success("Zona guardada")
    } else {
      zona = (await pedir(`/api/farming/zonas/${modo.zonaId}`, { method: "PATCH", body: JSON.stringify({ accion: modo.tipo, geojson }) })).zona
      toast.success(modo.tipo === "sumar" ? "Pedazo sumado" : "Zona redibujada")
    }
    // La respuesta del servidor se aplica de una: así la tarjeta nunca muestra números viejos
    // (km²/pedazos) mientras la lista completa todavía se está recargando.
    setDatos((d) => d && { ...d, mias: modo.tipo === "nueva" ? [zona, ...d.mias] : d.mias.map((z) => (z.id === zona.id ? zona : z)) })
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
        <MapaFarming
          key={`${modo.tipo}-${"zonaId" in modo ? modo.zonaId : ""}`}
          modo={modo}
          ajenas={contornosParaDibujar(datos, "zonaId" in modo ? modo.zonaId : undefined)}
          titulo={modo.tipo === "ver" ? tituloVer : undefined}
          onGuardar={guardar}
          onCerrar={() => setModo(null)}
        />
      ) : (
        <ListaZonas
          mias={datos.mias}
          compartidasConmigo={datos.compartidas_conmigo}
          topes={datos.topes}
          miId={datos.mi_id}
          onNueva={() => setModo({ tipo: "nueva" })}
          onVer={(z) => {
            const esMia = datos.mias.some((m) => m.id === z.id)
            setTituloVer(esMia ? `«${z.nombre}»` : `«${z.nombre}» · zona de ${z.owner_nombre}`)
            setModo({ tipo: "ver", actual: z.geojson })
          }}
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
