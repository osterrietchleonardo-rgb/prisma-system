"use client"

// Las tarjetas de «Mis zonas»: una por zona, con lo que dice el spec (nombre, km², pedazos,
// con quién se comparte) y los botones: ver, redibujar, sumar un pedazo, compartir, borrar.
// Las compartidas conmigo se listan aparte y solo se pueden ver.
import { Eye, Pencil, Plus, Share2, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ZonaFarming } from "@/lib/farming/tipos"

function Tarjeta({
  zona,
  propia,
  miId,
  onVer,
  onRedibujar,
  onSumar,
  onCompartir,
  onBorrar,
}: {
  zona: ZonaFarming
  propia: boolean
  /** Para decir "vos" en vez de mi propio nombre en la lista de quién la trabaja. */
  miId: string
  onVer: () => void
  onRedibujar?: () => void
  onSumar?: () => void
  onCompartir?: () => void
  onBorrar?: () => void
}) {
  // Si es mía, la lista empieza en "vos"; si no, en el dueño. El resto son los compartidos,
  // con mi propia fila (cuando la zona no es mía) reemplazada por "vos" en vez de mi nombre.
  const primero = propia ? "vos" : zona.owner_nombre
  const resto = zona.compartida_con.map((c) => (c.id === miId ? "vos" : c.nombre))
  return (
    <div className="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{zona.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {zona.area_km2.toFixed(2)} km² · {zona.pedazos === 1 ? "1 pedazo" : `${zona.pedazos} pedazos`}
            {!propia && ` · zona de ${zona.owner_nombre}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onVer}>
          <Eye className="h-3.5 w-3.5" /> ver
        </Button>
      </div>

      {/* Línea visible, no globito: quién más trabaja esta zona se tiene que ver de un vistazo. */}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        {resto.length === 0 ? "Solo la trabajás vos" : `La trabajan ${primero} y ${resto.join(", ")}`}
      </p>

      {propia && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRedibujar}>
            <Pencil className="h-3.5 w-3.5" /> redibujar
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onSumar}>
            <Plus className="h-3.5 w-3.5" /> sumar un pedazo
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onCompartir}>
            <Share2 className="h-3.5 w-3.5" /> compartir
          </Button>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={onBorrar}>
            <Trash2 className="h-3.5 w-3.5" /> borrar
          </Button>
        </div>
      )}
    </div>
  )
}

export function ListaZonas({
  mias,
  compartidasConmigo,
  topes,
  miId,
  onNueva,
  onVer,
  onRedibujar,
  onSumar,
  onCompartir,
  onBorrar,
}: {
  mias: ZonaFarming[]
  compartidasConmigo: ZonaFarming[]
  topes: { max_zonas: number; max_km2: number }
  /** El id de quien mira la pantalla, para que la tarjeta diga "vos". */
  miId: string
  onNueva: () => void
  onVer: (z: ZonaFarming) => void
  onRedibujar: (z: ZonaFarming) => void
  onSumar: (z: ZonaFarming) => void
  onCompartir: (z: ZonaFarming) => void
  onBorrar: (z: ZonaFarming) => void
}) {
  const llena = mias.length >= topes.max_zonas
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mis zonas</h2>
          <p className="text-xs text-muted-foreground">
            Hasta {topes.max_zonas} zonas de {topes.max_km2} km² cada una. Ninguna puede pisar la de un colega.
          </p>
        </div>
        <Button className="h-10 gap-1.5" onClick={onNueva} disabled={llena} title={llena ? `Ya tenés ${topes.max_zonas}: borrá una para dibujar otra` : undefined}>
          <Plus className="h-4 w-4" /> dibujar una zona nueva
        </Button>
      </div>
      {llena && (
        <p className="text-xs text-amber-700 dark:text-amber-500">Ya tenés {topes.max_zonas} zonas, que es el máximo. Borrá una para dibujar otra.</p>
      )}

      {mias.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
          Todavía no tenés ninguna zona. Dibujá la primera con el botón de arriba, o desde el Buscador IA → Mapa → Mis zonas → «usar para farming».
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {mias.map((z) => (
          <Tarjeta key={z.id} zona={z} propia miId={miId} onVer={() => onVer(z)} onRedibujar={() => onRedibujar(z)} onSumar={() => onSumar(z)} onCompartir={() => onCompartir(z)} onBorrar={() => onBorrar(z)} />
        ))}
      </div>

      {compartidasConmigo.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Zonas que comparten conmigo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {compartidasConmigo.map((z) => (
              <Tarjeta key={z.id} zona={z} propia={false} miId={miId} onVer={() => onVer(z)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
