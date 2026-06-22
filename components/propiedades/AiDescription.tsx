"use client"

import { useState } from "react"
import { Sparkles, Copy, Check, Wand2, Loader2, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type AiDescriptionData = {
  v1?: string
  v2?: string
  suggestion?: string
  model?: string
  v1_at?: string
  v2_at?: string
}

interface Props {
  propertyId: string
  initial?: AiDescriptionData | null
}

export function AiDescription({ propertyId, initial }: Props) {
  const [data, setData] = useState<AiDescriptionData>(initial || {})
  const [loadingVersion, setLoadingVersion] = useState<1 | 2 | null>(null)
  const [suggestion, setSuggestion] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const hasV1 = !!data.v1
  const hasV2 = !!data.v2

  async function generate(version: 1 | 2) {
    if (loadingVersion) return
    const aviso =
      version === 1
        ? "Vas a generar la descripción con IA. Esto consume 1 crédito. ¿Continuar?"
        : "Vas a generar la versión 2 mejorada. Esto consume 1 crédito y no se podrá volver a generar. ¿Continuar?"
    if (!window.confirm(aviso)) return

    try {
      setLoadingVersion(version)
      const res = await fetch(`/api/propiedades/${propertyId}/ai-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, suggestion: version === 2 ? suggestion : undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || "No se pudo generar")
      }
      setData(json.ai_description)
      toast.success(version === 1 ? "Versión 1 generada" : "Versión 2 generada")
    } catch (e: any) {
      toast.error(e.message || "Error al generar la descripción")
    } finally {
      setLoadingVersion(null)
    }
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      toast.success("Copiado al portapapeles")
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h4 className="text-sm font-bold uppercase tracking-widest text-accent">
          Descripción mejorada con IA
        </h4>
        <Separator className="flex-1 bg-accent/10" />
      </div>

      {/* Estado vacío */}
      {!hasV1 && (
        <div className="rounded-xl border border-dashed border-accent/20 bg-accent/5 p-5 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Generá una descripción profesional con estrategia de marketing, storytelling y
            optimización SEO/GEO a partir de los datos de esta propiedad.
          </p>
          <Button
            onClick={() => generate(1)}
            disabled={loadingVersion !== null}
            className="gap-2 bg-accent hover:bg-accent/90"
          >
            {loadingVersion === 1 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generar descripción con IA
          </Button>
          <p className="text-[11px] text-muted-foreground/70 flex items-center justify-center gap-1">
            <Info className="h-3 w-3" /> Consume 1 crédito · No modifica la descripción original de Tokko
          </p>
        </div>
      )}

      {/* Versión 1 */}
      {hasV1 && (
        <VersionBox
          label="Versión 1"
          text={data.v1!}
          copied={copied === "v1"}
          onCopy={() => copyText(data.v1!, "v1")}
        />
      )}

      {/* Generar / mostrar versión 2 */}
      {hasV1 && !hasV2 && (
        <div className="rounded-xl border border-accent/15 bg-card/30 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5 text-accent" />
            ¿Querés afinarla? Dejá una sugerencia y generá la versión 2 (basada en la versión 1).
          </p>
          <Textarea
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="Ej: hacela más cálida, resaltá la luz natural y la cercanía al subte, acortá el cierre…"
            rows={3}
            maxLength={600}
            className="resize-none bg-background/60"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
              <Info className="h-3 w-3" /> Consume 1 crédito · Es la última versión posible
            </span>
            <Button
              size="sm"
              onClick={() => generate(2)}
              disabled={loadingVersion !== null}
              className="gap-2 bg-accent hover:bg-accent/90"
            >
              {loadingVersion === 2 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Generar versión 2
            </Button>
          </div>
        </div>
      )}

      {/* Versión 2 */}
      {hasV2 && (
        <VersionBox
          label="Versión 2 (mejorada)"
          text={data.v2!}
          highlight
          suggestion={data.suggestion}
          copied={copied === "v2"}
          onCopy={() => copyText(data.v2!, "v2")}
        />
      )}

      {hasV2 && (
        <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
          <Info className="h-3 w-3" /> Llegaste al máximo de 2 versiones. Copiá la que prefieras y
          pegala en Tokko si querés publicarla.
        </p>
      )}
    </div>
  )
}

function VersionBox({
  label,
  text,
  highlight,
  suggestion,
  copied,
  onCopy,
}: {
  label: string
  text: string
  highlight?: boolean
  suggestion?: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 space-y-3",
        highlight ? "border-accent/30 bg-accent/5" : "border-accent/10 bg-card/30"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-accent">{label}</span>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 border-accent/20" onClick={onCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      {suggestion && (
        <p className="text-[11px] italic text-muted-foreground/80">
          Sugerencia aplicada: &quot;{suggestion}&quot;
        </p>
      )}
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  )
}
