"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CampoFormulario } from "@/types/contratos"

interface CampoFormularioDinamicoProps {
  campo: CampoFormulario
  value: string | number | undefined
  onChange: (value: string | number) => void
  error?: string
}

export function CampoFormularioDinamico({ campo, value, onChange, error }: CampoFormularioDinamicoProps) {
  const stringValue = value !== undefined && value !== null ? String(value) : ""

  const wrapperClass = campo.tipo === "textarea" ? "col-span-1 md:col-span-2" : ""

  return (
    <div className={`space-y-2 ${wrapperClass}`}>
      <Label htmlFor={campo.id} className="text-sm font-medium">
        {campo.label}
        {campo.requerido && <span className="text-destructive ml-1">*</span>}
      </Label>

      {campo.tipo === "select" ? (
        <Select value={stringValue} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={campo.id} className={error ? "border-destructive" : ""}>
            <SelectValue placeholder={campo.placeholder || "Seleccionar..."} />
          </SelectTrigger>
          <SelectContent>
            {(campo.opciones || []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : campo.tipo === "textarea" ? (
        <Textarea
          id={campo.id}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder || ""}
          className={`min-h-[100px] ${error ? "border-destructive" : ""}`}
        />
      ) : campo.tipo === "date" ? (
        <Input
          id={campo.id}
          type="date"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className={error ? "border-destructive" : ""}
        />
      ) : campo.tipo === "number" || campo.tipo === "currency" ? (
        <div className="relative">
          {campo.tipo === "currency" && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          )}
          <Input
            id={campo.id}
            type="number"
            value={stringValue}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
            placeholder={campo.placeholder || "0"}
            className={`${campo.tipo === "currency" ? "pl-7" : ""} ${error ? "border-destructive" : ""}`}
            min={campo.validacion?.min}
            max={campo.validacion?.max}
          />
        </div>
      ) : campo.tipo === "email" ? (
        <Input
          id={campo.id}
          type="email"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder || "ejemplo@email.com"}
          className={error ? "border-destructive" : ""}
        />
      ) : campo.tipo === "phone" ? (
        <Input
          id={campo.id}
          type="tel"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder || "+54 11 1234-5678"}
          className={error ? "border-destructive" : ""}
        />
      ) : campo.tipo === "dni" ? (
        <Input
          id={campo.id}
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder || "12.345.678 o 20-12345678-9"}
          className={error ? "border-destructive" : ""}
        />
      ) : (
        <Input
          id={campo.id}
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder || ""}
          className={error ? "border-destructive" : ""}
        />
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
