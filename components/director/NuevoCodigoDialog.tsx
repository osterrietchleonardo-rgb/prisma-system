"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CountryCode } from "libphonenumber-js";
import { VerifiedPhoneField, type VerifiedPhoneValue } from "@/components/shared/VerifiedPhoneField";
import { validarNuevoCodigo, normalizarEmail } from "@/lib/invites/reglas";
import { generateAgencyInvite } from "@/lib/queries/director";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  /** Lo fija la pantalla que abre el diálogo. Acá NO se elige ni se muestra. */
  role: "asesor" | "director";
  /**
   * Se llama después de generar. Lleva también el nombre del invitado para que
   * la pantalla pueda mostrar "de quién es" el código recién generado sin
   * tener que volver a consultarlo.
   */
  onCreated: (code: string, invite: { nombre: string }) => void;
}

const blockPaste = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

const PHONE_VACIO: VerifiedPhoneValue = { phone: "", phoneConfirm: "", country: "AR" as CountryCode };

export function NuevoCodigoDialog({ open, onOpenChange, agencyId, role, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phone, setPhone] = useState<VerifiedPhoneValue>(PHONE_VACIO);
  const [guardando, setGuardando] = useState(false);

  const validacion = validarNuevoCodigo({
    nombre,
    email,
    emailConfirm,
    phone: phone.phone,
    phoneConfirm: phone.phoneConfirm,
    country: phone.country,
  });

  const emailCoincide =
    normalizarEmail(email) !== "" && normalizarEmail(email) === normalizarEmail(emailConfirm);
  const escribioConfirmacion = emailConfirm.trim() !== "";

  const limpiar = () => {
    setNombre("");
    setEmail("");
    setEmailConfirm("");
    setPhone(PHONE_VACIO);
  };

  const confirmar = async () => {
    if (!validacion.ok) {
      toast.error(validacion.error);
      return;
    }
    try {
      setGuardando(true);
      const invite = await generateAgencyInvite(
        agencyId,
        role,
        validacion.datos.nombre,
        validacion.datos.phone,
        validacion.datos.email
      );
      toast.success(`Código generado para ${validacion.datos.nombre}`);
      const nombreGenerado = validacion.datos.nombre;
      limpiar();
      onOpenChange(false);
      onCreated(invite.code, { nombre: nombreGenerado });
    } catch (e: unknown) {
      // El mensaje real importa: puede ser "ese email ya tiene cuenta".
      toast.error(e instanceof Error ? e.message : "No se pudo generar el código");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) limpiar();
        onOpenChange(v);
      }}
    >
      <DialogContent className="bg-card border-accent/20 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Invitar a un {role === "director" ? "director" : "asesor"}
          </DialogTitle>
          <DialogDescription>
            El código solo va a servirle a la persona que uses acá. Con estos datos ya queda
            armado su perfil el día que entre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nc-nombre">Nombre y apellido</Label>
            <Input
              id="nc-nombre"
              placeholder="Juan Pérez"
              value={nombre}
              disabled={guardando}
              onChange={(e) => setNombre(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Así va a figurar en tu equipo. No lo puede cambiar al registrarse.
            </p>
          </div>

          <VerifiedPhoneField value={phone} onChange={setPhone} disabled={guardando} />

          <div className="space-y-2">
            <Label htmlFor="nc-email">Email</Label>
            <Input
              id="nc-email"
              type="email"
              placeholder="nombre@ejemplo.com"
              value={email}
              disabled={guardando}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Es la llave del código: solo se va a poder registrar con este email.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nc-email-confirm">Repetí el email</Label>
            <Input
              id="nc-email-confirm"
              type="email"
              placeholder="Escribilo de nuevo"
              value={emailConfirm}
              disabled={guardando}
              onPaste={blockPaste}
              onDrop={blockPaste}
              onChange={(e) => setEmailConfirm(e.target.value)}
            />
            {escribioConfirmacion && (
              <p
                className={`text-xs flex items-center gap-1 ${
                  emailCoincide ? "text-green-600" : "text-destructive"
                }`}
              >
                {emailCoincide ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {emailCoincide ? "Coinciden" : "Todavía no coinciden"}
              </p>
            )}
          </div>

          {!validacion.ok && (nombre || email || phone.phone) ? (
            <p className="text-xs text-muted-foreground">{validacion.error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              // No alcanza con onOpenChange(false): ese wrapper de Dialog (más abajo)
              // solo corre en los cierres que dispara Radix (Escape, click afuera).
              // Este botón llama directo a la prop del padre, así que si no limpiamos
              // acá también, en una pantalla donde el diálogo NO se desmonta al
              // cerrarse (agencyId siempre truthy) los datos del invitado anterior
              // sobreviven y quedan precargados en la próxima invitación.
              limpiar();
              onOpenChange(false);
            }}
            disabled={guardando}
          >
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!validacion.ok || guardando} className="bg-accent gap-2">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Generar código
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
