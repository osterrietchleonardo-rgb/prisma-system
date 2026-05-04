"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { 
  Lightbulb, 
  MessageSquare, 
  AlertCircle, 
  Rocket, 
  Send, 
  CheckCircle2,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { submitFeedback } from "@/lib/actions/feedback"
import { cn } from "@/lib/utils"

const feedbackSchema = z.object({
  type: z.string({
    required_error: "Por favor selecciona un tipo de sugerencia",
  }),
  content: z.string().min(10, {
    message: "El contenido debe tener al menos 10 caracteres",
  }),
})

type FeedbackFormValues = z.infer<typeof feedbackSchema>

const feedbackTypes = [
  { value: "sugerencia", label: "Sugerencia de Mejora", icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10" },
  { value: "oportunidad", label: "Nueva Oportunidad", icon: Rocket, color: "text-blue-500", bg: "bg-blue-500/10" },
  { value: "queja", label: "Queja o Problema", icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
  { value: "otro", label: "Otro", icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-500/10" },
]

export function FeedbackForm() {
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      content: "",
    },
  })

  async function onSubmit(data: FeedbackFormValues) {
    setIsPending(true)
    try {
      const result = await submitFeedback(data)
      if (result.success) {
        setIsSuccess(true)
        toast.success("¡Gracias por tu feedback!", {
          description: "Tu mensaje ha sido enviado correctamente.",
        })
        form.reset()
      } else {
        toast.error("Error al enviar", {
          description: result.error || "Ocurrió un problema inesperado.",
        })
      }
    } catch (error) {
      toast.error("Error al enviar", {
        description: "No se pudo conectar con el servidor.",
      })
    } finally {
      setIsPending(false)
    }
  }

  if (isSuccess) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-none shadow-2xl bg-gradient-to-b from-card to-card/50 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
        <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 animate-bounce">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">¡Mensaje Recibido!</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Tu opinión es fundamental para seguir evolucionando PRISMA IA. 
            El equipo revisará tu sugerencia a la brevedad.
          </p>
          <Button 
            onClick={() => setIsSuccess(false)}
            variant="outline"
            className="rounded-full px-8 hover:bg-emerald-500/5 hover:text-emerald-500 hover:border-emerald-500/50 transition-all duration-300"
          >
            Enviar otra sugerencia
          </Button>
        </CardContent>
      </Card>
    )
  }

  const selectedType = form.watch("type")
  const currentType = feedbackTypes.find(t => t.value === selectedType)

  return (
    <Card className="w-full max-w-2xl mx-auto border-none shadow-2xl bg-gradient-to-b from-card to-card/50 backdrop-blur-sm overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent via-primary to-accent opacity-50" />
      <CardHeader className="space-y-1 pb-8">
        <CardTitle className="text-3xl font-bold tracking-tight">Feedback y Sugerencias</CardTitle>
        <CardDescription className="text-base">
          Ayúdanos a construir la mejor plataforma inmobiliaria.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="type" className="text-sm font-semibold flex items-center gap-2">
              ¿Qué quieres compartir?
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {feedbackTypes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => form.setValue("type", item.value)}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 gap-2",
                    selectedType === item.value 
                      ? cn("border-primary bg-primary/5 shadow-inner scale-95", item.color)
                      : "border-transparent bg-muted/30 hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <div className={cn("p-2 rounded-lg", item.bg)}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-tight text-center leading-tight">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
            {form.formState.errors.type && (
              <p className="text-xs text-destructive font-medium mt-1">
                {form.formState.errors.type.message}
              </p>
            )}
          </div>

          <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-500">
            <Label htmlFor="content" className="text-sm font-semibold">
              Cuéntanos más detalles
            </Label>
            <div className="relative">
              <Textarea
                id="content"
                placeholder={
                  selectedType === 'queja' 
                    ? "Describe el problema que estás teniendo..." 
                    : "Escribe tu idea, sugerencia o comentario aquí..."
                }
                className="min-h-[160px] resize-none bg-muted/20 border-accent/20 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all duration-300 p-4"
                {...form.register("content")}
              />
              <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground font-medium flex items-center gap-1 opacity-50">
                Mínimo 10 caracteres
              </div>
            </div>
            {form.formState.errors.content && (
              <p className="text-xs text-destructive font-medium mt-1">
                {form.formState.errors.content.message}
              </p>
            )}
          </div>

          <Button 
            type="submit" 
            disabled={isPending}
            className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20 group"
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                Enviar Feedback
                <Send className="w-4 h-4 ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </>
            )}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground opacity-60 px-8">
            Al enviar este formulario, tu email y rol serán registrados automáticamente 
            para que podamos darte seguimiento si es necesario.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
