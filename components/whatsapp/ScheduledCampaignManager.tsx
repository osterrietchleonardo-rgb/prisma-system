"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { WATemplate } from "@/types/whatsapp"
import {
  createSegmentCampaign,
  getCampaignsWithStats,
  setCampaignStatus,
  deleteCampaign,
  type CampaignWithStats,
} from "@/app/actions/whatsapp-campaigns"
import { validateMetaToken } from "@/app/actions/whatsapp"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarClock, Pause, Trash2, Loader2, Rocket } from "lucide-react"
import { toast } from "sonner"

interface Props {
  instance: any
}

interface VarEntry { mode: "field" | "manual"; value: string }

function getTemplateVars(template: WATemplate | undefined) {
  let headerVars: string[] = []
  let bodyVars: string[] = []
  if (template?.components && Array.isArray(template.components)) {
    template.components.forEach((c: any) => {
      if (c.type === "HEADER" && c.text) {
        headerVars = Array.from(new Set((c.text.match(/\{\{(\d+)\}\}/g) || []).map((m: string) => m.replace(/\D/g, ""))))
      }
      if (c.type === "BODY" && c.text) {
        bodyVars = Array.from(new Set((c.text.match(/\{\{(\d+)\}\}/g) || []).map((m: string) => m.replace(/\D/g, ""))))
      }
    })
  }
  return { headerVars, bodyVars }
}

function tierToNumber(tier: string | null | undefined): number {
  if (!tier) return 250
  const t = String(tier).toUpperCase()
  if (t.includes("UNLIMITED")) return 1000000
  const k = t.match(/(\d+)\s*K/)
  if (k) return parseInt(k[1], 10) * 1000
  const n = t.match(/(\d+)/)
  if (n) return parseInt(n[1], 10)
  return 250
}

const STATUS_LABEL: Record<string, string> = { active: "Activa", paused: "Pausada", completed: "Finalizada" }
const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  paused: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  completed: "bg-zinc-500/15 text-zinc-500 border-zinc-500/20",
}

