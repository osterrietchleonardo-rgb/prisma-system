"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { User, Phone, Mail, Tag, Check, AlertCircle, ShieldCheck } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import {
  normalizePhoneE164,
  formatPhoneInternational,
  getPhoneCountries,
} from "@/lib/whatsapp/phone";

export interface ManualContactData {
  name: string;
  /** Teléfono ya normalizado a E.164 sin "+" (listo para WhatsApp/Meta), ej. 5491123456789 */
  phone: string;
  email: string;
  tags: string;
  /** true sólo cuando todo coincide, los formatos son válidos y se certificaron los datos */
  isValid: boolean;
}

interface Props {
  onChange: (data: ManualContactData) => void;
  /** Clases extra para los inputs, para adaptarse al estilo del formulario host */
  inputClassName?: string;
}

// Bloquea pegar / arrastrar texto en los campos de verificación
const blockPaste = (e: React.ClipboardEvent | React.DragEvent) => {
  e.preventDefault();
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ManualContactFields({ onChange, inputClassName }: Props) {
  const [name, setName] = useState("");
  const [nameConfirm, setNameConfirm] = useState("");
  const [country, setCountry] = useState<CountryCode>("AR");
  const [phone, setPhone] = useState("");
  const [phoneConfirm, setPhoneConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [tags, setTags] = useState("");
  const [certified, setCertified] = useState(false);

  // Listado de países para el selector (memoizado, se calcula una sola vez)
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

  // Teléfono: normalizamos ambos a E.164 (sin "+") y comparamos el resultado, no el texto.
  // Así "11 1234-5678" y "011 15 1234 5678" se consideran iguales (y ambos válidos).
  const phoneE164 = normalizePhoneE164(phone, country);
  const phoneConfirmE164 = normalizePhoneE164(phoneConfirm, country);
  const phonePreview = formatPhoneInternational(phone, country);

  // Normalizaciones para comparar
  const nName = name.trim().toLowerCase();
  const nEmail = email.trim().toLowerCase();

  const nameMatch = nName !== "" && nName === nameConfirm.trim().toLowerCase();
  const phoneMatch = !!phoneE164 && phoneE164 === phoneConfirmE164;
  const emailMatch = nEmail !== "" && nEmail === emailConfirm.trim().toLowerCase();

  const phoneFormatOk = !!phoneE164;
  const emailFormatOk = emailRegex.test(email.trim());

  const isValid =
    nameMatch &&
    phoneMatch &&
    phoneFormatOk &&
    emailMatch &&
    emailFormatOk &&
    certified;

  // Reportar hacia arriba sin provocar loops (ref con el último onChange)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current({
      name: name.trim(),
      phone: phoneE164 || "", // ya en E.164 sin "+", listo para Meta
      email: email.trim(),
      tags: tags.trim(),
      isValid,
    });
  }, [name, phoneE164, email, tags, isValid]);

  // Indicador visual de coincidencia bajo cada campo de verificación
  const MatchHint = ({
    show,
    match,
    okLabel,
    errLabel,
  }: {
    show: boolean;
    match: boolean;
    okLabel: string;
    errLabel: string;
  }) => {
    if (!show) return null;
    return match ? (
      <p className="flex items-center gap-1 text-[11px] font-medium text-green-500">
        <Check className="w-3 h-3" /> {okLabel}
      </p>
    ) : (
      <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
        <AlertCircle className="w-3 h-3" /> {errLabel}
      </p>
    );
  };

  return (
    <div className="space-y-5">
      {/* NOMBRE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 opacity-60" /> Nombre Completo *
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Juan Pérez"
            className={inputClassName}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 opacity-60" /> Verificar Nombre *
          </Label>
          <Input
            value={nameConfirm}
            onChange={(e) => setNameConfirm(e.target.value)}
            onPaste={blockPaste}
            onDrop={blockPaste}
            placeholder="Reescribí el nombre"
            className={inputClassName}
            autoComplete="off"
            required
          />
          <MatchHint
            show={nameConfirm.trim() !== ""}
            match={nameMatch}
            okLabel="El nombre coincide"
            errLabel="El nombre no coincide"
          />
        </div>
      </div>

      {/* CELULAR */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 opacity-60" /> País del celular *
        </Label>
        <SearchableSelect
          options={countryOptions}
          value={country}
          onChange={(v) => setCountry(v as CountryCode)}
          placeholder="Elegí el país..."
          emptyMessage="No se encontró el país."
        />
        <p className="text-[10px] text-muted-foreground leading-tight">
          Elegí el país y escribí el número como lo marcás normalmente. El sistema lo
          convierte solo al formato que pide WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 opacity-60" /> Celular *
          </Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: 11 2345-6789"
            className={inputClassName}
            inputMode="tel"
            autoComplete="off"
            required
          />
          {phone.trim() !== "" &&
            (phonePreview ? (
              <p className="flex items-center gap-1 text-[11px] font-medium text-green-500">
                <Check className="w-3 h-3" /> Se guardará como {phonePreview}
              </p>
            ) : (
              <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                <AlertCircle className="w-3 h-3" /> Número inválido para el país elegido
              </p>
            ))}
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 opacity-60" /> Verificar Celular *
          </Label>
          <Input
            value={phoneConfirm}
            onChange={(e) => setPhoneConfirm(e.target.value)}
            onPaste={blockPaste}
            onDrop={blockPaste}
            placeholder="Reescribí el celular"
            className={inputClassName}
            inputMode="tel"
            autoComplete="off"
            required
          />
          <MatchHint
            show={phoneConfirm.trim() !== ""}
            match={phoneMatch && phoneFormatOk}
            okLabel="El celular coincide"
            errLabel={
              phoneConfirm.trim() !== "" && !phoneConfirmE164
                ? "El número de verificación es inválido"
                : "El celular no coincide"
            }
          />
        </div>
      </div>

      {/* EMAIL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 opacity-60" /> Email *
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="juan@ejemplo.com"
            className={inputClassName}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 opacity-60" /> Verificar Email *
          </Label>
          <Input
            type="email"
            value={emailConfirm}
            onChange={(e) => setEmailConfirm(e.target.value)}
            onPaste={blockPaste}
            onDrop={blockPaste}
            placeholder="Reescribí el email"
            className={inputClassName}
            autoComplete="off"
            required
          />
          <MatchHint
            show={emailConfirm.trim() !== ""}
            match={emailMatch && emailFormatOk}
            okLabel="El email coincide"
            errLabel={
              emailConfirm.trim() !== "" && !emailFormatOk
                ? "El email no tiene un formato válido"
                : "El email no coincide"
            }
          />
        </div>
      </div>

      {/* ETIQUETA */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 opacity-60" /> Etiqueta (Opcional)
        </Label>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Ej: Inversor, Referido Carlos"
          className={inputClassName}
          autoComplete="off"
        />
        <p className="text-[10px] text-muted-foreground">Separadas por comas.</p>
      </div>

      {/* CERTIFICACIÓN */}
      <label className="flex items-start gap-3 p-3 rounded-xl border border-accent/20 bg-accent/5 cursor-pointer select-none">
        <Checkbox
          checked={certified}
          onCheckedChange={(v) => setCertified(v === true)}
          className="mt-0.5"
        />
        <span className="text-xs leading-snug text-muted-foreground">
          Declaro bajo mi responsabilidad que los datos de este cliente son{" "}
          <strong className="text-foreground">reales, veraces y fueron obtenidos legítimamente</strong>,
          y que cuento con su consentimiento para registrarlo. Entiendo que la carga de datos
          falsos o de terceros sin autorización es una falta grave.
        </span>
      </label>
    </div>
  );
}
