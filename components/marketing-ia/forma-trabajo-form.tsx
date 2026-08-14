"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MarketingIAStepper } from "./marketing-ia-stepper"
import { OfertasIrresistibles } from "./ofertas-irresistibles"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Loader2, Save, ArrowLeft, ArrowRight, Briefcase, AlertTriangle } from "lucide-react"
import {
  CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA, operacionCompleta, type CampoOperacion,
} from "@/lib/marketing-ia/campos-operacion"
import type { AdvisorOperation } from "@/types/marketing-ia"

const PASOS = ["Mi perfil", "Captación", "Venta", "Mis 2 ofertas"]

type Bloque = Record<string, string>

export function FormaTrabajoForm() {
  const [paso, setPaso] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [operacion, setOperacion] = useState<AdvisorOperation | null>(null)
  const [perfil, setPerfil] = useState<Bloque>({})
  const [captacion, setCaptacion] = useState<Bloque>({})
  const [venta, setVenta] = useState<Bloque>({})

  const supabase = createClient()

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from("advisor_operations").select("*").maybeSingle()
      if (data) {
        setOperacion(data as AdvisorOperation)
        setPerfil((data.perfil ?? {}) as Bloque)
        setCaptacion((data.captacion ?? {}) as Bloque)
        setVenta((data.venta ?? {}) as Bloque)
      }
      setCargando(false)
    }
    cargar()
  }, [])

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Sesión vencida, volvé a entrar")

      const { data, error } = await supabase
        .from("advisor_operations")
        .upsert(
          { user_id: user.id, perfil, captacion, venta, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .select()
        .single()

      if (error) throw error
      setOperacion(data as AdvisorOperation)
      toast.success("Guardado")
    } catch (e: any) {
      toast.error("No se pudo guardar: " + e.message)
      throw e
    } finally {
      setGuardando(false)
    }
  }

  const guardarSinRomper = async () => {
    try { await guardar() } catch { /* el toast ya avisó */ }
  }

  const campo = (c: CampoOperacion, valores: Bloque, setValores: (b: Bloque) => void) => (
    <div key={c.name} className="space-y-2">
      <Label className="text-sm font-bold leading-snug">{c.label}</Label>
      {c.multilinea ? (
        <Textarea
          value={valores[c.name] ?? ""}
          onChange={(e) => setValores({ ...valores, [c.name]: e.target.value })}
          placeholder={c.placeholder}
          className="min-h-[110px] resize-none bg-accent/5"
        />
      ) : (
        <Input
          value={valores[c.name] ?? ""}
          onChange={(e) => setValores({ ...valores, [c.name]: e.target.value })}
          placeholder={c.placeholder}
          className="h-12 bg-accent/5"
        />
      )}
    </div>
  )

  const avisoNumeros = (
    <div className="flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-sm text-muted-foreground">
        Estos números van a salir publicados en tus anuncios. <strong className="text-foreground">Cargá los reales.</strong>
      </p>
    </div>
  )

  if (cargando) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* px en celular: el stepper flota la etiqueta del paso activo sobre el círculo y se cortaba contra el borde */}
      <MarketingIAStepper steps={PASOS} currentStep={paso} className="mb-8 px-14 sm:px-0" />

      <Card className="border-accent/10 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-accent" />
            {PASOS[paso]}
          </CardTitle>
          <CardDescription>
            {paso === 0 && "Quién sos y qué te respalda. Es opcional, pero es lo que le da autoridad y pruebas reales a tus anuncios."}
            {paso === 1 && "Cómo trabajás cuando captás una propiedad. Con esto se arma tu oferta para los dueños."}
            {paso === 2 && "Cómo trabajás cuando ayudás a alguien a comprar. Con esto se arma tu oferta para los compradores."}
            {paso === 3 && "Tus 2 ofertas irresistibles: las podés editar a mano y regenerar cuando cambien tus números."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {paso === 0 && CAMPOS_PERFIL.map((c) => campo(c, perfil, setPerfil))}
          {paso === 1 && <>{avisoNumeros}{CAMPOS_CAPTACION.map((c) => campo(c, captacion, setCaptacion))}</>}
          {paso === 2 && <>{avisoNumeros}{CAMPOS_VENTA.map((c) => campo(c, venta, setVenta))}</>}
          {paso === 3 && (
            <OfertasIrresistibles
              operacion={operacion}
              completo={operacionCompleta({ perfil, captacion, venta })}
              guardarAntes={guardar}
              onActualizar={(parcial) => setOperacion((prev) => (prev ? { ...prev, ...parcial } : (parcial as AdvisorOperation)))}
            />
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 bg-accent/5 pt-6">
          <Button variant="outline" disabled={paso === 0} onClick={() => setPaso(paso - 1)} className="w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
          </Button>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="outline" onClick={guardarSinRomper} disabled={guardando} className="flex-1 sm:flex-none">
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
            <Button
              className="flex-1 sm:flex-none bg-accent"
              disabled={paso === PASOS.length - 1 || guardando}
              onClick={async () => { await guardarSinRomper(); setPaso(paso + 1) }}
            >
              Siguiente <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
