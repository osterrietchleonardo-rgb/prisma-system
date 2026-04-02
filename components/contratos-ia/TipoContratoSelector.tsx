"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Home, Store, FileCheck, Bookmark, Loader2 } from "lucide-react"
import { TIPO_CONTRATO_LABELS, TIPO_CONTRATO_DESCRIPTIONS } from "@/types/contratos"
import type { TipoContrato, ContractTemplate } from "@/types/contratos"
import { CAMPOS_POR_TIPO } from "@/lib/contratos/placeholder-helpers"
import {
  TEMPLATE_LOCACION_HABITACIONAL,
  TEMPLATE_LOCACION_COMERCIAL,
  TEMPLATE_BOLETO_COMPRAVENTA,
  TEMPLATE_RESERVA_VENTA,
} from "@/lib/contratos/default-templates"

const TIPO_ICONS: Record<TipoContrato, React.ElementType> = {
  locacion_habitacional: Home,
  locacion_comercial: Store,
  boleto_compraventa: FileCheck,
  reserva_venta: Bookmark,
}

const DEFAULT_TEMPLATES: Record<TipoContrato, string> = {
  locacion_habitacional: TEMPLATE_LOCACION_HABITACIONAL,
  locacion_comercial: TEMPLATE_LOCACION_COMERCIAL,
  boleto_compraventa: TEMPLATE_BOLETO_COMPRAVENTA,
  reserva_venta: TEMPLATE_RESERVA_VENTA,
}

interface TipoContratoSelectorProps {
  onSelect: (tipo: TipoContrato, template: ContractTemplate) => void
}

const TIPOS: TipoContrato[] = [
  "locacion_habitacional",
  "locacion_comercial",
  "boleto_compraventa",
  "reserva_venta",
]

export function TipoContratoSelector({ onSelect }: TipoContratoSelectorProps) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch("/api/contract-templates")
        if (res.ok) {
          const data = await res.json()
          setTemplates(data)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    loadTemplates()
  }, [])

  const handleSelect = (tipo: TipoContrato) => {
    // Find active template for this type, or use system default, or fallback
    const activeTemplate = templates.find(t => t.tipo === tipo && t.is_active)
      || templates.find(t => t.tipo === tipo && t.is_system_default)
      || templates.find(t => t.tipo === tipo)

    const template: ContractTemplate = activeTemplate || {
      id: `fallback-${tipo}`,
      agency_id: null,
      nombre: TIPO_CONTRATO_LABELS[tipo],
      tipo,
      template_body: DEFAULT_TEMPLATES[tipo],
      campos_schema: CAMPOS_POR_TIPO[tipo],
      version: 1,
      is_active: true,
      is_system_default: true,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Ensure campos_schema is populated
    if (!template.campos_schema || template.campos_schema.length === 0) {
      template.campos_schema = CAMPOS_POR_TIPO[tipo]
    }

    onSelect(tipo, template)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {TIPOS.map(tipo => {
        const Icon = TIPO_ICONS[tipo]
        return (
          <Card
            key={tipo}
            className="group relative overflow-hidden border-border hover:border-accent/50 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-accent/5"
            onClick={() => handleSelect(tipo)}
          >
            {/* Accent gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <CardHeader className="relative">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{TIPO_CONTRATO_LABELS[tipo]}</CardTitle>
                  <CardDescription className="mt-1">{TIPO_CONTRATO_DESCRIPTIONS[tipo]}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <Button
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelect(tipo)
                }}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Crear desde plantilla
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
