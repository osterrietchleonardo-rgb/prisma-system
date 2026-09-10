// Biblioteca → "Para compartir": los documentos de la inmobiliaria que el asesor le puede
// mandar a un cliente, con sus datos. Y los links que ya generó, con vistas.
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Share2, Loader2, ExternalLink, Copy, AlertTriangle } from "lucide-react";
import { VARIABLES, type VariableId } from "@/lib/documentos/variables";

type Activa = { id: string; nombre: string; version: number; tiene_header: boolean; tiene_footer: boolean };
type Link = { token: string; path: string; nombre: string; version: number; created_at: string; view_count: number };

export function ParaCompartir() {
  const [activas, setActivas] = useState<Activa[] | null>(null);
  const [faltan, setFaltan] = useState<VariableId[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [compartiendo, setCompartiendo] = useState<string | null>(null);

  const cargar = async () => {
    const [a, l] = await Promise.all([fetch("/api/documentos/activas"), fetch("/api/documentos/mis-links")]);
    const da = await a.json();
    const dl = await l.json();
    setActivas(a.ok ? da.plantillas : []);
    setFaltan(a.ok ? da.faltan : []);
    setLinks(l.ok ? dl.links : []);
  };
  useEffect(() => { cargar(); }, []);

  const compartir = async (id: string) => {
    setCompartiendo(id);
    try {
      const r = await fetch("/api/documentos/compartir", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plantilla_id: id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const url = `${window.location.origin}${d.path}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link copiado. Ya lo podés mandar.");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo compartir");
    } finally {
      setCompartiendo(null);
    }
  };

  const copiar = async (path: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`).catch(() => {});
    toast.success("Copiado.");
  };
  const etiqueta = (id: VariableId) => VARIABLES.find((v) => v.id === id)?.label ?? id;
  // @agencia no depende del asesor: si falta, es un problema de la agencia, no suyo.
  const faltanSuyos = faltan.filter((f) => f !== "agencia");

  return (
    <div className="space-y-6" data-testid="para-compartir">
      <div>
        <h2 className="text-2xl font-bold">Para compartir</h2>
        <p className="text-muted-foreground text-sm">
          Documentos de la inmobiliaria que le podés mandar a un cliente. Salen con tu nombre y tus datos de contacto,
          con la marca de la agencia y con PDF.
        </p>
      </div>

      {faltanSuyos.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" data-testid="aviso-faltan">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            Te falta cargar {faltanSuyos.map(etiqueta).join(", ")}. Se completa en <b>Configuración</b>; mientras tanto,
            esa parte no sale en tus documentos.
          </div>
        </div>
      )}

      {activas === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      ) : activas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tu director todavía no cargó ningún documento para compartir.</p>
      ) : (
        <ul className="space-y-2">
          {activas.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-accent/10 bg-card/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{p.nombre}</div>
                <div className="text-xs text-muted-foreground">versión {p.version}</div>
              </div>
              <Button size="sm" onClick={() => compartir(p.id)} disabled={compartiendo === p.id}>
                {compartiendo === p.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Share2 className="h-3 w-3 mr-1" />}Compartir
              </Button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <div className="space-y-2" data-testid="mis-links">
          <h3 className="text-sm font-semibold">Los que ya generaste</h3>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.token} className="flex items-center gap-3 rounded-lg border border-accent/10 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1 truncate">
                  {l.nombre}{" "}
                  <span className="text-xs text-muted-foreground">
                    v{l.version} · {new Date(l.created_at).toLocaleDateString("es-AR")} · {l.view_count} {l.view_count === 1 ? "vista" : "vistas"}
                  </span>
                </div>
                <Button size="sm" variant="ghost" className="h-7" aria-label="Copiar link" onClick={() => copiar(l.path)}><Copy className="h-3 w-3" /></Button>
                <a href={l.path} target="_blank" rel="noopener noreferrer" className="text-accent" aria-label="Abrir"><ExternalLink className="h-3 w-3" /></a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
