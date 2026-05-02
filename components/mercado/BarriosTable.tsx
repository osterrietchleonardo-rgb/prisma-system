"use client"

import { useState, useMemo } from "react"
import { BarrioData } from "@/lib/mercado/fetchBarrios"
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, AlertTriangle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface BarriosTableProps {
  barrios: BarrioData[]
  period: string | null
  hasError: boolean
}

type SortKey = "barrio" | "precio_m2_usd_2amb" | "precio_m2_usd_3amb"
type SortDir = "asc" | "desc"

const PAGE_SIZE = 15

function fmt(val: number | null): string {
  if (val === null) return "—"
  return `USD ${val.toLocaleString("es-AR")}`
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-40" />
  if (dir === "asc") return <ChevronUp className="w-3 h-3 text-accent" />
  return <ChevronDown className="w-3 h-3 text-accent" />
}

export function BarriosTable({ barrios, period, hasError }: BarriosTableProps) {
  const [filter, setFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("barrio")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return barrios.filter((b) => b.barrio.toLowerCase().includes(q))
  }, [barrios, filter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
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

  const cols: { key: SortKey; label: string }[] = [
    { key: "barrio", label: "Barrio" },
    { key: "precio_m2_usd_2amb", label: "2 Amb (USD/m²)" },
    { key: "precio_m2_usd_3amb", label: "3 Amb (USD/m²)" },
  ]

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Precios por Barrio CABA
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {period ? `Período: ${period}` : "Último mes disponible"}
            {hasError && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                ⚠ Sin datos disponibles · data.buenosaires.gob.ar
              </span>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0) }}
            placeholder="Filtrar por barrio..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {cols.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  {hasError
                    ? "No se pudo cargar la tabla de barrios"
                    : filter
                    ? "Ningún barrio coincide con la búsqueda"
                    : "Sin datos disponibles"}
                </td>
              </tr>
            ) : (
              pageItems.map((b, i) => (
                <tr
                  key={b.barrio}
                  className={`border-b transition-colors hover:bg-accent/5 ${
                    i % 2 === 0 ? "" : "bg-muted/10"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-sm">{b.barrio}</td>
                  <td className={`px-4 py-3 text-sm tabular-nums ${b.precio_m2_usd_2amb ? "text-violet-400 font-semibold" : "text-muted-foreground"}`}>
                    {fmt(b.precio_m2_usd_2amb)}
                  </td>
                  <td className={`px-4 py-3 text-sm tabular-nums ${b.precio_m2_usd_3amb ? "text-violet-400 font-semibold" : "text-muted-foreground"}`}>
                    {fmt(b.precio_m2_usd_3amb)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
          <p className="text-xs text-muted-foreground">
            {filtered.length} barrios · Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-t">
        <p className="text-[10px] text-muted-foreground/50">
          Fuente: DGEyC-GCBA / Argenprop · data.buenosaires.gob.ar · CC-BY 2.5 AR
        </p>
      </div>
    </div>
  )
}
