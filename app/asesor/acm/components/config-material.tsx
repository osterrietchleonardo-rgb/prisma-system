"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import {
  SECCIONES, normalizarMaterial,
  type AcmMaterial, type AcmMaterialArchivo, type ClaveSeccion,
} from "@/lib/acm/material";

type Propuestas = Partial<Record<ClaveSeccion, string>>;

/** Saca una sección del mapa de propuestas sin mutarlo. */
function sinLaSeccion(propuestas: Propuestas, clave: ClaveSeccion): Propuestas {
  const copia = { ...propuestas };
  delete copia[clave];
  return copia;
}

export function ConfigMaterial({
  value, onChange,
}: { value: AcmMaterial; onChange: (v: AcmMaterial) => void }) {
  const material = normalizarMaterial(value);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [acomodando, setAcomodando] = useState<ClaveSeccion | null>(null);
  const [propuestas, setPropuestas] = useState<Propuestas>({});

  const setSeccion = (clave: ClaveSeccion, texto: string) =>
    onChange({ ...material, secciones: { ...material.secciones, [clave]: texto } });

  const subirUno = async (file: File): Promise<AcmMaterialArchivo> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/marketing-ia/acm-material/archivo", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `No se pudo subir ${file.name}`);
    return data as AcmMaterialArchivo;
  };

  const borrarDelBucket = async (path: string) => {
    try {
      await fetch("/api/marketing-ia/acm-material/archivo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      // Si el borrado falla, el archivo queda en el bucket pero sale de la lista.
      // Lo que importa es que deje de alimentar el ACM.
    }
  };

  const agregar = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevos: AcmMaterialArchivo[] = [];
      for (const file of Array.from(files)) nuevos.push(await subirUno(file));
      onChange({ ...material, archivos: [...material.archivos, ...nuevos] });
      toast.success(nuevos.length === 1 ? "Archivo cargado" : `${nuevos.length} archivos cargados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  };

  // Reemplazar = sube el nuevo y saca el viejo, en un solo gesto. El texto ya aceptado NO se
  // toca: para actualizarlo hay que tocar "Volver a leer" y aceptar sección por sección.
  const reemplazar = async (viejo: AcmMaterialArchivo, file: File | undefined) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const nuevo = await subirUno(file);
      await borrarDelBucket(viejo.path);
      onChange({
        ...material,
        archivos: material.archivos.map((x) => (x.id === viejo.id ? nuevo : x)),
      });
      toast.success("Archivo reemplazado. Tocá «Volver a leer» para actualizar los textos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reemplazar el archivo");
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (a: AcmMaterialArchivo) => {
    await borrarDelBucket(a.path);
    onChange({ ...material, archivos: material.archivos.filter((x) => x.id !== a.id) });
    toast.success("Archivo quitado. El texto que ya aceptaste queda como está.");
  };

  const volverALeer = async () => {
    setLeyendo(true);
    try {
      const res = await fetch("/api/marketing-ia/acm-material/leer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: material.archivos.map((a) => a.path) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo leer el material");
      setPropuestas(data.secciones);
      toast.success("Listo. Mirá lo que propone abajo y elegí qué usar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el material");
    } finally {
      setLeyendo(false);
    }
  };

  const acomodar = async (clave: ClaveSeccion) => {
    setAcomodando(clave);
    try {
      const res = await fetch("/api/marketing-ia/acm-material/acomodar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, texto: material.secciones[clave] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo acomodar el texto");
      setPropuestas((p) => ({ ...p, [clave]: data.texto }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo acomodar el texto");
    } finally {
      setAcomodando(null);
    }
  };

  const usarPropuesta = (clave: ClaveSeccion) => {
    const texto = propuestas[clave];
    if (!texto) return;
    setSeccion(clave, texto);
    setPropuestas((p) => sinLaSeccion(p, clave));
  };

  return (
    <div className="space-y-8">
      {/* ── Los archivos ── */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Subí los PDF o Word que <strong>ya usás</strong> con tus propietarios — podés subir
          varios juntos. PRISMA lee el texto, lo reparte en las cuatro secciones de abajo, y vos
          lo corregís antes de guardar. Si preferís, escribilas a mano y no subas nada.
        </p>
        <p className="text-xs bg-muted/50 border border-accent/10 rounded-lg p-3">
          <strong>Se copia solo el texto.</strong> Los gráficos, las fotos y los logos de tus
          archivos no pasan: la ficha los dibuja con los colores y el logo de tu agencia.
        </p>

        {material.archivos.length > 0 && (
          <ul className="space-y-2">
            {material.archivos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <span className="flex-1 truncate" title={a.nombre}>{a.nombre}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(a.subido_el).toLocaleDateString("es-AR")}
                </span>
                <label className="text-xs text-accent hover:underline cursor-pointer shrink-0">
                  Reemplazar
                  <input
                    type="file" accept=".pdf,.docx" className="hidden" disabled={subiendo}
                    onChange={(e) => { reemplazar(a, e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
                <Button
                  variant="ghost" size="sm" onClick={() => quitar(a)}
                  className="text-destructive h-7" title="Quitar"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file" accept=".pdf,.docx" multiple disabled={subiendo}
            onChange={(e) => { agregar(e.target.files); e.target.value = ""; }}
            className="text-xs max-w-xs"
          />
          {subiendo && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
          {material.archivos.length > 0 && (
            <Button onClick={volverALeer} disabled={leyendo || subiendo} variant="secondary" size="sm">
              {leyendo
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Sparkles className="w-4 h-4 mr-2" />}
              Volver a leer con IA
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">PDF o Word (.docx), hasta 25 MB cada uno.</p>
      </div>

      {/* ── Las cuatro secciones ── */}
      <div className="space-y-6">
        {SECCIONES.map((s) => {
          const actual = material.secciones[s.clave];
          const propuesta = propuestas[s.clave];
          return (
            <div key={s.clave} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h4 className="font-semibold text-sm">{s.titulo}</h4>
                <span className="text-[10px] text-muted-foreground shrink-0">{s.donde}</span>
              </div>
              <p className="text-xs text-muted-foreground italic">{s.ayuda}</p>

              <Textarea
                value={actual}
                maxLength={s.tope}
                rows={5}
                onChange={(e) => setSeccion(s.clave, e.target.value)}
                placeholder="Escribilo a mano, o subí un archivo arriba y dejá que PRISMA lo proponga."
              />
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost" size="sm"
                  disabled={acomodando === s.clave || actual.trim().length < 20}
                  onClick={() => acomodar(s.clave)}
                  className="text-xs h-7"
                >
                  {acomodando === s.clave
                    ? <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    : <Wand2 className="w-3 h-3 mr-2" />}
                  Acomodar con IA
                </Button>
                <span className="text-[10px] text-muted-foreground">{actual.length}/{s.tope}</span>
              </div>

              {propuesta !== undefined && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-accent">Lo que propone la IA</p>
                  <p className="text-sm whitespace-pre-wrap">
                    {propuesta || (
                      <span className="italic text-muted-foreground">
                        No encontró material para esta sección. Podés escribirla a mano.
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm" onClick={() => usarPropuesta(s.clave)}
                      disabled={!propuesta} className="h-7 text-xs"
                    >
                      Usar este
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setPropuestas((p) => sinLaSeccion(p, s.clave))}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
