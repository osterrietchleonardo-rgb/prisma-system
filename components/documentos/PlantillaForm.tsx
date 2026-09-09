// La pantalla donde el director arma UNA plantilla: nombre, header, cuerpo, bloque del
// asesor, footer, activa. A la derecha, cómo la va a ver el cliente, con un asesor real.
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Trash2, Upload } from "lucide-react";
import { EditorDocumento } from "./EditorDocumento";
import { RenderDocumento } from "./RenderDocumento";
import { normalizarPlantilla, POSICIONES, type Plantilla, type PosicionBloque } from "@/lib/documentos/plantilla";
import { GUIA_IMAGEN } from "@/lib/documentos/imagen-reglas";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";

const NOMBRE_POSICION: Record<PosicionBloque, string> = {
  header: "Debajo del header",
  footer: "Arriba del footer",
  ambos: "En los dos",
  ninguno: "No lo pongas",
};

type Cual = "header" | "footer";

export function PlantillaForm({ id, onVolver }: { id: string; onVolver: () => void }) {
  const [p, setP] = useState<Plantilla | null>(null);
  const [urls, setUrls] = useState<Record<Cual, string | null>>({ header: null, footer: null });
  const [compartidos, setCompartidos] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<Cual | null>(null);
  const [previa, setPrevia] = useState<{ snapshot: SnapshotDocumento; asesor: string } | null>(null);
  // Si se rechaza, el nombre del archivo queda a la vista junto al motivo, para corregir sin
  // empezar de cero. Solo se limpia cuando subió bien.
  const [rechazo, setRechazo] = useState<{ cual: Cual; archivo: string; motivo: string } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/documentos-plantillas/${id}`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "No se pudo cargar"); return; }
      setP(normalizarPlantilla(d.plantilla));
      setUrls({ header: d.header_url, footer: d.footer_url });
      setCompartidos(d.compartidos ?? 0);
    })();
  }, [id]);

  // Vista previa con un asesor real, al ritmo de lo que escribe (con una pausa para no
  // pegarle al servidor por tecla).
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(async () => {
      const r = await fetch("/api/documentos/vista-previa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantilla: p, header_url: urls.header, footer_url: urls.footer }),
      });
      if (r.ok) setPrevia(await r.json());
    }, 600);
    return () => clearTimeout(t);
  }, [p, urls]);

  const guardar = async () => {
    if (!p) return;
    setGuardando(true);
    try {
      const r = await fetch(`/api/documentos-plantillas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: p.nombre, cuerpo: p.cuerpo, bloque_asesor: p.bloque_asesor, activa: p.activa }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar");
      setP(normalizarPlantilla(d.plantilla));
      toast.success(p.activa ? "Guardada y activa: tus asesores ya la pueden compartir." : "Guardada como borrador.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const subir = async (cual: Cual, input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setSubiendo(cual);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("cual", cual);
      const r = await fetch(`/api/documentos-plantillas/${id}/imagen`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setRechazo({ cual, archivo: file.name, motivo: d.error || "No se pudo subir" }); return; }
      setRechazo(null);
      input.value = "";
      setUrls((u) => ({ ...u, [cual]: d.url }));
      setP((x) => (x ? { ...x, [`${cual}_path`]: d.path } : x));
      toast.success(`${cual === "header" ? "Header" : "Footer"} cargado (${d.ancho}×${d.alto} px)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(null);
    }
  };

  const quitar = async (cual: Cual) => {
    const r = await fetch(`/api/documentos-plantillas/${id}/imagen`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cual }),
    });
    if (r.ok) {
      setUrls((u) => ({ ...u, [cual]: null }));
      setP((x) => (x ? { ...x, [`${cual}_path`]: null } : x));
    } else {
      toast.error("No se pudo quitar la imagen.");
    }
  };

  if (!p) return <div className="py-12 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-accent" /></div>;

  const Franja = ({ cual }: { cual: Cual }) => (
    <div className="rounded-lg border border-accent/10 p-3 space-y-2" data-testid={`franja-${cual}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {cual === "header" ? "Header (arriba)" : "Footer (abajo)"} <span className="font-normal text-muted-foreground">· opcional</span>
        </h4>
        {urls[cual] && (
          <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => quitar(cual)}>
            <Trash2 className="h-3 w-3 mr-1" />Quitar
          </Button>
        )}
      </div>
      {urls[cual] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls[cual]!} alt="" className="w-full rounded border" />
      ) : (
        <p className="text-xs text-muted-foreground">Sin imagen: el documento sale sin esta franja, y no pasa nada.</p>
      )}
      <label className="inline-flex items-center gap-2 text-xs text-accent cursor-pointer">
        {subiendo === cual ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {urls[cual] ? "Reemplazar imagen" : "Subir imagen"}
        <input
          type="file" accept="image/png,image/jpeg" className="hidden" disabled={!!subiendo}
          data-testid={`input-${cual}`}
          onChange={(e) => subir(cual, e.target)}
        />
      </label>
      {rechazo?.cual === cual && (
        <p className="text-xs text-destructive" data-testid={`rechazo-${cual}`}><b>{rechazo.archivo}</b>: {rechazo.motivo}</p>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={onVolver}><ArrowLeft className="h-4 w-4 mr-1" />Volver a la lista</Button>

        <div className="space-y-1">
          <label className="text-sm font-semibold" htmlFor="plantilla-nombre">Nombre</label>
          <Input id="plantilla-nombre" value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} placeholder="Presentación de la inmobiliaria" />
        </div>

        <div className="rounded-lg bg-muted/40 border border-accent/10 p-3 text-xs leading-relaxed">{GUIA_IMAGEN}</div>
        <Franja cual="header" />

        <div className="space-y-1">
          <div className="text-sm font-semibold">Cuerpo</div>
          <EditorDocumento value={p.cuerpo} onChange={(cuerpo) => setP({ ...p, cuerpo })} testId="editor-cuerpo" />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Bloque del asesor</div>
          <p className="text-xs text-muted-foreground">
            Lo que sale con los datos de cada persona. Ejemplo: <code>@nombre | @categoria</code> y abajo <code>@email | Cel: @celular</code>.
            Si a alguien le falta un dato, esa parte se omite sola.
          </p>
          <EditorDocumento compacto value={p.bloque_asesor.texto} onChange={(texto) => setP({ ...p, bloque_asesor: { ...p.bloque_asesor, texto } })} testId="editor-bloque" />
          <div className="flex flex-wrap gap-2">
            {POSICIONES.map((pos) => (
              <button
                key={pos} type="button"
                onClick={() => setP({ ...p, bloque_asesor: { ...p.bloque_asesor, posicion: pos } })}
                className={`rounded-full px-3 py-1 text-xs border ${p.bloque_asesor.posicion === pos ? "bg-accent text-accent-foreground border-accent" : "border-accent/20 hover:bg-muted"}`}
              >
                {NOMBRE_POSICION[pos]}
              </button>
            ))}
          </div>
        </div>

        <Franja cual="footer" />

        <div className="flex items-center justify-between rounded-lg border border-accent/10 p-3">
          <div>
            <div className="text-sm font-semibold">Activa</div>
            <div className="text-xs text-muted-foreground">
              Solo las activas aparecen para compartir.{" "}
              {compartidos > 0 && `Ya se compartió ${compartidos} ${compartidos === 1 ? "vez" : "veces"}.`}
            </div>
          </div>
          <Switch checked={p.activa} onCheckedChange={(activa) => setP({ ...p, activa })} aria-label="Activa" />
        </div>

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">
          Así lo va a ver el cliente{previa?.asesor ? ` · con los datos de ${previa.asesor}` : ""}
        </div>
        <div className="rounded-lg border border-accent/10 bg-[#e9e6df] p-3 overflow-auto max-h-[80vh]" data-testid="vista-previa">
          {previa ? (
            <div className="documento-root !p-0 !min-h-0 !bg-transparent"><RenderDocumento snap={previa.snapshot} /></div>
          ) : (
            <p className="text-xs text-muted-foreground">Escribí algo para ver la vista previa.</p>
          )}
        </div>
      </div>
    </div>
  );
}
