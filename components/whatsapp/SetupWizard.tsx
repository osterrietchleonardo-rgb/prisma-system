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
  { id: 1, title: "Requisitos", description: "Preparación" },
  { id: 2, title: "Página", description: "Crear Facebook" },
  { id: 3, title: "Portfolio", description: "Business Suite" },
  { id: 4, title: "App Meta", description: "Crear aplicación" },
  { id: 5, title: "Número", description: "Vincular teléfono" },
  { id: 6, title: "Token", description: "Acceso permanente" },
  { id: 7, title: "Conexión", description: "Vincular a PRISMA" }
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
  })

  const [preReqs, setPreReqs] = useState({
    facebookAccount: false,
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
      return !preReqs.facebookAccount || !preReqs.phoneNumber
    }
    if (currentStep === 7) {
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
              Conexión de Asesor IA WhatsApp
            </h2>
            <p className="text-muted-foreground mt-1">Sigue esta guía detallada para conectar tu cuenta desde cero</p>
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
        <div className="hidden md:grid grid-cols-7 gap-2">
          {steps.map((step) => (
            <div 
              key={step.id} 
              className={cn(
                "flex flex-col items-center gap-2 p-2 rounded-xl border transition-all",
                currentStep === step.id 
                  ? "bg-accent/10 border-accent/50" 
                  : currentStep > step.id
                    ? "bg-muted/50 border-border opacity-60"
                    : "bg-transparent border-transparent opacity-40"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                currentStep >= step.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? <Check className="h-3 w-3" /> : step.id}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-center line-clamp-1">{step.title}</span>
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
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-accent">1.</span> Requisitos Previos
                </h2>
                <p className="text-muted-foreground">Asegúrate de cumplir con estos dos requisitos antes de continuar para que Meta no restrinja los accesos.</p>
              </div>

              <div className="grid gap-4">
                {[
                  { id: 'facebookAccount', label: "Cuenta de Facebook antigua", desc: "Tener una cuenta de Facebook con más de un mes de antigüedad; de lo contrario, Meta no te dará los accesos necesarios.", icon: <ExternalLink className="h-4 w-4" /> },
                  { id: 'phoneNumber', label: "Número de teléfono nuevo", desc: "Conseguir un número de teléfono que no tenga ninguna cuenta de WhatsApp ni WhatsApp Business vinculada en ningún dispositivo.", icon: <MessageSquare className="h-4 w-4" /> }
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
            </div>
          )}

          {/* STEP 2: CREAR PAGINA FACEBOOK */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-accent">2.</span> Crear y configurar una página de Facebook
                </h2>
                <p className="text-muted-foreground">La base de tu negocio en Meta.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "Desde tu cuenta de Facebook, ve a la sección 'Ver más' y selecciona 'Páginas'." },
                  { step: "2", text: "Crea una Página pública nueva y asígnale el nombre de tu empresa y una categoría, como 'Servicios profesionales'." },
                  { step: "3", text: "Llena todos los datos posibles para darle legitimidad: sitio web, correo electrónico, dirección física, y agrega una foto de perfil y de portada." },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: CREAR PORTFOLIO COMERCIAL */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-accent">3.</span> Crear un Portfolio Comercial en Meta
                </h2>
                <p className="text-muted-foreground">Esto actuará como la entidad empresarial para organizar todo.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "Dirígete a Meta Business Suite y selecciona la opción para crear un 'Portfolio comercial'.", link: "https://business.facebook.com/" },
                  { step: "2", text: "Ponle un nombre relacionado con tu negocio, ingresa tu correo electrónico y haz clic en crear." },
                  { step: "3", text: "Una vez creado, conecta la página de Facebook que hiciste en el paso anterior a este portfolio." },
                  { step: "4", text: "Ve a la configuración del negocio (el ícono de la tuerca), completa la información real de tu empresa y confirma tu correo electrónico revisando tu bandeja de entrada." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium text-sm leading-relaxed">{item.text}</p>
                      {item.link && (
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[11px] font-bold text-accent hover:text-accent/80 flex items-center gap-1 mt-2 uppercase tracking-wide"
                        >
                          Ir a Meta Business Suite <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

               <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 flex gap-4">
                 <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                 <p className="text-sm text-foreground/80 leading-relaxed">
                   <span className="font-bold text-accent">Tip:</span> Si tienes problemas al crear el portfolio, conectar una cuenta de Instagram previamente ayuda a que se autorice más rápido.
                 </p>
               </div>
            </div>
          )}

          {/* STEP 4: CREAR APLICACION EN META */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-accent">4.</span> Crear una Aplicación en Meta
                </h2>
                <p className="text-muted-foreground">Es el puente oficial entre WhatsApp y PRISMA.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "Dentro del portfolio comercial, ve a la sección de desarrolladores/aplicaciones y haz clic en 'Crear identificador de la app'.", link: "https://developers.facebook.com/" },
                  { step: "2", text: "Ingresa un nombre para la app (ej. PRISMA Inmobiliaria) y tu correo electrónico." },
                  { step: "3", text: "En 'Casos de uso', ve a 'Destacados' y selecciona 'Conectarte con los clientes a través de WhatsApp'." },
                  { step: "4", text: "Selecciona el portfolio comercial que acabas de crear y finaliza la creación de la app." },
                  { step: "5", text: "(Opcional) En Configuración básica de la app, puedes llenar dominio web, privacidad y subir un ícono (1024x1024). No es obligatorio verificar el negocio para empezar a usar WhatsApp." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium text-sm leading-relaxed">{item.text}</p>
                      {item.link && (
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[11px] font-bold text-accent hover:text-accent/80 flex items-center gap-1 mt-2 uppercase tracking-wide"
                        >
                          Ir a Meta Developers <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: VINCULAR NUMERO DE TELEFONO */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-accent">5.</span> Conectar el número a la API oficial
                </h2>
                <p className="text-muted-foreground">Agrega ese nuevo número de teléfono a tu App creada.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "En el panel de tu nueva aplicación de Meta, ve a 'Personalizar el caso de uso' y selecciona 'Configuración de la API'." },
                  { step: "2", text: "Ignora el número de prueba que muestra el sistema y haz clic abajo en 'Agregar un número de teléfono'." },
                  { step: "3", text: "Ingresa la categoría de negocio, el código de país y el número de teléfono nuevo que preparaste al inicio." },
                  { step: "4", text: "Recibirás un mensaje de texto (SMS) con un código; ingrésalo para verificar el número." },
                  { step: "5", text: "Para evitar bloqueos: Ve a 'Configuración de pago' de tu portfolio y agrega una tarjeta o método de pago para cubrir posibles mensajes fuera de ventana." },
                  { step: "6", text: "Vuelve a la Configuración de la API y recarga la página. Asegúrate luego de tener verificación en dos pasos en tu perfil personal." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 6: TOKEN PERMANENTE */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-accent">6.</span> Generar Token Permanente
                </h2>
                <p className="text-muted-foreground">Esta clave permitirá a PRISMA conversar en nombre de tu cuenta sin caducar.</p>
              </div>

              <div className="space-y-4">
                {[
                  { step: "1", text: "En Meta Business Suite, ve a 'Usuarios del sistema'. Crea un usuario, ponle un nombre y asígnale el rol de Administrador." },
                  { step: "2", text: "Haz clic en 'Asignar activos' y dale control total sobre tu Página de Facebook, la App y la cuenta de WhatsApp." },
                  { step: "3", text: "Si el sistema exige más permisos en Meta for Developers, asegúrate de activar el permiso 'Business Management'." },
                  { step: "4", text: "Haz clic en 'Generar token', selecciona tu aplicación, configura la caducidad en 'Nunca' (permanente) y marca todos los permisos disponibles (whatsapp_business_management, whatsapp_business_messaging, etc.)." },
                  { step: "5", text: "Copia el token generado y guárdalo en un bloc de notas (luego desaparecerá)." }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-4 rounded-xl bg-muted/30 border border-border group hover:bg-muted/50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900/80 leading-relaxed dark:text-amber-200/80">
                  <span className="font-bold text-amber-700 dark:text-amber-400">Atención:</span> No uses el token "temporal" que te muestran en la configuración inicial de la API, pues caduca en 24h. Solo el token de "Usuario del Sistema" es permanente.
                </p>
              </div>
            </div>
          )}

          {/* STEP 7: CONECTAR PRISMA Y WEBHOOKS AUTOMATICOS */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div className="space-y-3 border-b border-border pb-6">
                <h2 className="text-2xl font-bold text-foreground">
                  <span className="text-accent mr-2">7.</span> Conectar a PRISMA
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Pasa los datos encontrados en "Configuración de la API" a PRISMA.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 flex gap-3">
                <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">Webhook automatizado</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    PRISMA configurará y suscribirá Automáticamente los Webhooks en Meta por ti, para que empieces a recibir mensajes de inmediato. Evita tocar los campos de webhook en Meta.
                  </p>
                </div>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground">Nombre para el sistema</label>
                  <Input 
                    placeholder="Ej: Inmobiliaria Ventas"
                    className="h-12 bg-background border-input"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground italic">Solo para distinguir este número en PRISMA.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-muted-foreground">ID de teléfono</label>
                      <span className="text-[10px] bg-accent/5 px-2 py-0.5 rounded text-accent tracking-widest font-mono uppercase">Phone Number ID</span>
                    </div>
                    <Input 
                      placeholder="Ej: 112233445566778"
                      className="h-12 bg-background border-input font-mono text-sm"
                      value={formData.phoneNumberId}
                      onChange={(e) => setFormData(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-muted-foreground">ID de la Cuenta</label>
                      <span className="text-[10px] bg-accent/5 px-2 py-0.5 rounded text-accent tracking-widest font-mono uppercase">Business Account ID</span>
                    </div>
                    <Input 
                      placeholder="Ej: 99887766554433"
                      className="h-12 bg-background border-input font-mono text-sm"
                      value={formData.wabaId}
                      onChange={(e) => setFormData(prev => ({ ...prev, wabaId: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-muted-foreground">Token Permanente</label>
                    <span className="text-[10px] bg-amber-500/10 px-2 py-0.5 rounded text-amber-600 dark:text-amber-500 font-mono tracking-widest uppercase">System User Token</span>
                  </div>
                  <div className="relative">
                    <Input 
                      type={showToken ? "text" : "password"}
                      placeholder="EAA..."
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
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-3 text-destructive">
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
              className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 h-12 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={handleConnect}
              disabled={isLoading || isNextDisabled()}
            >
              {isLoading ? (
                <>
                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Conectar y Guardar"
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
    </div>
  )
}

