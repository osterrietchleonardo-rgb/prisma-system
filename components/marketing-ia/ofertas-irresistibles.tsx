"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Loader2, Sparkles, Save, RefreshCw, Home, Tag } from "lucide-react"
import type { AdvisorOperation } from "@/types/marketing-ia"

type Objetivo = "ambas" | "captacion" | "venta"

interface Props {
  operacion: AdvisorOperation | null;
  completo: boolean;
  /** Guarda el formulario antes de generar, para que la fila exista sí o sí. */
  guardarAntes: () => Promise<void>;
  onActualizar: (parcial: Partial<AdvisorOperation>) => void;
}

export function OfertasIrresistibles({ operacion, completo, guardarAntes, onActualizar }: Props) {
  const [captacion, setCaptacion] = useState(operacion?.oferta_captacion ?? "")
  const [venta, setVenta] = useState(operacion?.oferta_venta ?? "")
  const [generando, setGenerando] = useState<Objetivo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aConfirmar, setAConfirmar] = useState<Objetivo | null>(null)
  const supabase = createClient()

  useEffect(() => {
    setCaptacion(operacion?.oferta_captacion ?? "")
    setVenta(operacion?.oferta_venta ?? "")
  }, [operacion?.oferta_captacion, operacion?.oferta_venta])

  const hayEdicionAMano = (objetivo: Objetivo) =>
    objetivo === "captacion" ? Boolean(operacion?.oferta_captacion_editada)
      : objetivo === "venta" ? Boolean(operacion?.oferta_venta_editada)
      : Boolean(operacion?.oferta_captacion_editada || operacion?.oferta_venta_editada)

  const pedirGenerar = (objetivo: Objetivo) => {
    if (hayEdicionAMano(objetivo)) setAConfirmar(objetivo)
    else generar(objetivo)
  }

  const generar = async (objetivo: Objetivo) => {
    setAConfirmar(null)
    setGenerando(objetivo)
    try {
      await guardarAntes()
      const res = await fetch("/api/marketing-ia/generar-oferta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudieron generar las ofertas")
      onActualizar(data)
      window.dispatchEvent(new CustomEvent("prisma-refresh-credits"))
      toast.success("Listo. Revisá que cada número sea tuyo antes de usarlas.")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerando(null)
    }
  }

  const guardarEdicion = async () => {
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Sesión vencida, volvé a entrar")
      const patch = {
        oferta_captacion: captacion,
        oferta_venta: venta,
        oferta_captacion_editada: captacion !== (operacion?.oferta_captacion ?? "") || Boolean(operacion?.oferta_captacion_editada),
        oferta_venta_editada: venta !== (operacion?.oferta_venta ?? "") || Boolean(operacion?.oferta_venta_editada),
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from("advisor_operations").update(patch).eq("user_id", user.id).select().single()
      if (error) throw error
      onActualizar(data as AdvisorOperation)
      toast.success("Ofertas guardadas")
    } catch (e: any) {
      toast.error("No se pudo guardar: " + e.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!completo) {
    return (
      <div className="p-8 text-center bg-muted/20 rounded-2xl border border-dashed">
        <p className="font-bold">Todavía faltan datos</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Completá todos los campos de <strong>Captación</strong> y <strong>Venta</strong> para poder armar tus dos ofertas.
        </p>
      </div>
    )
  }

  const cuadro = (
    titulo: string,
    ayuda: string,
    icono: React.ReactNode,
    valor: string,
    setValor: (v: string) => void,
    objetivo: Exclude<Objetivo, "ambas">,
    editada?: boolean
  ) => (
    <Card className="border-accent/10">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3 gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">{icono}{titulo}</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">{ayuda}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editada && <Badge variant="outline" className="text-[10px]">editada a mano</Badge>}
          <Button
            variant="ghost" size="sm" title="Regenerar solo esta oferta"
            onClick={() => pedirGenerar(objetivo)} disabled={generando !== null}
          >
            {generando === objetivo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Todavía no la generaste."
          className="min-h-[170px] resize-none leading-relaxed"
        />
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {operacion?.ofertas_generadas_at
            ? `Generadas el ${new Date(operacion.ofertas_generadas_at).toLocaleDateString("es-AR")}`
            : "Todavía no generaste tus ofertas."}
        </p>
        <Button onClick={() => pedirGenerar("ambas")} disabled={generando !== null} className="bg-accent">
          {generando === "ambas" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Generar mis 2 ofertas <span className="ml-2 text-[10px] opacity-70">(1 crédito)</span>
        </Button>
      </div>

      {cuadro(
        "Oferta de Captación", "La que usás con los dueños que quieren vender.",
        <Home className="w-4 h-4 text-accent" />, captacion, setCaptacion, "captacion",
        operacion?.oferta_captacion_editada
      )}
      {cuadro(
        "Oferta de Venta", "La que usás con los que quieren comprar.",
        <Tag className="w-4 h-4 text-accent" />, venta, setVenta, "venta",
        operacion?.oferta_venta_editada
      )}

      <Button variant="outline" onClick={guardarEdicion} disabled={guardando || generando !== null} className="w-full">
        {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Guardar mis cambios
      </Button>

      <Dialog open={aConfirmar !== null} onOpenChange={(abierto) => !abierto && setAConfirmar(null)}>
        <DialogContent className="border-accent/20">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">¿Regenerar y perder tu versión?</DialogTitle>
            <DialogDescription>
              Esta oferta la editaste a mano. Si la regenerás, la IA la reescribe de cero y tu texto se pierde.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setAConfirmar(null)}>Mejor no</Button>
            <Button className="bg-accent" onClick={() => aConfirmar && generar(aConfirmar)}>Sí, regenerar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
