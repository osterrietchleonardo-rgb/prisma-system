"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Edit, Power, Copy, Trash2, Upload, Plus, Loader2 } from "lucide-react"
import { TIPO_CONTRATO_LABELS } from "@/types/contratos"
import type { ContractTemplate, TipoContrato } from "@/types/contratos"
import { PlantillaEditor } from "./PlantillaEditor"
import { UploadContratoModal } from "./UploadContratoModal"
import { toast } from "sonner"

export function PlantillasList() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/contract-templates")
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`/api/contract-templates/${id}/activate`, { method: "POST" })
      if (res.ok) {
        toast.success("Plantilla activada")
        loadTemplates()
      }
    } catch {
      toast.error("Error al activar")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta plantilla?")) return
    try {
      const res = await fetch(`/api/contract-templates/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Plantilla eliminada")
        loadTemplates()
      }
    } catch {
      toast.error("Error al eliminar")
    }
  }

  const handleDuplicate = async (template: ContractTemplate) => {
    try {
      const res = await fetch("/api/contract-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: `${template.nombre} (copia)`,
          tipo: template.tipo,
          template_body: template.template_body,
          campos_schema: template.campos_schema,
          is_active: false,
        }),
      })
      if (res.ok) {
        toast.success("Plantilla duplicada")
        loadTemplates()
      }
    } catch {
      toast.error("Error al duplicar")
    }
  }

  if (editingTemplate) {
    return (
      <PlantillaEditor
        template={editingTemplate}
        onSave={() => {
          setEditingTemplate(null)
          loadTemplates()
        }}
        onCancel={() => setEditingTemplate(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Mis Plantillas</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowUpload(true)}>
            <Upload className="w-4 h-4 mr-2" /> Subir mi contrato
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No hay plantillas disponibles</p>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-center">Versión</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Modificado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {TIPO_CONTRATO_LABELS[t.tipo as TipoContrato] || t.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{t.nombre}</TableCell>
                  <TableCell className="text-center">v{t.version}</TableCell>
                  <TableCell className="text-center">
                    {t.is_active ? (
                      <Badge className="bg-green-600 text-white text-[10px]">Activa</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactiva</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.is_system_default && (
                      <Badge variant="outline" className="text-[10px] border-accent/30 text-accent">PRISMA</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.updated_at).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!t.is_system_default && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(t)} title="Editar">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {!t.is_active && (
                        <Button variant="ghost" size="sm" onClick={() => handleActivate(t.id)} title="Activar">
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDuplicate(t)} title="Duplicar">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      {!t.is_system_default && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} title="Eliminar" className="hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UploadContratoModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={() => {
          setShowUpload(false)
          loadTemplates()
        }}
      />
    </div>
  )
}
