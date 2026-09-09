// Asesores → Plantillas → "Documentos para clientes": la lista y el botón de crear.
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Loader2, FileText, Share2, Pencil, Trash2 } from "lucide-react";
import { PlantillaForm } from "./PlantillaForm";
import type { Plantilla } from "@/lib/documentos/plantilla";
import "@/app/documento/[token]/documento.css";

export const PARA_QUE_SIRVE_CLIENTES =
  "Documentos que armás una vez y cada asesor comparte con sus clientes con sus propios datos: la presentación de la " +
  "inmobiliaria, las condiciones de la exclusiva, la guía para preparar la casa. Salen con tu marca, con link y con PDF. " +
  "Si mejorás una plantilla, lo que se comparta de ahí en adelante sale con la versión nueva; nadie tiene que hacer nada.";

export function PlantillasClientes() {
  const [lista, setLista] = useState<Plantilla[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const cargar = async () => {
    const r = await fetch("/api/documentos-plantillas");
    const d = await r.json();
    setLista(r.ok ? d.plantillas : []);
  };
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!nuevoNombre.trim()) { toast.error("Ponele un nombre."); return; }
    setCreando(true);
    try {
      const r = await fetch("/api/documentos-plantillas", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nuevoNombre }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNuevoNombre("");
      await cargar();
      setEditando(d.plantilla.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setCreando(false);
    }
  };

  const compartir = async (id: string) => {
    const r = await fetch("/api/documentos/compartir", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plantilla_id: id }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "No se pudo compartir"); return; }
    const url = `${window.location.origin}${d.path}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Link copiado. Abriéndolo…");
    window.open(url, "_blank");
  };

  const borrar = async (p: Plantilla) => {
    if (!confirm(`¿Borrar "${p.nombre}"?`)) return;
    const r = await fetch(`/api/documentos-plantillas/${p.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "No se pudo borrar"); return; }
    toast.success(d.borrada ? "Borrada." : "Ya se había compartido, así que quedó desactivada: los links que mandaron tus asesores siguen abiertos.");
    cargar();
  };

  // Al volver, la lista se vacía antes de recargar: si no, medio segundo se ve la fila vieja
  // (versión y estado de antes de guardar).
  if (editando) return <PlantillaForm id={editando} onVolver={() => { setEditando(null); setLista(null); cargar(); }} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">{PARA_QUE_SIRVE_CLIENTES}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nombre de la plantilla nueva" className="max-w-xs"
          onKeyDown={(e) => e.key === "Enter" && crear()}
          aria-label="Nombre de la plantilla nueva"
        />
        <Button onClick={crear} disabled={creando}>
          {creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Crear nueva plantilla
        </Button>
      </div>
      {lista === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay plantillas. Creá la primera con el botón de arriba.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-accent/10 bg-card/40 px-4 py-3">
              <FileText className="h-4 w-4 text-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{p.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  v{p.version} · {p.activa ? "activa" : "borrador"}{p.header_path ? " · header" : ""}{p.footer_path ? " · footer" : ""}
                </div>
              </div>
              {p.activa && (
                <Button size="sm" variant="secondary" onClick={() => compartir(p.id)}><Share2 className="h-3 w-3 mr-1" />Compartir</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setEditando(p.id)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Borrar ${p.nombre}`} onClick={() => borrar(p)}><Trash2 className="h-3 w-3" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
