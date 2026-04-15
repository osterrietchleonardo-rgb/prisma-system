"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check, Circle, ExternalLink, AlertTriangle, Info, Loader2, Eye, EyeOff, ChevronLeft, ChevronRight, MessageSquare, Copy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { connectWhatsApp } from "@/app/actions/whatsapp"
import { cn } from "@/lib/utils"

// Componente simple para copiar al portapapeles
const CopyButton = ({ value, label }: { value: string, label: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Error al copiar:", err)
    }
  }

  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-lg group">
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <code className="text-xs text-accent font-mono truncate">{value}</code>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn(
          "h-8 w-8 shrink-0 transition-all",
          copied ? "text-green-500" : "text-muted-foreground hover:text-foreground"
        )}
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}

interface Step {
  id: number
  title: string
  description: string
}

const steps: Step[] = [
  { 
    id: 1, 
    title: "Preparación", 
    description: "Cuentas y verificación" 
  },
  { 
    id: 2, 
    title: "App en Meta", 
    description: "Configurar caso de uso" 
  },
  { 
    id: 3, 
    title: "API WhatsApp", 
    description: "Configuración inicial" 
  },
  { 
    id: 4, 
    title: "Número", 
    description: "Vincular teléfono" 
  },
  { 
    id: 5, 
    title: "Webhook", 
    description: "Activar avisos" 
  },
  { 
    id: 6, 
    title: "Conexión", 
    description: "Vincular a PRISMA" 
  }
]

