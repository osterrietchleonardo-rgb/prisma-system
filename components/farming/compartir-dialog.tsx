"use client"

// Elegir un colega del desplegable. Al sumarlo, "automáticamente al asesor en su cuenta le
// aparece marcada esa zona como compartida" (pedido del 10-sep): eso pasa solo porque el GET
// de su pantalla la trae en compartidas_conmigo.
import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Colega, ZonaFarming } from "@/lib/farming/tipos"

export function CompartirDialog({
  zona,
  colegas,
  onSumar,
  onSacar,
  onCerrar,
}: {
  zona: ZonaFarming | null
  colegas: Colega[]
  onSumar: (zonaId: string, userId: string) => Promise<void>
  onSacar: (zonaId: string, userId: string) => Promise<void>
  onCerrar: () => void
}) {
  const [elegido, setElegido] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const disponibles = colegas.filter((c) => !zona?.compartida_con.some((x) => x.id === c.id))

  const sumar = async () => {
    if (!zona || !elegido) return
    setOcupado(true)
    try {
      await onSumar(zona.id, elegido)
      setElegido("")
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialog open={!!zona} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir «{zona?.nombre}»</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          El colega va a ver la zona en su Farming y va a trabajar el mismo tablero que vos. Vos seguís siendo quien la puede borrar.
        </p>

        {zona && zona.compartida_con.length > 0 && (
          <ul className="space-y-1">
            {zona.compartida_con.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                {c.nombre}
                <button onClick={() => onSacar(zona.id, c.id)} title="Dejar de compartir" className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {disponibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No queda ningún otro asesor activo con quien compartirla.</p>
        ) : (
          <div className="flex gap-2">
            <Select value={elegido} onValueChange={setElegido}>
              <SelectTrigger className="h-10 flex-1">
                <SelectValue placeholder="Elegí un colega" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="h-10" disabled={!elegido || ocupado} onClick={sumar}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compartir"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
