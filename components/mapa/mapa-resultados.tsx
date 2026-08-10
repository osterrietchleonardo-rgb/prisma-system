"use client"

// Panel derecho: la lista de lo que se ve en el mapa, ordenada por precio.
// Es la lista que el asesor le muestra al cliente.
//
// Las filas son livianas a proposito (una foto, precio, direccion): la ficha completa se
// pide recien al clickear. Las propiedades sin coordenadas se listan igual, marcadas,
// para que nunca desaparezcan en silencio.
import { ScrollArea } from "@/components/ui/scroll-area"
import { MapPinOff } from "lucide-react"
import { tipoEnCastellano } from "@/lib/mapa/tipos-propiedad"
import type { FuenteMapa, PropiedadMapa } from "@/lib/mapa/tipos"

const ETIQUETA_FUENTE: Record<FuenteMapa, string> = {
  own: "Mía",
  agency: "Agencia",
  roomix: "Colaboración",
}

const COLOR_FUENTE: Record<FuenteMapa, string> = {
  own: "bg-amber-500",
  agency: "bg-zinc-600",
  roomix: "bg-blue-600",
}

// Dibujo propio en vez de una foto de archivo de internet: la politica de contenido de
// la app solo deja imagenes de dominios conocidos, y una de Unsplash salia rota.
const SIN_FOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="64" viewBox="0 0 80 64">
       <rect width="80" height="64" fill="#e4e4e7"/>
       <path d="M22 40l10-12 8 9 6-6 12 15H22z" fill="#a1a1aa"/>
       <circle cx="28" cy="22" r="4" fill="#a1a1aa"/>
     </svg>`,
  )

function precio(p: PropiedadMapa) {
  if (!p.price) return "Consultar"
  const simbolo = p.currency === "ARS" ? "$" : "US$"
  return `${simbolo} ${p.price.toLocaleString("es-AR")}`
}

export function MapaResultados({
  propiedades,
  onAbrir,
  onEnfocar,
}: {
  propiedades: PropiedadMapa[]
  onAbrir: (id: string) => void
  onEnfocar?: (p: PropiedadMapa) => void
}) {
  const ubicadas = propiedades.filter((p) => p.lat !== null && p.lng !== null)
  const sinUbicacion = propiedades.filter((p) => p.lat === null || p.lng === null)
  const ordenadas = [...ubicadas, ...sinUbicacion].sort((a, b) => (a.price || 0) - (b.price || 0))

  if (propiedades.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
        No hay propiedades con estos filtros en la zona que estás mirando.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-2">
        {sinUbicacion.length > 0 && (
          <p className="px-1 pb-1 text-[11px] text-amber-600 dark:text-amber-500">
            {sinUbicacion.length}{" "}
            {sinUbicacion.length === 1 ? "propiedad no tiene" : "propiedades no tienen"} ubicación
            cargada: están en la lista pero no en el mapa.
          </p>
        )}

        {ordenadas.map((p) => {
          const ubicada = p.lat !== null && p.lng !== null
          return (
            <button
              key={p.id}
              onClick={() => onAbrir(p.id)}
              onMouseEnter={() => ubicada && onEnfocar?.(p)}
              className="flex w-full gap-3 rounded-xl border border-zinc-200 bg-white/60 p-2 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-600"
            >
              <img
                src={p.images[0] || SIN_FOTO}
                alt={p.title || "Propiedad"}
                className="h-16 w-20 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_FUENTE[p.source]}`} />
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                    {ETIQUETA_FUENTE[p.source]}
                  </span>
                  {!ubicada && <MapPinOff className="h-3 w-3 text-amber-500" />}
                </div>
                <p className="truncate text-sm font-semibold">{precio(p)}</p>
                <p className="truncate text-xs text-zinc-500">{p.address || p.city || "Sin dirección"}</p>
                <p className="truncate text-[11px] text-zinc-400">
                  {[tipoEnCastellano(p.property_type), p.bedrooms ? `${p.bedrooms} amb.` : null, p.total_area ? `${p.total_area} m²` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
