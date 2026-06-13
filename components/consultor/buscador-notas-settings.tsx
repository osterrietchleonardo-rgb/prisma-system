"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, NotebookPen, Save } from "lucide-react"

interface BuscadorConfig {
  notes: string
}

export function BuscadorNotasSettings() {
  const [config, setConfig] = useState<BuscadorConfig>({ notes: "" })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/ai/consultor/settings")
      if (res.ok) {
        const data = await res.json()
        setConfig({ notes: typeof data?.notes === "string" ? data.notes : "" })
      }
    } catch (error) {
      console.error("Error fetching buscador settings:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/ai/consultor/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Error al guardar")
      }
      toast.success("Notas del Buscador IA actualizadas")
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <NotebookPen className="w-6 h-6 text-accent" />
          Notas del Buscador IA
        </h3>
        <p className="text-muted-foreground">
          Lo configurás solo vos (director) y aplica a vos y a todos tus asesores.
        </p>
      </div>

      <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-accent" />
            Notas y directivas
          </CardTitle>
          <CardDescription>
            Escribí libremente comentarios o directivas. Cuando alguno coincida con la respuesta del Buscador IA,
            se le comunicará al asesor o director como una consideración o nota a tener en cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.notes}
            onChange={(e) => setConfig({ notes: e.target.value })}
            placeholder="Escribí acá tus notas y directivas…"
            className="min-h-[260px] resize-y text-sm leading-relaxed"
            maxLength={8000}
          />
          <p className="text-[10px] text-muted-foreground mt-2 text-right">{config.notes.length}/8000</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-accent hover:bg-accent/90 text-accent-foreground px-10 h-12 rounded-2xl font-bold shadow-lg gap-2"
        >
          {isSaving ? <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</> : <><Save className="w-5 h-5" /> Guardar Notas</>}
        </Button>
      </div>
    </div>
  )
}
