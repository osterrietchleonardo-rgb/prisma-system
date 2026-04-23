"use client"

import { useState } from "react"
import {
  Target, Megaphone, Filter, RefreshCcw, BarChart2,
  ChevronDown, Lightbulb, CheckCircle2, AlertTriangle,
  TrendingUp, Users, DollarSign, Star
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Data ──────────────────────────────────────────────────────────────────────

const phases = [
  {
    id: 1,
    icon: Target,
    color: "from-blue-500/20 to-blue-600/10",
    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    accentColor: "text-blue-400",
    borderColor: "border-blue-500/40",
    budgetTag: "75% del presupuesto",
    budgetColor: "bg-blue-500/20 text-blue-300",
    title: "Preparando el Terreno",
    subtitle: "Tráfico Frío",
    description:
      "Llegá a personas que todavía no te conocen pero tienen una necesidad inmobiliaria real.",
    steps: [
      {
        title: "Configuración Inicial",
        items: [
          "Creá una campaña de **Clientes Potenciales** en el Administrador de Anuncios.",
          "Elegí siempre **Configuración Manual**. No dejes que Meta decida todo desde el principio —te va a traer cantidad, no calidad.",
        ],
      },
      {
        title: "A quién le hablamos",
        items: [
          "Segmentá por ciudad y rango etario (ej. **30 a 65 años**).",
          'Usá "Opciones de público originales" con 3–4 intereses clave: *Inversiones inmobiliarias, Real Estate, Propiedades de lujo*.',
          'Marcá **"Segmentación detallada Advantage"** para que Meta expanda inteligentemente tu alcance más allá de las etiquetas exactas.',
        ],
      },
    ],
  },
  {
    id: 2,
    icon: Megaphone,
    color: "from-purple-500/20 to-purple-600/10",
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    accentColor: "text-purple-400",
    borderColor: "border-purple-500/40",
    budgetTag: null,
    budgetColor: "",
    title: "El Anuncio",
    subtitle: "Tu Vidriera",
    description:
      "En inmuebles, la imagen lo es todo. Un anuncio barato atrae clientes que buscan lo barato.",
    steps: [
      {
        title: "Contenido que convierte",
        items: [
          'Usá **videos recorriendo propiedades** (Reels) o vos hablando a cámara sobre un problema real (*"3 errores al tasar tu casa"*).',
          '⚠️ Cuando subas el video, Meta va a ofrecerte música y filtros automáticos. **Desactivá todo**. Vos elegís el audio —no la IA de Meta.',
          'Usá el botón **"Más información"**: es profesional y genera curiosidad sin presionar.',
        ],
      },
    ],
    alert: {
      icon: AlertTriangle,
      type: "warning",
      text: "Nunca dejes que la IA de Meta elija la música. Un tema de trap en un semipiso de Recoleta destruye tu posicionamiento de marca.",
    },
  },
  {
    id: 3,
    icon: Filter,
    color: "from-amber-500/20 to-amber-600/10",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    accentColor: "text-amber-400",
    borderColor: "border-amber-500/40",
    budgetTag: null,
    budgetColor: "",
    title: 'El Formulario "Filtro de Oro"',
    subtitle: "Ultra-Calificación",
    description:
      "Acá se separa al curioso del cliente. No uses el formulario por defecto.",
    steps: [
      {
        title: "Configuración esencial",
        items: [
          'Tipo de formulario: **"Mayor grado de intención"** — obliga a confirmar el envío con un deslizador. Elimina los toques accidentales.',
          "Agregá **2 o 3 preguntas de opción múltiple** para que cada lead tenga valor real.",
        ],
      },
    ],
    dualQuestions: {
      vendedores: {
        title: "Si buscás Captaciones (Vendedores)",
        icon: DollarSign,
        questions: [
          "¿En qué zona se encuentra tu propiedad?",
          "¿Cuál es tu urgencia para vender? (Menos de 3 meses / Consulto / Urgente)",
          "¿La propiedad ya está tasada? (Sí / No / Necesito tasación)",
        ],
      },
      compradores: {
        title: "Si buscás Compradores/Inversores",
        icon: Users,
        questions: [
          "¿Cuál es tu presupuesto aproximado de inversión? (con rangos reales)",
          "¿Contás con el capital o necesitás financiación/vender antes?",
          "¿Buscás para vivir o como inversión de renta?",
        ],
      },
    },
    extraNote:
      "Configurá **Lógica Condicional**: si alguien no califica, el formulario le agradece sin contarlo como lead exitoso. Así la IA aprende a no buscar ese perfil.",
  },
  {
    id: 4,
    icon: RefreshCcw,
    color: "from-green-500/20 to-green-600/10",
    badge: "bg-green-500/20 text-green-400 border-green-500/30",
    accentColor: "text-green-400",
    borderColor: "border-green-500/40",
    budgetTag: "25% del presupuesto",
    budgetColor: "bg-green-500/20 text-green-300",
    title: "Retargeting",
    subtitle: "No pierdas a los interesados",
    description:
      "Para quienes vieron tu video o empezaron el formulario pero no terminaron de dejar sus datos.",
    steps: [
      {
        title: "Mensaje de re-enganche",
        items: [
          "Creá una campaña nueva enfocada en esta audiencia cálida.",
          '"Vimos que te interesó nuestra propuesta. ¿Tenés alguna duda técnica sobre la zona o la rentabilidad? Dejanos tu contacto y te asesoramos personalmente."',
          "**Bajá la guardia**: hablales como aliados, no como vendedores.",
        ],
      },
    ],
  },
  {
    id: 5,
    icon: BarChart2,
    color: "from-rose-500/20 to-rose-600/10",
    badge: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    accentColor: "text-rose-400",
    borderColor: "border-rose-500/40",
    budgetTag: null,
    budgetColor: "",
    title: "Medición y Seguimiento",
    subtitle: 'La "Regla de Oro"',
    description:
      "De nada sirve la estrategia si no medís. Esta fase convierte datos en dinero.",
    steps: [
      {
        title: "Las tres reglas que no podés saltarte",
        items: [
          "🔥 **Velocidad de respuesta:** Un lead inmobiliario se enfría en **5 minutos**. Llamalo apenas llegue el mail.",
          "📊 **Mirá el Costo por Lead Calificado:** Un lead a $5 USD no es caro si de 10, dos son tasaciones de $200.000 USD.",
          "🧹 **Limpieza de datos:** Si entran muchos números falsos, **agregá una pregunta más**. Más fricción = más intención.",
        ],
      },
    ],
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
    }
    if (p.startsWith("*") && p.endsWith("*")) {
      return <em key={i} className="italic text-foreground/80">{p.slice(1, -1)}</em>
    }
    return <span key={i}>{p}</span>
  })
}

