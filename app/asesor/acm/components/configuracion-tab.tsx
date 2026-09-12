"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Palette, Save } from "lucide-react";
import { normalizarMaterial, type AcmMaterial } from "@/lib/acm/material";
import type { VarianteLogo } from "@/lib/marketing-ia/logo-variante";
import { ConfigMaterial } from "./config-material";

/** La marca viaja para MOSTRARLA. Se edita en Marketing IA, no acá. */
interface Marca {
  colors: string[];
  logo_url: string | null;
  /** Cuál de los dos logos le tocó a la ficha del ACM, según los toggles de Marketing IA. */
  logo_variante?: VarianteLogo;
  /** Si la agencia cargó las dos versiones. Con una sola no hay nada que aclarar. */
  dos_logos?: boolean;
  legal_notice: string;
}

export function ConfiguracionTab() {
  const [material, setMaterial] = useState<AcmMaterial>(normalizarMaterial(undefined));
  const [marca, setMarca] = useState<Marca>({ colors: [], logo_url: null, legal_notice: "" });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/marketing-ia/acm-material");
        if (res.ok) {
          const data = await res.json();
          setMaterial(normalizarMaterial(data.material));
          setMarca(data.marca);
        }
      } catch (e) {
        console.error("No se pudo cargar la configuración del ACM", e);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/marketing-ia/acm-material", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      toast.success("Configuración guardada. Los próximos ACM ya salen con esto.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ── Lo que viene de Marketing IA: se muestra, no se edita ── */}
      <div className="rounded-xl border border-accent/10 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">La imagen de tu ficha</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Los colores, el logo y el aviso legal de la ficha del ACM salen de{" "}
          <strong>Marketing IA → Configuración</strong>. Acá se muestran para que sepas cómo se
          va a ver; para cambiarlos, entrá ahí.
        </p>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Colores:</span>
            {marca.colors.length > 0 ? (
              marca.colors.map((c) => (
                <span
                  key={c}
                  className="w-5 h-5 rounded border border-black/10"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))
            ) : (
              <span className="text-xs italic text-muted-foreground">sin definir</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Logo:</span>
            {marca.logo_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={marca.logo_url} alt="Logo de la agencia" className="h-6 object-contain" />
                {marca.dos_logos && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    versión {marca.logo_variante === "lujo" ? "lujo" : "estándar"}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs italic text-muted-foreground">sin cargar</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Aviso legal:</span>
            <span className="text-xs">
              {marca.legal_notice
                ? "cargado"
                : <span className="italic text-muted-foreground">sin cargar</span>}
            </span>
          </div>
        </div>

        <Link
          href="/director/marketing-ia/configuracion-ia"
          className="inline-block text-xs text-accent hover:underline"
        >
          Ir a Marketing IA → Configuración
        </Link>
      </div>

      {/* ── Lo que se configura acá ── */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">
            Material para el ACM{" "}
            <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Lo que tu inmobiliaria le cuenta al propietario dentro del informe de valuación.
            Si no cargás nada, el ACM sale como siempre.
          </p>
        </div>

        <ConfigMaterial value={material} onChange={setMaterial} />
      </div>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando}>
          {guardando
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}
