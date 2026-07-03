"use client"

import { useState, useMemo } from "react"
import { BarrioData } from "@/lib/mercado/fetchBarrios"
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, AlertTriangle, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface BarriosTableProps {
  barrios: BarrioData[]
  fuente: string | null              // ej. 'Mudafy'
  fechaActualizacion: string | null  // ISO real de la DB
  brechaPct: number | null           // brecha real cierre vs publicado (REMAX+UCEMA)
  brechaLabel: string | null         // ej. 'Mayo 2026'
  hasError: boolean
}

type SortKey = "barrio" | "precio_m2_usd" | "cierre_estimado"
type SortDir = "asc" | "desc"

const PAGE_SIZE = 15

function fmt(val: number | undefined | null): string {
  if (val === undefined || val === null) return "—"
  return `USD ${val.toLocaleString("es-AR")}`
}

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat("es-AR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso))
  } catch {
    return null
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-40" />
  if (dir === "asc") return <ChevronUp className="w-3 h-3 text-accent" />
  return <ChevronDown className="w-3 h-3 text-accent" />
}

export function BarriosTable({ barrios, fuente, fechaActualizacion, brechaPct, brechaLabel, hasError }: BarriosTableProps) {
  const [filter, setFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("barrio")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(0)

  const fechaLabel = fmtFecha(fechaActualizacion)

  // Cierre estimado por barrio: precio de lista ajustado por la brecha REAL
  // entre publicado y cierre que mide REMAX+UCEMA a nivel CABA. Es una
  // estimación (no hay cierre medido por barrio en ninguna fuente pública).
  const rows = useMemo(
    () =>
      barrios.map((b) => ({
        ...b,
        cierre_estimado: brechaPct != null ? Math.round(b.precio_m2_usd * (1 + brechaPct / 100)) : null,
      })),
    [barrios, brechaPct]
  )

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return rows.filter((b) => b.barrio.toLowerCase().includes(q))
  }, [rows, filter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]

      if (av === undefined || av === null) return 1
      if (bv === undefined || bv === null) return -1

      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageItems = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
    setPage(0)
  }

  const cols: { key: SortKey; label: string; tooltip?: string }[] = [
    { key: "barrio", label: "Barrio" },
    {
      key: "precio_m2_usd",
      label: "USD/m² Lista",
      tooltip: `Precio promedio de publicación (asking price)${fuente ? ` según ${fuente}` : ""}${fechaLabel ? ` · ${fechaLabel}` : ""}.`,
    },
    {
      key: "cierre_estimado",
      label: "USD/m² Cierre estimado",
      tooltip:
        brechaPct != null
          ? `Estimación: precio de lista ajustado por la brecha real entre publicado y cierre (${brechaPct}%) medida por REMAX + UCEMA${brechaLabel ? ` en ${brechaLabel}` : ""}. No existe cierre medido por barrio.`
          : "Sin brecha de cierre disponible para estimar.",
    },
  ]

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-5 border-b bg-gradient-to-r from-violet-950/20 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            Precios por Barrio · CABA
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {fechaLabel ? `Actualizado: ${fechaLabel}` : "Sin fecha de actualización"} · Lista real vs. cierre estimado
            {hasError && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                ⚠ Error de conexión
              </span>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0) }}
            placeholder="Buscar barrio..."
            className="pl-8 h-9 text-xs bg-muted/20 border-white/5"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TooltipProvider>
            <thead>
              <tr className="border-b bg-muted/40">
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors group"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {col.tooltip && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[220px] text-[10px]">
                            {col.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <SortIcon active={sortKey === col.key} dir={sortDir} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
          </TooltipProvider>
          <tbody className="divide-y divide-white/5">
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-16 text-center text-xs text-muted-foreground">
                  {hasError
                    ? "No se pudo cargar la tabla de barrios"
                    : filter
                    ? "Ningún barrio coincide con la búsqueda"
                    : "Cargando datos del mercado..."}
                </td>
              </tr>
            ) : (
              pageItems.map((b) => (
                <tr
                  key={b.barrio}
                  className={`transition-colors hover:bg-white/[0.03] group`}
                >
                  <td className="px-4 py-3.5 font-medium text-sm group-hover:text-violet-400 transition-colors">
                    {b.barrio}
                  </td>
                  <td className="px-4 py-3.5 text-sm tabular-nums text-muted-foreground">
                    {fmt(b.precio_m2_usd)}
                  </td>
                  <td className={`px-4 py-3.5 text-sm tabular-nums font-bold ${b.cierre_estimado ? "text-emerald-400" : "text-muted-foreground/30"}`}>
                    {fmt(b.cierre_estimado)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-4 border-t bg-muted/10">
          <p className="text-xs text-muted-foreground">
            Mostrando {pageItems.length} de {filtered.length} barrios
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white/5 border-white/10"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white/5 border-white/10"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Footer Attribution */}
      <div className="px-5 py-3 border-t bg-muted/5 flex flex-col sm:flex-row sm:items-center gap-1 justify-between">
        <p className="text-[10px] text-muted-foreground/40 italic">
          Fuentes: {fuente ?? "—"} (lista) · REMAX + UCEMA (brecha de cierre{brechaLabel ? ` ${brechaLabel}` : ""})
        </p>
        <p className="text-[10px] text-violet-400/60 font-medium">
          {fechaLabel ? `Actualización automática · ${fechaLabel}` : "Actualización automática"}
        </p>
      </div>
    </div>
  )
}
