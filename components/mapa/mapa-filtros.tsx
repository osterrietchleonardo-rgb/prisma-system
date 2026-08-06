"use client"

// Barra de filtros del mapa. Arranca en Venta porque la red de colaboracion es casi
// toda venta (47.071 contra 84 en alquiler): con Alquiler el mapa se ve vacio.
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TIPOS_MAPA } from "@/lib/mapa/tipos-propiedad"
import type { FiltrosMapa, FuenteMapa } from "@/lib/mapa/tipos"

// En pantalla la red externa se llama SIEMPRE "Colaboracion", nunca por su nombre interno.
const ETIQUETAS: Record<FuenteMapa, string> = {
  own: "Mías",
  agency: "Agencia",
  roomix: "Colaboración",
}

const COLORES: Record<FuenteMapa, string> = {
  own: "bg-amber-500",
  agency: "bg-zinc-600",
  roomix: "bg-blue-600",
}

export function MapaFiltros({
  filtros,
  onCambio,
}: {
  filtros: FiltrosMapa
  onCambio: (f: FiltrosMapa) => void
}) {
  const set = (parcial: Partial<FiltrosMapa>) => onCambio({ ...filtros, ...parcial })

  const alternarFuente = (f: FuenteMapa) => {
    const activas = filtros.fuentes.includes(f)
      ? filtros.fuentes.filter((x) => x !== f)
      : [...filtros.fuentes, f]
    set({ fuentes: activas })
  }

  const numero = (v: string) => {
    const n = Number(v)
    return v.trim() === "" || !Number.isFinite(n) ? null : n
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white/70 p-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="w-32">
        <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Operación</Label>
        <Select
          value={filtros.operacion}
          onValueChange={(v) => set({ operacion: v as FiltrosMapa["operacion"] })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Venta">Venta</SelectItem>
            <SelectItem value="Alquiler">Alquiler</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-44">
        <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Tipo</Label>
        <Select
          value={filtros.tipo ?? "__todos__"}
          onValueChange={(v) => set({ tipo: v === "__todos__" ? null : v })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos__">Todos</SelectItem>
            {TIPOS_MAPA.map((t) => (
              <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-24">
        <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Moneda</Label>
        <Select value={filtros.moneda} onValueChange={(v) => set({ moneda: v as FiltrosMapa["moneda"] })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">US$</SelectItem>
            <SelectItem value="ARS">$</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-28">
        <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Precio desde</Label>
        <Input
          className="h-9" type="number" inputMode="numeric" placeholder="—"
          value={filtros.precio_min ?? ""}
          onChange={(e) => set({ precio_min: numero(e.target.value) })}
        />
      </div>

      <div className="w-28">
        <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Precio hasta</Label>
        <Input
          className="h-9" type="number" inputMode="numeric" placeholder="—"
          value={filtros.precio_max ?? ""}
          onChange={(e) => set({ precio_max: numero(e.target.value) })}
        />
      </div>

      <div className="w-24">
        <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Amb. mín.</Label>
        <Input
          className="h-9" type="number" inputMode="numeric" placeholder="—"
          value={filtros.ambientes_min ?? ""}
          onChange={(e) => set({ ambientes_min: numero(e.target.value) })}
        />
      </div>

      <div className="flex items-center gap-4 pb-1 pl-2">
        {(Object.keys(ETIQUETAS) as FuenteMapa[]).map((f) => (
          <label key={f} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={filtros.fuentes.includes(f)}
              onCheckedChange={() => alternarFuente(f)}
            />
            <span className={`h-2.5 w-2.5 rounded-full ${COLORES[f]}`} />
            {ETIQUETAS[f]}
          </label>
        ))}
      </div>
    </div>
  )
}
