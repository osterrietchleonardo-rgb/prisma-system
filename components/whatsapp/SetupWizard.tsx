"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check, Circle, ExternalLink, AlertTriangle, Info, Loader2, Eye, EyeOff, ChevronLeft, ChevronRight, MessageSquare, Copy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { connectWhatsApp, getInstanceStatus } from "@/app/actions/whatsapp"
import { toast } from "sonner"

// =============================================
// Step configuration
// =============================================

const STEPS = [
  { number: 1, title: "Cuenta Meta", shortTitle: "Meta" },
  { number: 2, title: "Creá tu app", shortTitle: "App" },
  { number: 3, title: "Agregá WhatsApp", shortTitle: "WhatsApp" },
  { number: 4, title: "System User y Token", shortTitle: "Token" },
  { number: 5, title: "Configurar Webhook", shortTitle: "Webhook" },
  { number: 6, title: "Credenciales", shortTitle: "Conectar" },
]

// =============================================
// Main Component
// =============================================

export function SetupWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set())

  // Step 6 form state (no form tag)
  const [token, setToken] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [businessId, setBusinessId] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [connectionError, setConnectionError] = useState("")
  const [showToken, setShowToken] = useState(false)

  const toggleCheck = useCallback((step: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(step)) next.delete(step)
      else next.add(step)
      return next
    })
  }, [])

  const canAdvance = currentStep < 6
    ? checkedSteps.has(currentStep)
    : false

  const progressValue = ((currentStep - 1) / (STEPS.length - 1)) * 100

  // Step 6: Connect handler
  const handleConnect = async () => {
    setConnectionError("")

    if (token.length < 20) {
      setConnectionError("El token debe tener al menos 20 caracteres.")
      return
    }
    if (!/^\d{10,16}$/.test(phoneNumberId)) {
      setConnectionError("Phone Number ID debe ser entre 10 y 16 dígitos.")
      return
    }
    if (!/^\d{8,16}$/.test(businessId)) {
      setConnectionError("Business ID debe ser entre 8 y 16 dígitos.")
      return
    }

    setIsConnecting(true)

    const result = await connectWhatsApp({
      token,
      phone_number_id: phoneNumberId,
      business_id: businessId,
    })

    if (!result.success) {
      setConnectionError(result.error || "Error al conectar.")
      setIsConnecting(false)
      return
    }

    toast.success("¡Instancia creada exitosamente!")
    setIsConnecting(false)
    setIsPolling(true)

    // Polling: check status every 5s, max 60s (12 attempts)
    let attempts = 0
    const maxAttempts = 12
    const agencySlice = "" // We don't have agency_id client-side, but the action already named it

    const pollInterval = setInterval(async () => {
      attempts++
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval)
        setIsPolling(false)
        toast.info("Conexión en proceso. Recargá la página en unos minutos.")
        router.refresh()
        return
      }

      // On successful create, just refresh to show the ChatInterface placeholder
      // The page server component will query the new instance
      clearInterval(pollInterval)
      setIsPolling(false)
      router.refresh()
    }, 5000)

    // First check after 5s
    setTimeout(() => {
      clearInterval(pollInterval)
      setIsPolling(false)
      router.refresh()
    }, 5000)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-500">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 border-b bg-card/50">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              Asesor IA en <span className="text-accent">WhatsApp</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Configurá tu instancia en 6 pasos simples
            </p>
          </div>
        </div>

        {/* Progress bar — copper */}
        <div className="mt-4">
          <Progress
            value={progressValue}
            className="h-2"
            indicatorClassName="bg-accent transition-all duration-500"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Paso {currentStep} de {STEPS.length}
          </p>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop: Left column — Steps sidebar (hidden on mobile) */}
        <div className="hidden md:flex md:flex-col md:w-[260px] md:flex-shrink-0 border-r bg-card/30 p-4 sticky top-0">
          <nav className="space-y-1">
            {STEPS.map((step) => {
              const isActive = currentStep === step.number
              const isCompleted = checkedSteps.has(step.number)
              const isPast = step.number < currentStep

              return (
                <button
                  key={step.number}
                  onClick={() => {
                    if (step.number <= currentStep || checkedSteps.has(step.number - 1) || step.number === 1) {
                      setCurrentStep(step.number)
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    isActive
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : isPast || isCompleted
                      ? "text-muted-foreground hover:bg-muted/50"
                      : "text-muted-foreground/50 cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isActive
                        ? "bg-accent text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold">{step.number}</span>
                    )}
                  </div>
                  <span className="truncate">{step.title}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Mobile: Pills (visible only on mobile) */}
        <div className="md:hidden absolute top-[140px] left-0 right-0 z-10 bg-background/80 backdrop-blur-sm border-b px-3 py-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {STEPS.map((step) => {
              const isActive = currentStep === step.number
              const isCompleted = checkedSteps.has(step.number)

              return (
                <button
                  key={step.number}
                  onClick={() => {
                    if (step.number <= currentStep || checkedSteps.has(step.number - 1) || step.number === 1) {
                      setCurrentStep(step.number)
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? "bg-accent text-white"
                      : isCompleted
                      ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted && <Check className="w-3 h-3" />}
                  {step.shortTitle}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right column — Step content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 md:pt-6 pt-16">
          <div className="max-w-2xl mx-auto animate-in fade-in duration-300" key={currentStep}>
            {currentStep === 1 && <Step1 checked={checkedSteps.has(1)} onToggle={() => toggleCheck(1)} />}
            {currentStep === 2 && <Step2 checked={checkedSteps.has(2)} onToggle={() => toggleCheck(2)} />}
            {currentStep === 3 && <Step3 checked={checkedSteps.has(3)} onToggle={() => toggleCheck(3)} />}
            {currentStep === 4 && <Step4 checked={checkedSteps.has(4)} onToggle={() => toggleCheck(4)} />}
            {currentStep === 5 && <Step5 checked={checkedSteps.has(5)} onToggle={() => toggleCheck(5)} />}
            {currentStep === 6 && (
              <Step6
                token={token}
                setToken={setToken}
                phoneNumberId={phoneNumberId}
                setPhoneNumberId={setPhoneNumberId}
                businessId={businessId}
                setBusinessId={setBusinessId}
                showToken={showToken}
                setShowToken={setShowToken}
                isConnecting={isConnecting}
                isPolling={isPolling}
                connectionError={connectionError}
                onConnect={handleConnect}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Fixed footer nav (visible only on mobile) */}
      <div className="md:hidden flex items-center justify-between p-3 border-t bg-card/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground font-medium">
          {currentStep} / {STEPS.length}
        </span>
        {currentStep < 6 ? (
          <Button
            size="sm"
            disabled={!canAdvance}
            onClick={() => setCurrentStep((s) => Math.min(6, s + 1))}
            className="bg-accent hover:bg-accent/90 text-white"
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <div className="w-[100px]" />
        )}
      </div>

      {/* Desktop: Bottom navigation (hidden on mobile) */}
      <div className="hidden md:flex items-center justify-between px-8 py-4 border-t bg-card/50">
        <Button
          variant="outline"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Anterior
        </Button>
        {currentStep < 6 && (
          <Button
            disabled={!canAdvance}
            onClick={() => setCurrentStep((s) => Math.min(6, s + 1))}
            className="bg-accent hover:bg-accent/90 text-white"
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}

// =============================================
// Step Components
// =============================================

interface StepCheckProps {
  checked: boolean
  onToggle: () => void
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(`${label} copiado al portapapeles`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider ml-1">
        {label}
      </span>
      <div className="flex gap-2">
        <div className="flex-1 font-mono text-xs px-3 py-2.5 bg-muted/50 border rounded-lg overflow-hidden truncate">
          {value}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 hover:bg-accent hover:text-white transition-colors"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

function StepCheckbox({ checked, onToggle, label }: StepCheckProps & { label: string }) {
  return (
    <div
      className="flex items-start gap-3 mt-6 p-4 rounded-xl border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onToggle}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-0.5 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
      />
      <span className="text-sm font-medium leading-snug">{label}</span>
    </div>
  )
}

function OrderedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5 mt-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <span className="text-muted-foreground leading-relaxed pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  )
}

// --- Step 1: Cuenta Meta ---
function Step1({ checked, onToggle }: StepCheckProps) {
  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <span className="text-accent">01.</span> Cuenta Meta Business
        </CardTitle>
        <CardDescription className="text-base">
          Necesitás una cuenta de Meta for Developers para conectar WhatsApp a PRISMA.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si ya tenés una cuenta, verificá que tenés acceso como administrador al Business Manager vinculado.
          </p>
          <a
            href="https://developers.facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Ir a Meta for Developers
          </a>
        </div>

        <StepCheckbox
          checked={checked}
          onToggle={onToggle}
          label="Tengo acceso a Meta for Developers con permisos de administrador"
        />
      </CardContent>
    </Card>
  )
}

// --- Step 2: Crear App ---
function Step2({ checked, onToggle }: StepCheckProps) {
  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <span className="text-accent">02.</span> Creá tu App
        </CardTitle>
        <CardDescription className="text-base">
          Creá una aplicación de tipo &quot;Empresa&quot; en Meta for Developers.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <OrderedList
          items={[
            'Ingresá a "Mis Apps" en Meta for Developers.',
            'Clic en "Crear App".',
            'Seleccioná tipo "Empresa".',
            "Elegí un nombre descriptivo (ej: PRISMA WhatsApp).",
            "Vinculá al Business Manager de tu inmobiliaria.",
          ]}
        />
        <StepCheckbox checked={checked} onToggle={onToggle} label="Creé mi app en Meta for Developers" />
      </CardContent>
    </Card>
  )
}

// --- Step 3: Agregar WhatsApp ---
function Step3({ checked, onToggle }: StepCheckProps) {
  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <span className="text-accent">03.</span> Agregá WhatsApp
        </CardTitle>
        <CardDescription className="text-base">
          Habilitá el producto WhatsApp dentro de tu app.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <OrderedList
          items={[
            "En el Dashboard de tu app, buscá la sección de productos.",
            'Encontrá "WhatsApp" y hacé clic en "Configurar".',
            "Aceptá los términos y condiciones de uso de la API.",
            "Verificá que el producto quede habilitado correctamente.",
          ]}
        />
        <StepCheckbox checked={checked} onToggle={onToggle} label="Agregué el producto WhatsApp a mi app" />
      </CardContent>
    </Card>
  )
}

// --- Step 4: System User + Token ---
function Step4({ checked, onToggle }: StepCheckProps) {
  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <span className="text-accent">04.</span> System User y Token
        </CardTitle>
        <CardDescription className="text-base">
          Creá un System User en tu Business Manager para obtener un token de acceso permanente.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Alert className="mb-5 border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400 font-bold">
            ⚠️ Token visible UNA SOLA VEZ
          </AlertTitle>
          <AlertDescription className="text-amber-600/80 dark:text-amber-400/80">
            Guardá el token inmediatamente después de generarlo. No podrás verlo de nuevo.
          </AlertDescription>
        </Alert>

        <OrderedList
          items={[
            'Business Manager → Configuración → Usuarios del sistema → "Agregar". Asigná rol Admin.',
            "Asigná la app creada al System User con permiso de Administración total.",
            'Hacé clic en "Generar token". Activá los permisos: whatsapp_business_messaging y whatsapp_business_management.',
            "¡Copiá el token inmediatamente! No se podrá recuperar.",
          ]}
        />

        <StepCheckbox checked={checked} onToggle={onToggle} label="Generé y guardé mi token de acceso permanente" />
      </CardContent>
    </Card>
  )
}

// --- Step 5: Configurar Webhook en Meta ---
function Step5({ checked, onToggle }: StepCheckProps) {
  const webhookVerifyToken = process.env.NEXT_PUBLIC_WHATSAPP_WEBHOOK_VERIFY_TOKEN
    || "PrismaSaaS2026_Verificacion!"
  
  const evolutionUrl = process.env.NEXT_PUBLIC_EVOLUTION_API_URL
    ? `${process.env.NEXT_PUBLIC_EVOLUTION_API_URL}/webhook/whatsapp`
    : "https://vevolutionapiv.vakdor.com/webhook/whatsapp"

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <span className="text-accent">05.</span> Configurar Webhook en Meta
        </CardTitle>
        <CardDescription className="text-base">
          Este paso es fundamental: le daremos a Meta la &quot;dirección&quot; de PRISMA para que los mensajes de tus clientes lleguen aquí.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Alert className="mb-6 border-blue-500/30 bg-blue-500/5">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertTitle className="text-blue-600 dark:text-blue-400 font-bold">
            Guía paso a paso (Sin tecnicismos)
          </AlertTitle>
          <AlertDescription className="text-blue-600/80 dark:text-blue-400/80 space-y-2 mt-2">
            <p>1. Entrá al panel de Meta Developers (el botón del Paso 1).</p>
            <p>2. En el menú izquierdo, hacé clic en <strong>WhatsApp</strong> y luego en <strong>Configuración</strong>.</p>
            <p>3. Buscá la sección que dice <strong>Webhooks</strong> y hacé clic en el botón <strong>Editar</strong>.</p>
            <p>4. Copiá y pegá los dos valores que verás aquí abajo en los campos correspondientes de Meta.</p>
            <p>5. Una vez guardado, hacé clic en el botón <strong>Administrar</strong> cerca de Webhooks, buscá la palabra <strong>messages</strong> y hacé clic en <strong>Suscribirse</strong>. ¡Sin esto no funciona!</p>
          </AlertDescription>
        </Alert>

        <div className="space-y-4 p-5 rounded-2xl border bg-muted/20 mb-6">
          <CopyButton 
            label="URL de devolución de llamada (Callback URL)" 
            value={evolutionUrl} 
          />
          <CopyButton 
            label="Token de verificación (Verify Token)" 
            value={webhookVerifyToken} 
          />
        </div>

        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-600/80 dark:text-amber-400/80 font-medium text-xs">
            ⚠️ Si Meta te da error al verificar, asegurate de no haber copiado espacios en blanco al principio o al final de los textos.
          </AlertDescription>
        </Alert>

        <StepCheckbox checked={checked} onToggle={onToggle} label='Ya configuré el webhook en Meta y activé la suscripción de "messages"' />
      </CardContent>
    </Card>
  )
}

// --- Step 6: Credenciales + Connect ---
interface Step6Props {
  token: string
  setToken: (v: string) => void
  phoneNumberId: string
  setPhoneNumberId: (v: string) => void
  businessId: string
  setBusinessId: (v: string) => void
  showToken: boolean
  setShowToken: (v: boolean) => void
  isConnecting: boolean
  isPolling: boolean
  connectionError: string
  onConnect: () => void
}

function Step6({
  token, setToken,
  phoneNumberId, setPhoneNumberId,
  businessId, setBusinessId,
  showToken, setShowToken,
  isConnecting, isPolling,
  connectionError, onConnect,
}: Step6Props) {
  const isValid = token.length >= 20 && /^\d{10,16}$/.test(phoneNumberId) && /^\d{8,16}$/.test(businessId)

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <span className="text-accent">06.</span> Credenciales
        </CardTitle>
        <CardDescription className="text-base">
          Ingresá los datos de tu app para conectar WhatsApp a PRISMA.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 space-y-5">
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
            <p className="font-semibold text-foreground mb-1">¿Dónde encuentro estos datos?</p>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Phone Number ID:</strong> En el panel de Meta, ve a WhatsApp → Configuración de la API. Está en la sección &quot;Envía y recibe mensajes&quot;.</li>
              <li><strong>Business ID:</strong> En la misma pantalla de arriba, lo verás debajo del nombre de tu cuenta de WhatsApp Business.</li>
              <li><strong>Token:</strong> Es el código largo que generaste en el <strong>Paso 4</strong>.</li>
            </ul>
          </div>
        </div>

        {/* Token */}
        <div className="space-y-2">
          <label htmlFor="token" className="text-sm font-semibold">Token de acceso permanente</label>
          <div className="relative">
            <Input
              id="token"
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAxxxxxxxx..."
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {token.length > 0 && token.length < 20 && (
            <p className="text-xs text-destructive">Mínimo 20 caracteres</p>
          )}
        </div>

        {/* Phone Number ID */}
        <div className="space-y-2">
          <label htmlFor="phoneNumberId" className="text-sm font-semibold">Phone Number ID</label>
          <Input
            id="phoneNumberId"
            type="text"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value.replace(/\D/g, ""))}
            placeholder="Ej: 1234567890123"
            className="font-mono text-sm"
            maxLength={16}
          />
          {phoneNumberId.length > 0 && !/^\d{10,16}$/.test(phoneNumberId) && (
            <p className="text-xs text-destructive">Debe ser entre 10 y 16 dígitos</p>
          )}
        </div>

        {/* Business ID */}
        <div className="space-y-2">
          <label htmlFor="businessId" className="text-sm font-semibold">Business ID</label>
          <Input
            id="businessId"
            type="text"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value.replace(/\D/g, ""))}
            placeholder="Ej: 123456789"
            className="font-mono text-sm"
            maxLength={16}
          />
          {businessId.length > 0 && !/^\d{8,16}$/.test(businessId) && (
            <p className="text-xs text-destructive">Debe ser entre 8 y 16 dígitos</p>
          )}
        </div>

        {/* Error */}
        {connectionError && (
          <Alert variant="destructive" className="border-destructive/30">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{connectionError}</AlertDescription>
          </Alert>
        )}

        {/* Connect button */}
        <Button
          onClick={onConnect}
          disabled={!isValid || isConnecting || isPolling}
          className="w-full bg-accent hover:bg-accent/90 text-white h-12 text-base font-bold"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Conectando...
            </>
          ) : isPolling ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Verificando conexión...
            </>
          ) : (
            <>
              <MessageSquare className="w-5 h-5 mr-2" />
              Conectar WhatsApp
            </>
          )}
        </Button>

        {/* Polling badge */}
        {isPolling && (
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20">
              <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
              Conectando... esperá unos segundos
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
