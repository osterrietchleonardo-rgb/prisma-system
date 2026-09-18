"use client"

// Farming · el diálogo de mover una tarjeta de columna.
//
// Es lo que convierte al tablero en un método y no en una pared de colores: **no se cambia de
// columna sin decir qué hiciste, cuál es el próximo paso y para cuándo**. La fecha es
// obligatoria (regla del punto 9 del PDF) y el botón de guardar está apagado hasta que
// `validarMovimiento` no encuentre nada — con los faltantes escritos en pantalla, no
// adivinando por qué el botón no anda.
//
// Nada importante en un globito: en el celular no se abren.
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { pedir } from "@/lib/farming/cliente"
import { ETAPAS, etiquetaDe, type EtapaDireccion } from "@/lib/farming/direcciones"
import { TIPOS_CONTACTO, tipoSugerido, validarMovimiento, type Movimiento } from "@/lib/farming/tablero"
import type { FilaDireccion } from "@/lib/farming/tipos"

/** Las siete claves de carta de `TIPOS_CONTACTO`. «Cuántas cartas» solo tiene sentido cuando lo
 *  que se hizo fue dejar cartas: preguntarlo en una llamada es ruido en la vereda. */
const esCarta = (tipo: string) => tipo.startsWith("carta_")

export function MoverDialog({
  direccion,
  destino,
  onCerrar,
  onMovida,
}: {
  /** null = cerrado. La tarjeta entera y no el id: el título dice qué puerta se está moviendo. */
  direccion: FilaDireccion | null
  /** La columna a la que se la soltó (o la que se eligió en el menú). Se puede corregir acá. */
  destino: EtapaDireccion
  onCerrar: () => void
  /** La fila que devuelve el servidor, que es la verdad: la pantalla la aplica tal cual. */
  onMovida: (d: FilaDireccion) => void
}) {
  const [etapa, setEtapa] = useState<EtapaDireccion>(destino)
  const [tipo, setTipo] = useState<string>(tipoSugerido(destino))
  // Si el asesor ya eligió a mano qué hizo, cambiar la columna destino NO se lo pisa: el tipo
  // sugerido es una ayuda para el que no tocó nada, no una corrección de lo que ya decidió.
  const [tipoTocado, setTipoTocado] = useState(false)
  const [cartas, setCartas] = useState("")
  const [proximaAccion, setProximaAccion] = useState("")
  const [proximaAccionEn, setProximaAccionEn] = useState("")
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)

  // El mismo objeto que se valida es el que se manda: si fueran dos armados distintos, un día
  // la pantalla dejaría guardar algo que el servidor rechaza (o al revés).
  const movimiento: Partial<Movimiento> = {
    etapa_hasta: etapa,
    tipo,
    proxima_accion: proximaAccion.trim(),
    proxima_accion_en: proximaAccionEn.trim(),
    nota: nota.trim() || null,
    // Solo cuando lo que se hizo fue una carta Y el asesor escribió el número. Sin esto,
    // «cuántas cartas» viajaría en un WhatsApp con el resto del formulario en blanco.
    ...(esCarta(tipo) && cartas.trim() !== "" ? { cartas_entregadas: Number(cartas) } : {}),
  }
  const errores = validarMovimiento(movimiento)

  const elegirEtapa = (v: string) => {
    const nueva = v as EtapaDireccion
    setEtapa(nueva)
    if (!tipoTocado) setTipo(tipoSugerido(nueva))
  }

  const elegirTipo = (v: string) => {
    setTipo(v)
    setTipoTocado(true)
    // Lo que se tipeó para una carta no puede viajar pegado a una llamada.
    if (!esCarta(v)) setCartas("")
  }

  const guardar = async () => {
    if (!direccion || errores.length > 0) return
    setGuardando(true)
    try {
      const d = await pedir(`/api/farming/direcciones/${direccion.id}/mover`, {
        method: "POST",
        body: JSON.stringify(movimiento),
      })
      toast.success(`${direccion.calle} ${direccion.altura ?? ""} pasó a «${etiquetaDe(etapa)}»`)
      onMovida(d.direccion)
      onCerrar()
    } catch (e: any) {
      // El mensaje del servidor, tal cual: ya viene en criollo y dice qué pasó de verdad
      // (incluido el caso feo de «se movió y no se pudo anotar»). La tarjeta no se toca: sigue
      // en la columna en la que estaba, porque nada se movió en pantalla antes de guardar.
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={!!direccion} onOpenChange={(a) => { if (!a && !guardando) onCerrar() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mover {direccion?.calle} {direccion?.altura ?? ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mover-etapa">A qué columna</Label>
            <Select value={etapa} onValueChange={elegirEtapa}>
              <SelectTrigger id="mover-etapa" className="h-11 md:h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => <SelectItem key={e.clave} value={e.clave}>{e.etiqueta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="mover-tipo">Qué hiciste</Label>
            <Select value={tipo} onValueChange={elegirTipo}>
              <SelectTrigger id="mover-tipo" className="h-11 md:h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_CONTACTO.map((t) => <SelectItem key={t.clave} value={t.clave}>{t.etiqueta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {esCarta(tipo) && (
            <div className="space-y-1">
              <Label htmlFor="mover-cartas">Cuántas cartas dejaste</Label>
              <Input
                id="mover-cartas"
                type="number"
                inputMode="numeric"
                min={0}
                className="h-11 md:h-10"
                value={cartas}
                onChange={(e) => setCartas(e.target.value)}
                placeholder="12"
              />
              <p className="text-xs text-muted-foreground">
                En un edificio suelen ser varias. Si no las contaste, dejalo vacío.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="mover-prox">Cuál es el próximo paso *</Label>
            <Input
              id="mover-prox"
              className="h-11 md:h-10"
              value={proximaAccion}
              onChange={(e) => setProximaAccion(e.target.value)}
              placeholder="Volver a hablar con el encargado"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="mover-prox-en">Para cuándo *</Label>
            <Input
              id="mover-prox-en"
              type="date"
              className="h-11 md:h-10"
              value={proximaAccionEn}
              onChange={(e) => setProximaAccionEn(e.target.value)}
            />
            {/* LÍNEA VISIBLE, nunca un globito: es la regla que sostiene el método, y el asesor
                tiene que leerla antes de pelearse con el botón apagado. */}
            <p className="text-xs text-muted-foreground">
              Sin fecha no se guarda el movimiento: una puerta sin próximo paso con fecha es una
              puerta que se olvida.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="mover-nota">Nota (opcional)</Label>
            <Textarea
              id="mover-nota"
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Lo que te dijeron en la puerta"
            />
          </div>

          {/* Los errores se MUESTRAN, no se tragan: un botón apagado sin explicación es una
              pantalla rota. */}
          {errores.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-muted p-3 dark:border-zinc-800">
              <p className="text-sm font-medium">Para guardar falta:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                {errores.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button className="h-11 flex-1" disabled={guardando || errores.length > 0} onClick={guardar}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar el movimiento"}
            </Button>
            <Button variant="outline" className="h-11 flex-1" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
