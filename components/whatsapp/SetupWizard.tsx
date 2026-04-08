"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check, Circle, ExternalLink, AlertTriangle, Info, Loader2, Eye, EyeOff, ChevronLeft, ChevronRight, MessageSquare, Copy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { connectWhatsApp, verifyWhatsAppWebhook } from "@/app/actions/whatsapp"
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
    <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg group">
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <code className="text-xs text-blue-400 font-mono truncate">{value}</code>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn(
          "h-8 w-8 shrink-0 transition-all",
          copied ? "text-green-400" : "text-slate-400 hover:text-white"
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
    title: "Requisitos", 
    description: "Cuentas y acceso" 
  },
  { 
    id: 2, 
    title: "App en Meta", 
    description: "Crear aplicación" 
  },
  { 
    id: 3, 
    title: "WhatsApp", 
    description: "Configurar producto" 
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
        name: formData.name,
        phoneNumberId: formData.phoneNumberId,
        wabaId: formData.wabaId,
        accessToken: formData.accessToken,
        verifyToken: formData.verifyToken
      })

      router.push("/director/asesor-ia-whatsapp?connected=true")
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header & Progress */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Configuración del Asesor IA
            </h1>
            <p className="text-slate-400 mt-1">Sigue los pasos para conectar tu cuenta de WhatsApp Business</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium text-blue-400">Paso {currentStep} de {steps.length}</span>
            <p className="text-xs text-slate-500">{steps[currentStep-1].title}</p>
          </div>
        </div>
        
        <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500"
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
                  ? "bg-blue-500/10 border-blue-500/50" 
                  : currentStep > step.id
                    ? "bg-slate-800/50 border-slate-700 opacity-60"
                    : "bg-transparent border-transparent opacity-40"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                currentStep >= step.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500"
              )}>
                {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-center line-clamp-1">{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
        <CardContent className="p-8">
          {/* STEP 1: PRE-REQS */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Antes de comenzar</h2>
                <p className="text-slate-400">Asegúrate de tener acceso a lo siguiente:</p>
              </div>

              <div className="grid gap-4">
                {[
                  { id: 'metaAccount', label: "Cuenta personal de Facebook activa", desc: "Necesaria para entrar al portal de desarrolladores.", icon: <ExternalLink className="h-4 w-4" /> },
                  { id: 'businessAccount', label: "Business Manager de Meta", desc: "Donde se gestionará tu negocio y línea de WhatsApp.", icon: <ExternalLink className="h-4 w-4" /> },
                  { id: 'phoneNumber', label: "Número de teléfono para WhatsApp", desc: "No debe estar activo en WhatsApp/Business app actualmente.", icon: <MessageSquare className="h-4 w-4" /> }
                ].map((item) => (
                  <div 
                    key={item.id}
                    className={cn(
                      "group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                      preReqs[item.id as keyof typeof preReqs] 
                        ? "bg-blue-500/5 border-blue-500/30" 
                        : "bg-slate-800/30 border-white/5 hover:border-slate-700"
                    )}
                    onClick={() => setPreReqs(prev => ({ ...prev, [item.id]: !prev[item.id as keyof typeof preReqs] }))}
                  >
                    <div className={cn(
                      "mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                      preReqs[item.id as keyof typeof preReqs] ? "bg-blue-600 border-blue-600" : "border-slate-600"
                    )}>
                      {preReqs[item.id as keyof typeof preReqs] && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{item.label}</span>
                        <div className="p-1 rounded bg-white/5 text-slate-400 group-hover:text-blue-400 transition-colors">
                          {item.icon}
                        </div>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80 leading-relaxed">
                  <span className="font-bold text-amber-400">Importante:</span> El número de teléfono que elijas <span className="font-bold">no debe estar activo</span> en la aplicación normal de WhatsApp o WhatsApp Business de tu celular. Si lo está, deberás eliminar la cuenta antes de vincularla a la API.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: CREATE META APP */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Crear aplicación en Meta</h2>
                <p className="text-slate-400">Sigue este proceso en el portal de desarrolladores</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "Ve a Meta for Developers e inicia sesión.", link: "https://developers.facebook.com" },
                  { step: "2", text: "Haz clic en 'Mis aplicaciones' y luego en 'Crear aplicación'." },
                  { step: "3", text: "Selecciona el tipo de uso 'Otro' y luego 'Empresa' como tipo de aplicación." },
                  { step: "4", text: "Asigna un nombre (ej: 'PRISMA Asesor') y vincula tu cuenta comercial de Meta (Business Account)." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-slate-800/30 border border-white/5">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-300 font-medium">{item.text}</p>
                      {item.link && (
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2 w-fit underline decoration-blue-400/30"
                        >
                          Ir al portal <ExternalLink className="h-3 w-3" />
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
                <h2 className="text-xl font-bold text-white">Activar Producto WhatsApp</h2>
                <p className="text-slate-400">Añade la funcionalidad a tu aplicación de Meta</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "En el panel izquierdo de tu aplicación en Meta, busca 'Añadir producto'." },
                  { step: "2", text: "Busca 'WhatsApp' y haz clic en el botón 'Configurar'." },
                  { step: "3", text: "Se te pedirá elegir una cuenta comercial (Business Account). Selecciona la correcta.", warning: "Asegúrate de que sea la misma que usas para administrar tu negocio." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-slate-800/30 border border-white/5">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {item.step}
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-slate-300 font-medium">{item.text}</p>
                      {item.warning && (
                        <div className="flex items-center gap-2 p-2 rounded bg-amber-500/5 text-[10px] text-amber-500/80 font-bold uppercase tracking-wider border border-amber-500/10">
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
                <h2 className="text-xl font-bold text-white">Vincular Número de Teléfono</h2>
                <p className="text-slate-400">Registra tu línea oficial de WhatsApp</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "Ve a WhatsApp > Configuración de la API en el menú lateral." },
                  { step: "2", text: "Baja hasta 'Paso 5: Añade un número de teléfono' y haz clic en 'Añadir número de teléfono'." },
                  { step: "3", text: "Completa el perfil público de tu cuenta de WhatsApp (Nombre, Horario, etc)." },
                  { step: "4", text: "Ingresa el número y verifícalo mediante el código SMS o llamada que te llegará." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-slate-800/30 border border-white/5">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-300 font-medium">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: WEBHOOK CONFIGURATION */}
          {currentStep === 5 && (
            <div className="space-y-8">
              <div className="space-y-3 border-b border-slate-800 pb-6">
                <h2 className="text-2xl font-bold text-white">Configurar Webhook</h2>
                <p className="text-slate-400 leading-relaxed">
                  Para que PRISMA reciba los mensajes en tiempo real, Meta necesita saber a dónde enviarlos.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">1</div>
                    <h3 className="font-bold text-white">Copia estos valores en Meta</h3>
                  </div>
                  
                  <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-4">
                    <p className="text-xs text-slate-500 font-medium mb-2">Dentro de Meta: <span className="text-slate-300">WhatsApp &gt; Configuración &gt; Seccion Webhooks</span></p>
                    <div className="grid gap-4">
                      <CopyButton 
                        label="Callback URL (URL de retorno)" 
                        value="https://vevolutionapiv.vakdor.com/webhook/whatsapp" 
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
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">2</div>
                    <h3 className="font-bold text-white">Activar la suscripción</h3>
                  </div>
                  
                  <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-3">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-500 mt-1 shrink-0" />
                      <p className="text-sm text-slate-300 leading-relaxed">
                        Una vez guardados los valores anteriores, haz clic en <span className="text-white font-bold">"Administrar"</span> (Manage) dentro de la misma sección de Webhooks.
                      </p>
                    </div>
                    <div className="flex items-start gap-3 pl-8">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <p className="text-sm text-slate-300">
                        Busca el campo llamado <span className="text-blue-400 font-mono font-bold">messages</span> y haz clic en <span className="text-white font-bold">Suscribirse</span>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex gap-4">
                  <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-200/80 leading-relaxed italic">
                    Esto le dice a Facebook: "Cada vez que PRISMA reciba un mensaje nuevo de un cliente, avísale al servidor de PRISMA".
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: FINALIZE & CONNECT */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="space-y-3 border-b border-slate-800 pb-6">
                <h2 className="text-2xl font-bold text-white">Conectar con PRISMA</h2>
                <p className="text-slate-400 leading-relaxed">
                  Copia los datos finales desde el portal de Meta para activar tu inteligencia artificial.
                </p>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Nombre de la instancia</label>
                  <Input 
                    placeholder="Ej: Inmobiliaria Central"
                    className="h-12 bg-slate-950 border-slate-800"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-slate-600 italic">Solo para identificarla dentro de tu panel.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Identificador de teléfono</label>
                      <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-blue-400">Phone Number ID</span>
                    </div>
                    <Input 
                      placeholder="15 dígitos numéricos..."
                      className="h-12 bg-slate-950 border-slate-800 font-mono text-sm"
                      value={formData.phoneNumberId}
                      onChange={(e) => setFormData(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                    />
                    <p className="text-[11px] text-slate-500">Se encuentra en <span className="text-slate-300">WhatsApp &gt; Configuración de la API</span>.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">ID de Cuenta Business</label>
                      <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-blue-400">Business Account ID</span>
                    </div>
                    <Input 
                      placeholder="15 dígitos numéricos..."
                      className="h-12 bg-slate-950 border-slate-800 font-mono text-sm"
                      value={formData.wabaId}
                      onChange={(e) => setFormData(prev => ({ ...prev, wabaId: e.target.value }))}
                    />
                    <p className="text-[11px] text-slate-500">Está justo debajo del ID de teléfono en Meta.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Token de Acceso Permanente</label>
                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-amber-500">System User Token</span>
                  </div>
                  <div className="relative">
                    <Input 
                      type={showToken ? "text" : "password"}
                      placeholder="Comienza con EA..."
                      className="h-12 bg-slate-950 border-slate-800 pr-12 font-mono text-sm"
                      value={formData.accessToken}
                      onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 text-slate-500 hover:text-white"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                    <p className="text-[11px] text-amber-200/70 leading-relaxed italic">
                      <span className="font-bold uppercase text-amber-500">Nota:</span> No uses el token "temporal" que expira en 24h. Debes crear un <span className="text-white font-bold">Usuario del Sistema</span> en la configuración de tu negocio y generar un token allí.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 text-red-500 animate-in fade-in slide-in-from-top-2">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between bg-slate-900/50 rounded-b-xl">
          <Button
            variant="ghost"
            className="text-slate-400 hover:text-white"
            onClick={handleBack}
            disabled={currentStep === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Anterior
          </Button>

          {currentStep === steps.length ? (
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 h-12 rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
                "bg-slate-100 hover:bg-white text-slate-900 px-8 h-12 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98]",
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
        <p className="text-slate-500 text-sm">¿Necesitas ayuda con la configuración?</p>
        <div className="flex gap-4">
          <a href="#" className="text-xs font-bold text-blue-400 hover:underline">Video Tutorial</a>
          <span className="text-slate-700">|</span>
          <a href="#" className="text-xs font-bold text-blue-400 hover:underline">Documentación PDF</a>
          <span className="text-slate-700">|</span>
          <a href="#" className="text-xs font-bold text-blue-400 hover:underline">Soporte Técnico</a>
        </div>
      </div>
    </div>
  )
}
