"use client";

import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Check, AlertCircle } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import {
  normalizePhoneE164,
  formatPhoneInternational,
  getPhoneCountries,
} from "@/lib/whatsapp/phone";

export interface VerifiedPhoneValue {
  phone: string;
  phoneConfirm: string;
  country: CountryCode;
}

interface Props {
  value: VerifiedPhoneValue;
  onChange: (v: VerifiedPhoneValue) => void;
  disabled?: boolean;
}

// El celular se escribe dos veces y no se puede pegar. Es la misma regla que
// usa el alta manual de contactos: un número mal tipeado no se nota hasta que
// alguien intenta llamar y no atiende nadie.
const blockPaste = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

export function VerifiedPhoneField({ value, onChange, disabled }: Props) {
  const countries = useMemo(() => getPhoneCountries("es"), []);
  const countryOptions = useMemo(
    () =>
      countries.map((c) => ({
        value: c.iso,
        label: `${c.flag} ${c.name}`,
        description: `+${c.callingCode}`,
      })),
    [countries]
  );

  // Se comparan los números normalizados, no el texto: "11 2345-6789" y
  // "011 15 2345 6789" son el mismo celular.
  const e164 = normalizePhoneE164(value.phone, value.country);
  const e164Confirm = normalizePhoneE164(value.phoneConfirm, value.country);
  const preview = formatPhoneInternational(value.phone, value.country);
  const coincide = !!e164 && e164 === e164Confirm;
  const escribioConfirmacion = value.phoneConfirm.trim() !== "";

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="vpf-country">País</Label>
        {/* OJO: la prop se llama onChange, no onValueChange. Verificado en
            components/ui/searchable-select.tsx:19. */}
        <SearchableSelect
          options={countryOptions}
          value={value.country}
          onChange={(iso) => onChange({ ...value, country: iso as CountryCode })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vpf-phone">Celular</Label>
        <Input
          id="vpf-phone"
          inputMode="tel"
          placeholder="11 2345-6789"
          value={value.phone}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
        {preview && (
          <p className="text-xs text-muted-foreground">Se va a guardar como {preview}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vpf-phone-confirm">Repetí el celular</Label>
        <Input
          id="vpf-phone-confirm"
          inputMode="tel"
          placeholder="Escribilo de nuevo"
          value={value.phoneConfirm}
          disabled={disabled}
          onPaste={blockPaste}
          onDrop={blockPaste}
          onChange={(e) => onChange({ ...value, phoneConfirm: e.target.value })}
        />
        {escribioConfirmacion && (
          <p
            className={`text-xs flex items-center gap-1 ${
              coincide ? "text-green-600" : "text-destructive"
            }`}
          >
            {coincide ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {coincide ? "Coinciden" : "Todavía no coinciden"}
          </p>
        )}
      </div>
    </div>
  );
}
