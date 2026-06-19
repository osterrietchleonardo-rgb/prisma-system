"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, KeyRound, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { validateMetaToken, updateMetaToken, type MetaTokenStatus } from "@/app/actions/whatsapp"

export function MetaTokenManager() {
  const [status, setStatus] = useState<MetaTokenStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [newToken, setNewToken] = useState("")
  const [saving, setSaving] = useState(false)

  const check = async () => {
    setChecking(true)
    const res = await validateMetaToken()
    if (res.success && res.data) {
      setStatus(res.data)
    } else {
      setStatus({ valid: false, message: res.error || "No se pudo verificar el token." })
    }
    setChecking(false)
  }

  useEffect(() => {
    check()
  }, [])

  const handleSave = async () => {
    if (!newToken.trim()) {
      toast.error("Pegá el token permanente de Meta.")
      return
    }
    setSaving(true)
    const res = await updateMetaToken(newToken.trim())
    setSaving(false)
    if (res.success && res.data) {
      setStatus(res.data)
      setNewToken("")
      toast.success("Token actualizado y validado correctamente.")
    } else {
      toast.error(res.error || "No se pudo actualizar el token.")
    }
  }

  return (
    <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" /> Token de Meta (WhatsApp)
        </CardTitle>
        <CardDescription>
          Estado del token que usa PRISMA para hablar con Meta (costos, plantillas y campañas).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estado actual */}
        <div className="flex items-center gap-3">
          {checking ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando token...
            </span>
          ) : status?.valid ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Token válido y activo
              </Badge>
              {status.phone_display && (
                <span className="text-xs text-muted-foreground">{status.phone_display}</span>
              )}
              {status.messaging_limit_tier && (
                <span className="text-xs text-muted-foreground">· Límite: {status.messaging_limit_tier}</span>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive w-full">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">El token no está activo</p>
                <p className="text-xs opacity-90 mt-0.5">{status?.message}</p>
              </div>
            </div>
          )}
          {!checking && (
            <Button variant="ghost" size="icon" onClick={check} title="Volver a verificar" className="ml-auto h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Actualizar token */}
        <div className="space-y-2 pt-2 border-t border-accent/10">
          <label className="text-sm font-medium">Pegar token permanente (System User)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="EAAG... (token que no expira)"
              className="bg-background/50 border-accent/20 font-mono text-xs"
              disabled={saving}
            />
            <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 whitespace-nowrap">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar y validar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Generá el token en <b>Meta Business Settings → Usuarios del sistema</b>, con permiso
            <b> whatsapp_business_messaging</b> y <b>whatsapp_business_management</b>, y caducidad
            <b> &quot;Nunca&quot;</b>. Se valida contra Meta antes de guardar: si no es válido, no pisa el token actual.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
