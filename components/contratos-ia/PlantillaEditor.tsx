"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Save, Eye, Loader2 } from "lucide-react"
import { extractPlaceholders } from "@/lib/contratos/template-interpolator"
import type { ContractTemplate } from "@/types/contratos"
import { toast } from "sonner"

interface PlantillaEditorProps {
  template: ContractTemplate
  onSave: () => void
  onCancel: () => void
}

export function PlantillaEditor({ template, onSave, onCancel }: PlantillaEditorProps) {
  const [nombre, setNombre] = useState(template.nombre)
  const [body, setBody] = useState(template.template_body)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const textareaRef = { current: null as HTMLTextAreaElement | null }

  const placeholders = useMemo(() => extractPlaceholders(body), [body])

  const insertPlaceholder = useCallback((placeholder: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setBody(prev => prev + `{{${placeholder}}}`)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = `{{${placeholder}}}`
    const newBody = body.substring(0, start) + text + body.substring(end)
    setBody(newBody)
    // Set cursor after inserted text
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length
      textarea.focus()
    })
  }, [body])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/contract-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          template_body: body,
          campos_schema: template.campos_schema,
        }),
      })
      if (res.ok) {
        toast.success("Plantilla guardada (versión incrementada)")
        onSave()
      } else {
        throw new Error("Error")
      }
    } catch {
      toast.error("Error al guardar la plantilla")
    } finally {
      setSaving(false)
    }
  }

  // Render body with highlighted placeholders for preview
  const highlightedBody = useMemo(() => {
    return body.replace(
      /\{\{([A-Z_]+)\}\}/g,
      '<span style="background-color: rgba(184, 115, 51, 0.15); color: #b87333; font-weight: 600; padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(184, 115, 51, 0.3);">{{$1}}</span>'
    )
  }, [body])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
        <h3 className="text-xl font-bold">Editar Plantilla</h3>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <Label>Nombre de la plantilla</Label>
          <Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Editor */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Cuerpo de la plantilla</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="w-3 h-3 mr-1" />
              {showPreview ? "Editor" : "Preview"}
            </Button>
          </div>

          {showPreview ? (
            <Card className="bg-white dark:bg-slate-900">
              <CardContent className="p-6">
                <div
                  className="text-sm whitespace-pre-wrap leading-relaxed font-serif"
                  dangerouslySetInnerHTML={{ __html: highlightedBody }}
                />
              </CardContent>
            </Card>
          ) : (
            <textarea
              ref={el => { textareaRef.current = el }}
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full min-h-[500px] rounded-xl border border-border bg-card p-4 font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-accent/50"
              spellCheck={false}
            />
          )}
        </div>

        {/* Placeholder sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Placeholders ({placeholders.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[450px]">
              <div className="space-y-1 p-2">
                {placeholders.map(p => (
                  <button
                    key={p}
                    onClick={() => insertPlaceholder(p)}
                    className="w-full text-left text-xs font-mono px-2 py-1.5 rounded-md hover:bg-accent/10 hover:text-accent transition-colors truncate"
                    title={`Insertar {{${p}}}`}
                  >
                    {`{{${p}}}`}
                  </button>
                ))}
                {placeholders.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">
                    No se detectaron placeholders en el texto.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={handleSave}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar (nueva versión)
        </Button>
      </div>
    </div>
  )
}