export function ScheduledCampaignManager({ instance }: Props) {
  const supabase = createClient()

  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [clasifOptions, setClasifOptions] = useState<string[]>([])
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([])
  const [loading, setLoading] = useState(true)

  // Form
  const [name, setName] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [audience, setAudience] = useState("__all__")
  const [headerMap, setHeaderMap] = useState<Record<string, VarEntry>>({})
  const [bodyMap, setBodyMap] = useState<Record<string, VarEntry>>({})
  const [creating, setCreating] = useState(false)
  const [launchingId, setLaunchingId] = useState<string | null>(null)

  // Límite real leído en vivo desde Meta
  const SYSTEM_CEILING = 9600 // techo del goteo serverless (400/corrida x 24)
  const [liveTier, setLiveTier] = useState<string | null>(instance?.messaging_limit_tier ?? null)
  const [tokenOk, setTokenOk] = useState<boolean | null>(null)
  const metaDaily = tierToNumber(liveTier)
  const effectiveDaily = Math.min(metaDaily, SYSTEM_CEILING)

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const { headerVars, bodyVars } = getTemplateVars(selectedTemplate)

  const refreshCampaigns = useCallback(async () => {
    const res = await getCampaignsWithStats()
    if (res.success && res.data) setCampaigns(res.data)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: tpl } = await supabase
          .from("wa_templates")
          .select("*")
          .eq("agency_id", instance.agency_id)
          .eq("status", "APPROVED")
          .order("created_at", { ascending: false })
        if (tpl) setTemplates(tpl as WATemplate[])

        // Clasificaciones disponibles (muestra acotada; los valores distintos son pocos).
        const { data: cls } = await supabase
          .from("wa_contacts")
          .select("clasificacion")
          .eq("agency_id", instance.agency_id)
          .not("clasificacion", "is", null)
          .limit(2000)
        const set = new Set<string>()
        ;(cls || []).forEach((r: any) => { if (r.clasificacion) set.add(r.clasificacion) })
        setClasifOptions(Array.from(set).sort())

        // Leer el límite real de Meta en vivo (y persistirlo en la instancia).
        const tk = await validateMetaToken()
        if (tk.success && tk.data) {
          setTokenOk(tk.data.valid)
          if (tk.data.messaging_limit_tier) setLiveTier(tk.data.messaging_limit_tier)
        }

        await refreshCampaigns()
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [instance.agency_id, refreshCampaigns, supabase])

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Ponele un nombre a la campaña.")
    if (!selectedTemplate) return toast.error("Elegí una plantilla.")

    const variable_map = {
      header: headerVars.map((v) => headerMap[v] || { mode: "manual", value: "" }),
      body: bodyVars.map((v) => bodyMap[v] || { mode: "manual", value: "" }),
    }

    setCreating(true)
    const res = await createSegmentCampaign({
      name: name.trim(),
      template_name: selectedTemplate.template_name,
      template_language: selectedTemplate.language || "es_AR",
      variable_map,
      audience_clasificacion: audience === "__all__" ? null : audience,
      daily_limit: null, // el límite lo verifica el sistema contra Meta automáticamente
    })
    setCreating(false)

    if (res.success) {
      toast.success(`Campaña creada con ${res.enrolled ?? 0} contactos en cola. Tocá "Lanzar ahora" para empezar a enviar.`)
      setName(""); setTemplateId(""); setAudience("__all__"); setHeaderMap({}); setBodyMap({})
      await refreshCampaigns()
    } else {
      toast.error(res.error || "Error al crear la campaña")
    }
  }

  const handleStatus = async (id: string, status: "active" | "paused") => {
    const res = await setCampaignStatus(id, status)
    if (res.success) { toast.success(status === "active" ? "Campaña reanudada" : "Campaña pausada"); refreshCampaigns() }
    else toast.error(res.error || "Error")
  }

  const handleLaunch = async (c: CampaignWithStats) => {
    const pend = c.pending
    if (!window.confirm(`¿Lanzar la campaña "${c.name}" ahora?\n\nVa a empezar a enviar de inmediato a los ${pend.toLocaleString("es-AR")} contactos en cola, y seguir solo en lotes diarios (hasta tu límite de Meta) hasta terminar.`)) return
    setLaunchingId(c.id)
    try {
      const res = await fetch("/api/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: c.id }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const r = data.result
        const enviados = r && typeof r === "object" ? (r.sent ?? 0) : 0
        toast.success(`🚀 Campaña lanzada. ${enviados} enviados ahora; el resto sigue solo en lotes diarios.`)
      } else {
        toast.error(data.error || "No se pudo lanzar la campaña")
      }
    } catch {
      toast.error("Error de red al lanzar la campaña")
    } finally {
      setLaunchingId(null)
      refreshCampaigns()
    }
  }

  const handleDelete = async (c: CampaignWithStats) => {
    if (!window.confirm(`¿Eliminar la campaña "${c.name}"? Se borra su cola de envío (no los contactos).`)) return
    const res = await deleteCampaign(c.id)
    if (res.success) { toast.success("Campaña eliminada"); setCampaigns(prev => prev.filter(x => x.id !== c.id)) }
    else toast.error(res.error || "Error")
  }

  const renderVarRow = (scope: "header" | "body", v: string) => {
    const map = scope === "header" ? headerMap : bodyMap
    const setMap = scope === "header" ? setHeaderMap : setBodyMap
    const entry = map[v] || { mode: "field", value: "nombre" }
    return (
      <div key={`${scope}_${v}`} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border">
        <span className="text-xs font-medium text-accent w-28">{scope === "header" ? "Header" : "Cuerpo"} {`{{${v}}}`}</span>
        <Select value={entry.mode} onValueChange={(m) => setMap(p => ({ ...p, [v]: { mode: m as "field" | "manual", value: m === "field" ? "nombre" : "" } }))}>
          <SelectTrigger className="h-8 w-[120px] text-xs bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="field">Dato del contacto</SelectItem>
            <SelectItem value="manual">Texto fijo</SelectItem>
          </SelectContent>
        </Select>
        {entry.mode === "field" ? (
          <Select value={entry.value || "nombre"} onValueChange={(val) => setMap(p => ({ ...p, [v]: { mode: "field", value: val } }))}>
            <SelectTrigger className="h-8 flex-1 text-xs bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nombre">Nombre</SelectItem>
              <SelectItem value="celular">Celular</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input value={entry.value} onChange={(e) => setMap(p => ({ ...p, [v]: { mode: "manual", value: e.target.value } }))} placeholder="Texto fijo para todos" className="h-8 flex-1 text-xs bg-background" />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Crear campaña */}
      <Card className="border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5 text-accent" /> Campaña automática por segmento</CardTitle>
          <CardDescription>
            Elegí una clasificación y una plantilla. El sistema envía <b>automáticamente cada día</b> hasta tu límite de Meta,
            marca los enviados y <b>no repite</b> (aunque pauses y reanudes), hasta terminar todo el segmento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre de la campaña</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Reclutamiento Junio" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Plantilla aprobada</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Elegí la plantilla" /></SelectTrigger>
                <SelectContent>
                  {templates.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">No hay plantillas aprobadas.</div>
                  ) : templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Segmento (clasificación)</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los contactos</SelectItem>
                  {clasifOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Límite diario (Meta)</Label>
              <div className="h-10 flex items-center px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                Automático · {metaDaily.toLocaleString("es-AR")}/día
              </div>
            </div>
          </div>

          {/* Aviso dinámico según el límite real de Meta */}
          <div className="-mt-2 text-[12px] rounded-lg border bg-accent/5 border-accent/15 p-3 leading-relaxed">
            {tokenOk === false ? (
              <span className="text-destructive font-medium">
                ⚠️ El token de Meta no está activo. Actualizalo en Configuración → Costos Meta. Hasta entonces la campaña no enviará.
              </span>
            ) : metaDaily <= SYSTEM_CEILING ? (
              <span>
                Se enviarán automáticamente, en goteo, hasta <b>{metaDaily.toLocaleString("es-AR")} mensajes por día</b> (tu
                límite real de Meta), todos los días, hasta completar el segmento. No se repiten contactos.
              </span>
            ) : (
              <span>
                Tu límite de Meta es <b>{metaDaily.toLocaleString("es-AR")}/día</b>. El sistema enviará hasta
                <b> ~{SYSTEM_CEILING.toLocaleString("es-AR")} mensajes por día</b> (tope actual del envío automático).
                Para aprovechar todo tu límite hace falta un worker dedicado.
              </span>
            )}
          </div>

          {selectedTemplate && (headerVars.length > 0 || bodyVars.length > 0) && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Variables de la plantilla</Label>
              {headerVars.map((v) => renderVarRow("header", v))}
              {bodyVars.map((v) => renderVarRow("body", v))}
            </div>
          )}

          <Button onClick={handleCreate} disabled={creating} className="w-full bg-accent hover:bg-accent/90">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarClock className="h-4 w-4 mr-2" />}
            Crear campaña (queda lista para lanzar)
          </Button>
        </CardContent>
      </Card>

      {/* Lista de campañas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Campañas programadas</CardTitle>
          <CardDescription>Creás la campaña y la iniciás con <b>Lanzar ahora</b>. Después se envía sola en lotes diarios; podés pausarla o eliminarla.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
              Todavía no hay campañas programadas.
            </div>
          ) : (
            campaigns.map((c) => {
              const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0
              return (
                <div key={c.id} className="p-4 rounded-xl border bg-card/50 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.name}</span>
                        <Badge variant="outline" className={STATUS_STYLE[c.status]}>{STATUS_LABEL[c.status] || c.status}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Plantilla: {c.template_name} · Segmento: {c.audience_clasificacion || "Todos"}
                        {c.daily_limit ? ` · ${c.daily_limit}/día` : " · límite automático"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {c.status !== "completed" && (
                        <Button
                          size="sm"
                          className="h-8 bg-accent hover:bg-accent/90 gap-1"
                          disabled={launchingId === c.id || c.pending === 0}
                          title={c.pending === 0 ? "No hay contactos en cola" : "Lanzar/enviar ahora"}
                          onClick={() => handleLaunch(c)}
                        >
                          {launchingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                          {c.status === "paused" ? "Lanzar ahora" : "Enviar ahora"}
                        </Button>
                      )}
                      {c.status === "active" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Pausar" onClick={() => handleStatus(c.id, "paused")}><Pause className="h-4 w-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Eliminar" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{c.sent} enviados / {c.total} · {c.pending} en cola{c.error ? ` · ${c.error} con error` : ""}</span>
                    <span>{c.sent_24h} en las últimas 24h</span>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
