"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, Download, ExternalLink, Edit, Trash2, Loader2 } from "lucide-react"
import type { ContratoRow } from "@/types/contratos"
import { downloadContractFromId } from "@/lib/contratos/download-helper"
import { toast } from "sonner"

interface ContratosGeneradosProps {
  role: "director" | "asesor"
  onEdit: (contrato: ContratoRow, motivo: string) => void
}

const ESTADO_GESTION_COLORS: Record<string, string> = {
  original: "bg-green-500/10 text-green-500 border-green-500/20",
  modificado: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  eliminado: "bg-red-500/10 text-red-500 border-red-500/20",
}

/** Datos del cliente derivados del form_data (varias convenciones de placeholder). */
function getCliente(formData: Record<string, any>): string {
  return String(
    formData?.["LOCATARIO_NOMBRE_COMPLETO"] ||
    formData?.["COMPRADOR_NOMBRE_COMPLETO"] ||
    formData?.["OFERENTE_NOMBRE"] ||
    formData?.["OFERENTE_NOMBRE_COMPLETO"] ||
    "—"
  )
}

/** Dirección del inmueble derivada del form_data. */
function getPropiedad(formData: Record<string, any>): string {
  return String(
    formData?.["INMUEBLE_DIRECCION"] ||
    formData?.["INMUEBLE_UBICACION"] ||
    "—"
  )
}

export function ContratosGenerados({ role, onEdit }: ContratosGeneradosProps) {
  const isDirector = role === "director"
  const [contratos, setContratos] = useState<ContratoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Dialog de motivo (modificar / eliminar)
  const [actionTarget, setActionTarget] = useState<{ contrato: ContratoRow; tipo: "modificar" | "eliminar" } | null>(null)
  const [motivo, setMotivo] = useState("")
  const [processing, setProcessing] = useState(false)

  const loadContratos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/contratos")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setContratos(data)
      }
    } catch (error) {
      console.error("Error loading contracts:", error)
      toast.error("Error al cargar la lista de contratos")
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!loaded) loadContratos()
  }, [loaded, loadContratos])

  const handleDownload = async (c: ContratoRow) => {
    setDownloadingId(c.id)
    try {
      await downloadContractFromId(c.id)
    } finally {
      setDownloadingId(null)
    }
  }

  const openAction = (contrato: ContratoRow, tipo: "modificar" | "eliminar") => {
    setActionTarget({ contrato, tipo })
    setMotivo("")
  }

  const confirmAction = async () => {
    if (!actionTarget) return
    if (!motivo.trim()) {
      toast.error("Indicá el motivo")
      return
    }
    const { contrato, tipo } = actionTarget

    if (tipo === "modificar") {
      // El wizard se abre en modo edición; el motivo viaja con el guardado
      onEdit(contrato, motivo.trim())
      setActionTarget(null)
      return
    }

    // Eliminar (soft-delete)
    setProcessing(true)
    try {
      const res = await fetch(`/api/contratos/${contrato.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo_gestion: motivo.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success("Contrato eliminado")
      setActionTarget(null)
      loadContratos()
    } catch {
      toast.error("Error al eliminar el contrato")
    } finally {
      setProcessing(false)
    }
  }

  if (loading || !loaded) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (contratos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/20 rounded-3xl border border-dashed border-muted">
        <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <FileText className="w-10 h-10 text-muted-foreground opacity-30" />
        </div>
        <h3 className="text-2xl font-bold tracking-tight">Sin contratos generados</h3>
        <p className="text-muted-foreground max-w-sm mt-3 leading-relaxed">
          Todavía no se generó ningún contrato. ¡Empezá desde la pestaña &quot;Nuevo Contrato&quot;!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isDirector && <TableHead>Asesor</TableHead>}
              <TableHead>Contrato</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Cliente / Propiedad</TableHead>
              {isDirector && <TableHead className="text-center">Estado</TableHead>}
              {isDirector && <TableHead>Motivo</TableHead>}
              <TableHead className="text-center">PDF</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contratos.map(c => {
              const eliminado = c.estado_gestion === "eliminado"
              return (
                <TableRow key={c.id} className={eliminado ? "opacity-60" : undefined}>
                  {isDirector && (
                    <TableCell className="text-sm font-medium">{c.asesor_nombre || "—"}</TableCell>
                  )}
                  <TableCell className="font-medium max-w-[220px] truncate" title={c.nombre_referencia || ""}>
                    {c.nombre_referencia || `Contrato ${c.tipo}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px] border-accent/20 text-accent">
                      {c.codigo_unico || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{getCliente(c.form_data)}</span>
                      <span className="text-xs text-muted-foreground">{getPropiedad(c.form_data)}</span>
                    </div>
                  </TableCell>
                  {isDirector && (
                    <TableCell className="text-center">
                      <Badge className={`text-[10px] border ${ESTADO_GESTION_COLORS[c.estado_gestion] || ""}`} variant="outline">
                        {c.estado_gestion?.toUpperCase()}
                      </Badge>
                    </TableCell>
                  )}
                  {isDirector && (
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={c.motivo_gestion || ""}>
                      {c.estado_gestion === "original" ? "—" : (c.motivo_gestion || "—")}
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    {c.pdf_url ? (
                      <a
                        href={c.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-2 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                        title="Ver PDF"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <button
                        onClick={() => handleDownload(c)}
                        disabled={downloadingId === c.id}
                        className="inline-flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:bg-accent/10 hover:text-accent transition-colors disabled:opacity-50"
                        title="Descargar PDF"
                      >
                        {downloadingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!eliminado ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openAction(c, "modificar")} title="Modificar">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openAction(c, "eliminar")} title="Eliminar" className="hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Eliminado</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog motivo (modificar / eliminar) */}
      <Dialog open={!!actionTarget} onOpenChange={(v) => { if (!v) setActionTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.tipo === "modificar" ? "Modificar contrato" : "Eliminar contrato"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {actionTarget?.tipo === "modificar"
                ? "Indicá el motivo de la modificación. Luego podrás editar los datos del contrato."
                : "Indicá el motivo de la eliminación. El contrato dejará de estar disponible."}
            </p>
            <Textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button
              onClick={confirmAction}
              disabled={processing}
              className={actionTarget?.tipo === "eliminar" ? "bg-destructive hover:bg-destructive/90 text-white" : "bg-accent hover:bg-accent/90 text-accent-foreground"}
            >
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {actionTarget?.tipo === "modificar" ? "Continuar" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