export function SetupWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    phoneNumberId: "",
    wabaId: "",
    accessToken: "",
    verifyToken: process.env.NEXT_PUBLIC_WHATSAPP_WEBHOOK_VERIFY_TOKEN || "PrismaSaaS2026_Verificacion!",
    apiUrl: typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/meta` : "https://prisma.vakdor.com/api/webhooks/meta",
    useExistingWebhook: true
  })

  const [preReqs, setPreReqs] = useState({
    metaAccount: false,
    businessAccount: false,
    phoneNumber: false
  })

  const [showToken, setShowToken] = useState(false)

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1)
      window.scrollTo(0, 0)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
      window.scrollTo(0, 0)
    }
  }

  const handleConnect = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      if (!formData.name || !formData.phoneNumberId || !formData.wabaId || !formData.accessToken) {
        throw new Error("Por favor, completa todos los campos de credenciales.")
      }

      await connectWhatsApp({
        token: formData.accessToken,
        phone_number_id: formData.phoneNumberId,
        business_id: formData.wabaId
      })

      router.push("/asesor/whatsapp?connected=true")
    } catch (err: any) {
      setError(err.message || "Error al conectar con WhatsApp")
    } finally {
      setIsLoading(false)
    }
  }

  const isNextDisabled = () => {
    if (currentStep === 1) {
      return !preReqs.metaAccount || !preReqs.businessAccount || !preReqs.phoneNumber
    }
    if (currentStep === 6) {
      return !formData.name || !formData.phoneNumberId || !formData.wabaId || !formData.accessToken
    }
    return false
  }

  const progress = (currentStep / steps.length) * 100

  return (
    <div className="flex flex-col h-full space-y-8 p-4 md:p-8 pt-6">
      {/* Header & Progress */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Configuración del Asesor IA
            </h2>
            <p className="text-muted-foreground mt-1">Sigue los pasos para conectar tu cuenta de WhatsApp Business</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium text-accent">Paso {currentStep} de {steps.length}</span>
            <p className="text-xs text-muted-foreground">{steps[currentStep-1].title}</p>
          </div>
        </div>
        
        <div className="relative h-2 bg-muted rounded-full overflow-hidden border">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-accent to-accent/60 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Desktop Steps Indicator */}
        <div className="hidden md:grid grid-cols-6 gap-2">
          {steps.map((step) => (
            <div 
              key={step.id} 
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                currentStep === step.id 
                  ? "bg-accent/10 border-accent/50" 
                  : currentStep > step.id
                    ? "bg-muted/50 border-border opacity-60"
                    : "bg-transparent border-transparent opacity-40"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                currentStep >= step.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-center line-clamp-1">{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="bg-card border-border backdrop-blur-xl">
        <CardContent className="p-8">
          {/* STEP 1: PRE-REQS */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground italic flex items-center gap-2">
                  <span className="text-accent underline">1.</span> Antes de comenzar
                </h2>
                <p className="text-muted-foreground">Necesitas tener estos 3 elementos listos para una conexión exitosa:</p>
              </div>

              <div className="grid gap-4">
                {[
                  { id: 'metaAccount', label: "Perfil de Facebook verificado", desc: "Debes ser administrador y tener autenticación en dos pasos activa.", icon: <ExternalLink className="h-4 w-4" /> },
                  { id: 'businessAccount', label: "Meta Business Suite", desc: "Tu cuenta de empresa (Business Manager) debe estar activa y verificada.", icon: <ExternalLink className="h-4 w-4" /> },
                  { id: 'phoneNumber', label: "Número limpio (No WhastApp)", desc: "El número no debe estar en WhatsApp/Business app. Si lo está, borra la cuenta primero.", icon: <MessageSquare className="h-4 w-4" /> }
                ].map((item) => (
                  <div 
                    key={item.id}
                    className={cn(
                      "group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                      preReqs[item.id as keyof typeof preReqs] 
                        ? "bg-accent/5 border-accent/30" 
                        : "bg-muted/30 border-border hover:border-accent/50 shadow-sm"
                    )}
                    onClick={() => setPreReqs(prev => ({ ...prev, [item.id]: !prev[item.id as keyof typeof preReqs] }))}
                  >
                    <div className={cn(
                      "mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-all",
                      preReqs[item.id as keyof typeof preReqs] ? "bg-accent border-accent scale-110 shadow-[0_0_10px_rgba(var(--accent),0.3)]" : "border-input"
                    )}>
                      {preReqs[item.id as keyof typeof preReqs] && <Check className="h-3 w-3 text-accent-foreground" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{item.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 dark:text-amber-500" />
                <p className="text-sm text-amber-900/80 leading-relaxed dark:text-amber-200/80">
                  <span className="font-bold text-amber-700 dark:text-amber-400">¡AVISO CRÍTICO!</span> Si usas un número que ya tiene WhatsApp, el proceso de vinculación fallará. <span className="font-extrabold underline">Debes eliminar la cuenta definitivamente</span> en Configuración {'->'} Cuenta {'->'} Eliminar cuenta.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: CREATE META APP */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground italic flex items-center gap-2">
                  <span className="text-accent underline">2.</span> Crear aplicación en Meta
                </h2>
                <p className="text-muted-foreground">Configura el entorno de desarrollo oficial.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "Visita Meta for Developers e inicia sesión con tu perfil verificado.", link: "https://developers.facebook.com" },
                  { step: "2", text: "En 'Mis aplicaciones', pulsa el botón 'Crear aplicación'." },
                  { step: "3", text: "Selecciona el caso de uso: 'Conectarte con los clientes a través de WhatsApp'." },
                  { step: "4", text: "Escribe un nombre (ej: 'PRISMA CRM') y selecciona tu Business Account correcta en el desplegable." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-semibold leading-tight">{item.text}</p>
                      {item.link && (
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[11px] font-bold text-accent hover:text-accent/80 flex items-center gap-1 mt-2 uppercase tracking-wide"
                        >
                          Abrir Portal de Meta <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: CONFIGURE WHATSAPP */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground italic flex items-center gap-2">
                  <span className="text-accent underline">3.</span> Configurar API WhatsApp
                </h2>
                <p className="text-muted-foreground">Activa el motor de WhatsApp en tu nueva App.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "En la barra lateral izquierda, localiza 'WhatsApp' y entra en 'Configuración de la API'." },
                  { step: "2", text: "Confirma que tu Business Account esté seleccionada y que el número de prueba se vea correctamente." },
                  { step: "3", text: "Si el sistema te pide aceptar políticas de WhatsApp Business, acéptalas para continuar.", warning: "Cualquier error aquí suele ser por falta de verificación del Business Manager." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-foreground font-semibold leading-tight">{item.text}</p>
                      {item.warning && (
                        <div className="flex items-center gap-2 p-2 rounded bg-amber-500/5 text-[10px] text-amber-600 font-bold uppercase tracking-wider border border-amber-500/10 dark:text-amber-500">
                          <Info className="h-3 w-3" />
                          {item.warning}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: PHONE NUMBER */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground italic flex items-center gap-2">
                  <span className="text-accent underline">4.</span> Vincular Número de Teléfono
                </h2>
                <p className="text-muted-foreground">Registra tu línea oficial para que PRISMA pueda hablar.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "En 'Configuración de la API', baja hasta la sección 'Paso 5: Añade un número de teléfono'." },
                  { step: "2", text: "Haz clic en 'Añadir número de teléfono' y rellena el perfil de tu empresa." },
                  { step: "3", text: "Introduce tu número real y selecciona el método de verificación (SMS es lo más rápido)." },
                  { step: "4", text: "Introduce el código recibido. Una vez verificado, tu número aparecerá como 'Activo'." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-semibold">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: WEBHOOK CONFIGURATION */}
          {currentStep === 5 && (
            <div className="space-y-8">
              <div className="space-y-3 border-b border-border pb-6">
                <h2 className="text-2xl font-bold text-foreground italic">
                  <span className="text-accent underline">5.</span> Configurar Webhook
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Este es el "oído" de PRISMA. Le permite escuchar a tus clientes en tiempo real.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">1</div>
                    <h3 className="font-bold text-foreground">Copia estos datos en el Portal de Meta</h3>
                  </div>
                  
                  <div className="bg-muted p-6 rounded-2xl border border-border space-y-4 shadow-inner">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mb-2 text-center">
                      Configuración {'->'} Webhooks de WhatsApp
                    </p>
                    <div className="grid gap-4">
                      <CopyButton 
                        label="Callback URL (URL de retorno)" 
                        value={formData.apiUrl} 
                      />
                      <CopyButton 
                        label="Verify Token (Token de verificación)" 
                        value={formData.verifyToken} 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-xs shrink-0">2</div>
                    <h3 className="font-bold text-foreground">Activar la suscripción</h3>
                  </div>
                  
                  <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-3">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-600 mt-1 shrink-0" />
                      <p className="text-sm text-foreground leading-relaxed">
                        Una vez guardados los valores anteriores, haz clic en <span className="text-accent font-bold">"Administrar"</span> (Manage) dentro de la misma sección de Webhooks.
                      </p>
                    </div>
                    <div className="flex items-start gap-3 pl-8">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        Busca el campo llamado <span className="text-accent font-mono font-bold">messages</span> y haz clic en <span className="text-foreground font-bold">Suscribirse</span>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex gap-4">
                  <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed italic">
                    Esto le dice a Facebook: "Cada vez que PRISMA reciba un mensaje nuevo de un cliente, avísale al servidor de PRISMA".
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: FINALIZE & CONNECT */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="space-y-3 border-b border-border pb-6">
                <h2 className="text-2xl font-bold text-foreground italic">
                  <span className="text-accent underline">6.</span> Conectar con PRISMA
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  ¡Casi listos! Introduce las credenciales finales para activar tu Asesor con IA.
                </p>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Nombre de la instancia</label>
                  <Input 
                    placeholder="Ej: Inmobiliaria Central"
                    className="h-12 bg-background border-input"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground italic">Solo para identificarla dentro de tu panel.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Identificador de teléfono</label>
                      <span className="text-[10px] bg-accent/5 px-2 py-0.5 rounded text-accent">Phone Number ID</span>
                    </div>
                    <Input 
                      placeholder="15 dígitos numéricos..."
                      className="h-12 bg-background border-input font-mono text-sm"
                      value={formData.phoneNumberId}
                      onChange={(e) => setFormData(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Se encuentra en <span className="text-foreground font-bold">WhatsApp &gt; Configuración de la API</span>.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">ID de Cuenta Business</label>
                      <span className="text-[10px] bg-accent/5 px-2 py-0.5 rounded text-accent">Business Account ID</span>
                    </div>
                    <Input 
                      placeholder="15 dígitos numéricos..."
                      className="h-12 bg-background border-input font-mono text-sm"
                      value={formData.wabaId}
                      onChange={(e) => setFormData(prev => ({ ...prev, wabaId: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Está justo debajo del ID de teléfono en Meta.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Token de Acceso Permanente</label>
                    <span className="text-[10px] bg-amber-500/10 px-2 py-0.5 rounded text-amber-600 dark:text-amber-500">System User Token</span>
                  </div>
                  <div className="relative">
                    <Input 
                      type={showToken ? "text" : "password"}
                      placeholder="Comienza con EA..."
                      className="h-12 bg-background border-input pr-12 font-mono text-sm"
                      value={formData.accessToken}
                      onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                    <p className="text-[11px] text-amber-800/70 leading-relaxed italic dark:text-amber-200/70">
                      <span className="font-bold uppercase text-amber-600 dark:text-amber-500">Nota:</span> No uses el token "temporal" que expira en 24h. Debes crear un <span className="text-foreground font-bold">Usuario del Sistema</span> en la configuración de tu negocio y generar un token allí.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-3 text-destructive animate-in fade-in slide-in-from-top-2">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-border flex items-center justify-between bg-muted/30 rounded-b-xl">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={handleBack}
            disabled={currentStep === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Anterior
          </Button>

          {currentStep === steps.length ? (
            <Button
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 h-12 rounded-xl font-bold shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={handleConnect}
              disabled={isLoading || isNextDisabled()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Finalizar Conexión"
              )}
            </Button>
          ) : (
            <Button
              className={cn(
                "bg-foreground hover:bg-foreground/90 text-background px-8 h-12 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98]",
                isNextDisabled() && "opacity-50 cursor-not-allowed"
              )}
              onClick={handleNext}
              disabled={isNextDisabled()}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </Card>

      {/* Help Note */}
      <div className="flex justify-center flex-col items-center gap-2">
        <p className="text-muted-foreground text-sm">¿Necesitas ayuda con la configuración?</p>
        <div className="flex gap-4">
          <a href="#" className="text-xs font-bold text-accent hover:underline">Video Tutorial</a>
          <span className="text-border">|</span>
          <a href="#" className="text-xs font-bold text-accent hover:underline">Documentación PDF</a>
          <span className="text-border">|</span>
          <a href="#" className="text-xs font-bold text-accent hover:underline">Soporte Técnico</a>
        </div>
      </div>
    </div>
  )
}