// ─── Phase Card ────────────────────────────────────────────────────────────────

function PhaseCard({ phase, index }: { phase: (typeof phases)[0]; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const Icon = phase.icon

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300",
        phase.borderColor,
        open ? "bg-gradient-to-br " + phase.color : "bg-card hover:bg-card/80"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-4 p-5 text-left"
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br", phase.color)}>
          <Icon className={cn("w-5 h-5", phase.accentColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", phase.badge)}>
              FASE {phase.id}
            </span>
            {phase.budgetTag && (
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", phase.budgetColor)}>
                {phase.budgetTag}
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-foreground mt-1">{phase.title}</h3>
          <p className="text-xs text-muted-foreground">{phase.subtitle}</p>
        </div>
        <div className={cn("shrink-0 mt-1 transition-transform duration-200", open && "rotate-180")}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-sm text-muted-foreground">{phase.description}</p>

          {phase.steps.map((step, si) => (
            <div key={si} className="space-y-2">
              <p className={cn("text-xs font-semibold uppercase tracking-wider", phase.accentColor)}>
                {step.title}
              </p>
              <ul className="space-y-2">
                {step.items.map((item, ii) => (
                  <li key={ii} className="flex gap-2 text-sm text-foreground/80 leading-relaxed">
                    <CheckCircle2 className={cn("w-4 h-4 shrink-0 mt-0.5", phase.accentColor)} />
                    <span>{renderMarkdown(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Alert */}
          {"alert" in phase && phase.alert && (
            <div className="flex gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <phase.alert.icon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">{phase.alert.text}</p>
            </div>
          )}

          {/* Dual questions (Fase 3) */}
          {"dualQuestions" in phase && phase.dualQuestions && (
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              {Object.entries(phase.dualQuestions).map(([key, section]) => (
                <div key={key} className="rounded-xl bg-background/40 border border-white/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <section.icon className="w-4 h-4 text-amber-400" />
                    <p className="text-xs font-semibold text-amber-300">{section.title}</p>
                  </div>
                  <ul className="space-y-1.5">
                    {section.questions.map((q, qi) => (
                      <li key={qi} className="text-xs text-foreground/70 leading-relaxed flex gap-2">
                        <span className="text-amber-400 font-bold shrink-0">·</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Extra note (Fase 3) */}
          {"extraNote" in phase && phase.extraNote && (
            <div className="flex gap-2 text-xs text-foreground/70 bg-background/30 rounded-lg p-3 border border-white/5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{renderMarkdown(phase.extraNote)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AdGuide() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-12">

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent p-6 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/5 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Guía Maestra 2026</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-foreground leading-tight mb-2">
            Captación de Leads{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">
              de Alta Calidad
            </span>
          </h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-xl leading-relaxed">
            El objetivo no es llenarte de consultas por precio que no llegan a nada. Es construir una
            base de datos que sea el{" "}
            <span className="text-foreground font-medium">motor real de tus ventas</span>: personas que
            quieren tasar, vender o invertir.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            {[
              { icon: TrendingUp, label: "5 Fases probadas" },
              { icon: Target, label: "Segmentación híbrida" },
              { icon: Filter, label: "Filtro de calificación" },
              { icon: BarChart2, label: "Medición ROI" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                <Icon className="w-3 h-3" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Hoja de ruta
        </p>
        {phases.map((phase, index) => (
          <PhaseCard key={phase.id} phase={phase} index={index} />
        ))}
      </div>

      {/* Final tip */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-6">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <Lightbulb className="w-5 h-5 text-amber-400 fill-amber-400/20" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-300 mb-1">Consejo Final</p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              No busques <strong className="text-foreground">volumen</strong>. Buscá <strong className="text-foreground">calidad</strong>.{" "}
              Es preferible cerrar con 5 personas calificadas por día que
              tener 50 que no saben por qué dejaron sus datos. La IA de Meta en 2026 es una fiera
              buscando gente —pero <em>vos</em> tenés que decirle exactamente qué tipo de{" "}
              <span className="text-amber-300">&quot;fiera&quot;</span> querés en tu inmobiliaria.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
