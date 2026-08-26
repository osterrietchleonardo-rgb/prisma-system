"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Upload, Download, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { validarArchivo, rutaDeArchivo, nombreVisible, escaparComodinesIlike, type Seccion } from "@/lib/asesor-docs/reglas";
import { urlDeDescarga } from "@/lib/asesor-docs/url";

interface Props {
  advisorId: string;
  agencyId: string;
  /** true = vista del asesor: solo mirar y descargar. */
  readOnly?: boolean;
}

const STORAGE_BUCKET = "documents";
const TIPO_NUEVO = "__nuevo__";

// El nombre del tipo viene en el mismo pedido SOLO del lado del director: la
// lista tiene que mostrar "Contrato de Asesor", no un id. El asesor NO tiene
// política para leer advisor_doc_templates, y Supabase aplica los permisos
// también a los pedidos anidados: si se lo pidiéramos igual, le llegaría
// vacío y vería un hueco. Por eso el join solo se pide cuando !readOnly, y el
// tipo del campo lo refleja como opcional.
type Plantilla = {
  id: string;
  nombre_archivo: string;
  archivo_original_path: string;
  template_id: string;
  size_bytes: number | null;
  created_at: string;
  advisor_doc_templates?: { nombre: string } | null;
};
type Tipo = { id: string; nombre: string };
type Info = {
  id: string;
  nombre: string;
  file_path: string;
  size_bytes: number | null;
  created_at: string;
};

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// Los mensajes de error de Postgres/Supabase vienen en inglés y son
// ilegibles para gente no técnica. De todos los que puede tirar esta
// pantalla, solo estos dos son alcanzables desde acá: el índice único de
// advisor_documents (un tipo duplicado, ver el flujo de subirPlantilla) y
// una violación de RLS (agencyId desalineado con el perfil del director).
// El resto se deja crudo a propósito: son casos de borde que no vale la
// pena adivinar en español.
function traducirErrorBase(mensaje: string): string {
  if (mensaje.includes("duplicate key")) {
    return "Este asesor ya tiene un documento de ese tipo. Recargá la página e intentá de nuevo.";
  }
  if (mensaje.includes("row-level security policy")) {
    return "No tenés permiso para hacer esta acción. Recargá la página e intentá de nuevo.";
  }
  return mensaje;
}

// Distinto del estado vacío a propósito: acá algo salió mal, no es que no
// haya documentos. Con botón para reintentar la carga.
function BloqueError({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{mensaje}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onReintentar}>Reintentar</Button>
    </div>
  );
}

export function DocumentosDelAsesor({ advisorId, agencyId, readOnly = false }: Props) {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  // Distinto de "sin documentos": una consulta que falla (red, permisos, el tope
  // de 8s del rol authenticated) NO es lo mismo que una lista vacía. Si se
  // confunden, el usuario cree que no hay nada cuando en realidad no se pudo
  // saber — el peor tipo de fallo, porque se disfraza de dato.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [infos, setInfos] = useState<Info[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const columnasPlantillas = readOnly
        ? "id, nombre_archivo, archivo_original_path, template_id, size_bytes, created_at"
        : "id, nombre_archivo, archivo_original_path, template_id, size_bytes, created_at, advisor_doc_templates(nombre)";
      const [p, i] = await Promise.all([
        supabase
          .from("advisor_documents")
          .select(columnasPlantillas)
          .eq("advisor_id", advisorId)
          .order("created_at", { ascending: false }),
        supabase
          .from("advisor_info_documents")
          .select("id, nombre, file_path, size_bytes, created_at")
          .eq("advisor_id", advisorId)
          .order("created_at", { ascending: false }),
      ]);
      if (p.error || i.error) {
        setErrorCarga("No se pudieron cargar los documentos. Puede ser un problema de conexión — probá de nuevo.");
        setPlantillas([]);
        setInfos([]);
        return;
      }
      setPlantillas((p.data as unknown as Plantilla[]) ?? []);
      setInfos((i.data as Info[]) ?? []);
      // La lista de tipos es solo del director: el asesor no tiene política para leerla.
      if (!readOnly) {
        const { data: t, error: errTipos } = await supabase
          .from("advisor_doc_templates")
          .select("id, nombre")
          .eq("agency_id", agencyId)
          .order("nombre");
        if (errTipos) {
          setErrorCarga("No se pudieron cargar los tipos de documento. Probá de nuevo.");
          setTipos([]);
          return;
        }
        setTipos(t ?? []);
      }
    } finally {
      setCargando(false);
    }
  }, [supabase, advisorId, agencyId, readOnly]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargar = async (path: string, nombre: string) => {
    // El nombre se le pasa a urlDeDescarga para que Supabase lo fuerce por
    // header (download=nombre): a.download NO alcanza, el navegador lo
    // ignora en un link cross-origin como el de Storage.
    const url = await urlDeDescarga(supabase, path, nombre);
    if (!url) { toast.error("No se pudo armar el link de descarga"); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener";
    a.click();
  };

  // Borra un archivo de Storage. El borrado es por autor (auth.uid() = owner),
  // no por inmobiliaria: si mañana una agencia tiene dos directores, el
  // segundo no puede borrar lo que subió el primero. Se tolera: se avisa,
  // nunca se deja la fila colgada por eso.
  const borrarDeStorage = async (path: string): Promise<boolean> => {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    return !error;
  };

  // ── Plantillas personalizadas ───────────────────────────────
  const [subiendoPlantilla, setSubiendoPlantilla] = useState(false);
  const [dialogPlantillaAbierto, setDialogPlantillaAbierto] = useState(false);
  const [archivoPlantilla, setArchivoPlantilla] = useState<File | null>(null);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string>("");
  const [nombreTipoNuevo, setNombreTipoNuevo] = useState("");

  const cerrarDialogPlantilla = () => {
    if (subiendoPlantilla) return;
    setDialogPlantillaAbierto(false);
    setArchivoPlantilla(null);
    setTipoSeleccionado("");
    setNombreTipoNuevo("");
  };

  const subirPlantilla = async () => {
    if (!archivoPlantilla) { toast.error("Elegí un archivo"); return; }
    const esNuevo = tipoSeleccionado === TIPO_NUEVO;
    const nombreNuevo = nombreTipoNuevo.trim();
    if (!tipoSeleccionado || (esNuevo && !nombreNuevo)) {
      toast.error("Elegí el tipo de documento");
      return;
    }

    const validacion = validarArchivo(archivoPlantilla.name, archivoPlantilla.size, "plantilla" as Seccion);
    if (!validacion.ok) { toast.error(validacion.error); return; }

    setSubiendoPlantilla(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Resolver el tipo: el que se eligió, o crear uno nuevo.
      let templateId = tipoSeleccionado;
      if (esNuevo) {
        // El nombre tiene un índice único case-insensitive (agency_id, lower(nombre)).
        // Buscarlo ANTES de insertar evita dos cosas: un mensaje de "duplicate key"
        // ilegible si ya existe con otra capitalización, y la trampa de quedar
        // trabado si esta misma pantalla ya lo creó en un intento anterior que
        // falló después (el tipo quedó creado, pero el archivo no se subió).
        const { data: tipoExistente, error: errBuscar } = await supabase
          .from("advisor_doc_templates")
          .select("id, nombre")
          .eq("agency_id", agencyId)
          .ilike("nombre", escaparComodinesIlike(nombreNuevo))
          .maybeSingle();
        if (errBuscar) {
          toast.error("No se pudo verificar el tipo de documento: " + traducirErrorBase(errBuscar.message));
          return;
        }
        if (tipoExistente) {
          templateId = tipoExistente.id;
          setTipos((prev) => (prev.some((t) => t.id === tipoExistente.id) ? prev : [...prev, tipoExistente].sort((a, b) => a.nombre.localeCompare(b.nombre))));
        } else {
          const { data: nuevoTipo, error: errTipo } = await supabase
            .from("advisor_doc_templates")
            .insert({ agency_id: agencyId, nombre: nombreNuevo, created_by: user?.id })
            .select("id, nombre")
            .single();
          if (errTipo || !nuevoTipo) {
            toast.error("No se pudo crear el tipo de documento" + (errTipo ? `: ${traducirErrorBase(errTipo.message)}` : ""));
            return;
          }
          templateId = nuevoTipo.id;
          setTipos((prev) => [...prev, nuevoTipo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }
      }

      // 2) ¿Ya tiene un documento de este tipo? Si sí, es un reemplazo: confirmar.
      const existente = plantillas.find((p) => p.template_id === templateId);
      if (existente) {
        const ok = confirm(
          `Este asesor ya tiene un documento de ese tipo. ¿Reemplazarlo por "${archivoPlantilla.name}"?`
        );
        if (!ok) return;
      }

      // 3) Subir el archivo. La ruta SIEMPRE sale de rutaDeArchivo, con un id
      // generado acá — nunca con el nombre del archivo ni el del tipo.
      const nuevoId = crypto.randomUUID();
      const path = rutaDeArchivo(agencyId, advisorId, "plantilla", nuevoId, validacion.extension);
      const { error: errStorage } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, archivoPlantilla, { upsert: false });
      if (errStorage) { toast.error("No se pudo subir el archivo: " + errStorage.message); return; }

      // 4) La fila: update si reemplaza, insert si es la primera vez.
      //
      // El UPDATE (en vez de borrar la fila y crear otra) es a propósito: con
      // DELETE+INSERT hay una ventana sin fila, y si el INSERT fallara el
      // asesor se queda sin documento. Con UPDATE además se preservan `id` y
      // `created_at`.
      //
      // OJO Etapa C: este UPDATE no toca version_id/form_data/estado/observacion.
      // Hoy son siempre null y no pasa nada, pero apenas la C empiece a llenarlos
      // con datos extraídos del archivo, reemplazar acá va a dejar esos datos
      // del archivo VIEJO pegados al archivo nuevo. Cuando eso exista, este
      // UPDATE tiene que limpiarlos también.
      if (existente) {
        const { error: errUpdate } = await supabase
          .from("advisor_documents")
          .update({
            nombre_archivo: archivoPlantilla.name,
            archivo_original_path: path,
            size_bytes: archivoPlantilla.size,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existente.id);
        if (errUpdate) {
          await supabase.storage.from(STORAGE_BUCKET).remove([path]);
          toast.error("No se pudo guardar el reemplazo: " + traducirErrorBase(errUpdate.message));
          return;
        }
        // El nuevo archivo ya está arriba: recién ahora se borra el viejo.
        const okBorrado = await borrarDeStorage(existente.archivo_original_path);
        if (!okBorrado) {
          toast.warning("El documento se reemplazó, pero el archivo anterior no se pudo borrar del almacenamiento.");
        } else {
          toast.success("Documento reemplazado");
        }
      } else {
        const { error: errInsert } = await supabase.from("advisor_documents").insert({
          agency_id: agencyId,
          advisor_id: advisorId,
          template_id: templateId,
          nombre_archivo: archivoPlantilla.name,
          archivo_original_path: path,
          size_bytes: archivoPlantilla.size,
          created_by: user?.id,
        });
        if (errInsert) {
          // Rollback: no pueden quedar archivos huérfanos en Storage.
          await supabase.storage.from(STORAGE_BUCKET).remove([path]);
          toast.error("No se pudo guardar el documento: " + traducirErrorBase(errInsert.message));
          return;
        }
        toast.success("Documento subido");
      }

      cerrarDialogPlantilla();
      cargar();
    } finally {
      setSubiendoPlantilla(false);
    }
  };

  const [borrandoPlantillaId, setBorrandoPlantillaId] = useState<string | null>(null);
  const borrarPlantilla = async (doc: Plantilla) => {
    if (!confirm("¿Eliminar este documento? No se puede deshacer.")) return;
    setBorrandoPlantillaId(doc.id);
    try {
      // Primero la fila, recién después el archivo: si se borrara el archivo
      // primero y esto fallara (red, o el tope de 8s del rol authenticated),
      // quedaría una fila apuntando a un archivo que ya no existe — y para el
      // asesor eso se ve como que Descargar lo saca de PRISMA sin aviso,
      // porque urlDeDescarga arma la dirección igual, sin consultar nada.
      const { error } = await supabase.from("advisor_documents").delete().eq("id", doc.id);
      if (error) { toast.error("No se pudo eliminar: " + traducirErrorBase(error.message)); return; }
      const okStorage = await borrarDeStorage(doc.archivo_original_path);
      if (!okStorage) {
        // El borrado es por autor: con dos directores, el segundo no puede
        // borrar lo que subió el primero. Se tolera y queda huérfano en
        // Storage; se deja registrado acá para poder limpiarlo después.
        console.error("Archivo huérfano en Storage (advisor_documents):", doc.archivo_original_path);
        toast.warning("Se eliminó el documento, pero el archivo no se pudo quitar del almacenamiento.");
      } else {
        toast.success("Documento eliminado");
      }
      cargar();
    } finally {
      setBorrandoPlantillaId(null);
    }
  };

  const nombrePlantilla = (doc: Plantilla) =>
    !readOnly && doc.advisor_doc_templates?.nombre
      ? doc.advisor_doc_templates.nombre
      : nombreVisible(doc.nombre_archivo);

  // ── Documentos de información ───────────────────────────────
  const [subiendoInfo, setSubiendoInfo] = useState(false);
  const [dialogInfoAbierto, setDialogInfoAbierto] = useState(false);
  const [archivosInfo, setArchivosInfo] = useState<File[]>([]);
  const [progresoInfo, setProgresoInfo] = useState<{ done: number; total: number } | null>(null);

  const cerrarDialogInfo = () => {
    if (subiendoInfo) return;
    setDialogInfoAbierto(false);
    setArchivosInfo([]);
  };

  const subirInfo = async () => {
    if (archivosInfo.length === 0) { toast.error("Elegí al menos un archivo"); return; }
    setSubiendoInfo(true);
    setProgresoInfo({ done: 0, total: archivosInfo.length });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let okCount = 0;
      const fallidos: { nombre: string; motivo: string }[] = [];
      // Solo los que fallaron quedan seleccionados: si se aprieta Subir de
      // nuevo, los que ya entraron no se vuelven a subir (no hay índice único
      // en esta tabla que lo frene, así que duplicarían sin avisar).
      const pendientes: File[] = [];

      for (const file of archivosInfo) {
        const validacion = validarArchivo(file.name, file.size, "info" as Seccion);
        if (!validacion.ok) {
          fallidos.push({ nombre: file.name, motivo: validacion.error });
          pendientes.push(file);
          setProgresoInfo((p) => (p ? { ...p, done: p.done + 1 } : p));
          continue;
        }
        const nuevoId = crypto.randomUUID();
        const path = rutaDeArchivo(agencyId, advisorId, "info", nuevoId, validacion.extension);
        try {
          const { error: errStorage } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, file, { upsert: false });
          if (errStorage) throw errStorage;

          const { error: errInsert } = await supabase.from("advisor_info_documents").insert({
            agency_id: agencyId,
            advisor_id: advisorId,
            nombre: file.name,
            file_path: path,
            mime: file.type,
            size_bytes: file.size,
            created_by: user?.id,
          });
          if (errInsert) {
            await supabase.storage.from(STORAGE_BUCKET).remove([path]);
            throw errInsert;
          }
          okCount++;
        } catch (err) {
          const motivo = err instanceof Error ? err.message : "No se pudo subir";
          fallidos.push({ nombre: file.name, motivo });
          pendientes.push(file);
        } finally {
          setProgresoInfo((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      }

      if (okCount > 0) {
        toast.success(okCount === 1 ? "Archivo subido" : `${okCount} archivos subidos`);
      }
      // Sin el "&& okCount > 0": si TODOS fallan (ej. se cae la subida a
      // Storage), antes no se avisaba nada — ni éxito (no hubo) ni error
      // (el guard lo tapaba). El spinner terminaba y no pasaba nada.
      if (fallidos.length > 0) {
        toast.error(
          fallidos.length === 1
            ? `No se pudo subir "${fallidos[0].nombre}": ${fallidos[0].motivo}`
            : `No se pudieron subir ${fallidos.length} de ${archivosInfo.length}: ${fallidos.map((f) => f.nombre).join(", ")}`
        );
      }

      setArchivosInfo(pendientes);
      if (pendientes.length === 0) cerrarDialogInfo();
      cargar();
    } finally {
      setSubiendoInfo(false);
      setProgresoInfo(null);
    }
  };

  const [borrandoInfoId, setBorrandoInfoId] = useState<string | null>(null);
  const borrarInfo = async (doc: Info) => {
    if (!confirm("¿Eliminar este archivo? No se puede deshacer.")) return;
    setBorrandoInfoId(doc.id);
    try {
      // Mismo orden que en borrarPlantilla: primero la fila, después el
      // archivo. Ver el comentario de ahí.
      const { error } = await supabase.from("advisor_info_documents").delete().eq("id", doc.id);
      if (error) { toast.error("No se pudo eliminar: " + traducirErrorBase(error.message)); return; }
      const okStorage = await borrarDeStorage(doc.file_path);
      if (!okStorage) {
        console.error("Archivo huérfano en Storage (advisor_info_documents):", doc.file_path);
        toast.warning("Se eliminó el archivo, pero no se pudo quitar del almacenamiento.");
      } else {
        toast.success("Archivo eliminado");
      }
      cargar();
    } finally {
      setBorrandoInfoId(null);
    }
  };

  const tiposOrdenados = useMemo(() => tipos, [tipos]);

  return (
    <div className="space-y-8">
      {/* ── Plantillas personalizadas ── */}
      <section className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Plantillas personalizadas</h3>
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Documentos que la agencia preparó para vos."
                : "Un documento por tipo. Subir uno nuevo del mismo tipo reemplaza al anterior."}
            </p>
          </div>
          {!readOnly && (
            <Dialog open={dialogPlantillaAbierto} onOpenChange={(o) => { if (!o) cerrarDialogPlantilla(); else setDialogPlantillaAbierto(true); }}>
              <DialogTrigger asChild>
                {/* Deshabilitado con error de carga: si no, el diálogo se abre con
                    la lista vacía por el error (no porque no haya nada), y el
                    chequeo de "ya existe" busca en esa lista vacía y deja
                    pasar un duplicado que el índice único rechaza después. */}
                <Button className="gap-2" disabled={!!errorCarga} title={errorCarga ? "No se pudo cargar la lista de documentos" : undefined}>
                  <Upload className="h-4 w-4" />
                  Subir documento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Subir plantilla personalizada</DialogTitle>
                  <DialogDescription>
                    Elegí el tipo de documento y el archivo Word (.docx). Si el asesor ya tiene uno de ese tipo, se reemplaza.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Tipo de documento</Label>
                    <Select value={tipoSeleccionado} onValueChange={setTipoSeleccionado} disabled={subiendoPlantilla}>
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí un tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposOrdenados.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                        ))}
                        <SelectItem value={TIPO_NUEVO}>+ Escribir un tipo nuevo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {tipoSeleccionado === TIPO_NUEVO && (
                    <div className="space-y-2">
                      <Label>Nombre del tipo nuevo</Label>
                      <Input
                        placeholder="Ej: Contrato de Asesor"
                        value={nombreTipoNuevo}
                        onChange={(e) => setNombreTipoNuevo(e.target.value)}
                        disabled={subiendoPlantilla}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Archivo (.docx)</Label>
                    <Input
                      type="file"
                      accept=".docx"
                      disabled={subiendoPlantilla}
                      onChange={(e) => setArchivoPlantilla(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" type="button" disabled={subiendoPlantilla} onClick={cerrarDialogPlantilla}>
                    Cancelar
                  </Button>
                  <Button type="button" disabled={subiendoPlantilla} onClick={subirPlantilla}>
                    {subiendoPlantilla ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Subir
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {cargando ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : errorCarga ? (
          <BloqueError mensaje={errorCarga} onReintentar={cargar} />
        ) : plantillas.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {readOnly
              ? "Todavía no tenés plantillas personalizadas cargadas."
              : "Subí la primera plantilla personalizada para este asesor."}
          </div>
        ) : (
          <ul className="space-y-2">
            {plantillas.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{nombrePlantilla(doc)}</p>
                    {/* El director ve acá el nombre del tipo, arriba. Sin esto no
                        tiene forma de saber cuál archivo cargó: el asesor ve el
                        nombre del ARCHIVO, no el del tipo, así que pueden ser
                        dos cosas distintas y el director quedarse tranquilo con
                        el archivo equivocado. Solo para el director: para el
                        asesor arriba YA es el nombre del archivo. */}
                    <p className="text-xs text-muted-foreground truncate">
                      {!readOnly && `${nombreVisible(doc.nombre_archivo)} · `}
                      {formatBytes(doc.size_bytes)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" title="Descargar"
                    onClick={() => descargar(doc.archivo_original_path, doc.nombre_archivo)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!readOnly && (
                    <Button
                      variant="ghost" size="icon" title="Eliminar"
                      disabled={borrandoPlantillaId === doc.id}
                      onClick={() => borrarPlantilla(doc)}
                    >
                      {borrandoPlantillaId === doc.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Documentos de información ── */}
      <section className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Documentos de información</h3>
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Archivos que la agencia compartió con vos."
                : "Archivos sueltos para este asesor: Word o PDF."}
            </p>
          </div>
          {!readOnly && (
            <Dialog open={dialogInfoAbierto} onOpenChange={(o) => { if (!o) cerrarDialogInfo(); else setDialogInfoAbierto(true); }}>
              <DialogTrigger asChild>
                <Button className="gap-2" disabled={!!errorCarga} title={errorCarga ? "No se pudo cargar la lista de documentos" : undefined}>
                  <Upload className="h-4 w-4" />
                  Subir archivos
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Subir documentos de información</DialogTitle>
                  <DialogDescription>
                    Podés elegir varios archivos a la vez (.docx, .doc o .pdf).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Input
                    type="file"
                    accept=".docx,.doc,.pdf"
                    multiple
                    disabled={subiendoInfo}
                    onChange={(e) => setArchivosInfo(Array.from(e.target.files ?? []))}
                  />
                  {archivosInfo.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {archivosInfo.length === 1 ? "1 archivo seleccionado" : `${archivosInfo.length} archivos seleccionados`}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" type="button" disabled={subiendoInfo} onClick={cerrarDialogInfo}>
                    Cancelar
                  </Button>
                  <Button type="button" disabled={subiendoInfo || archivosInfo.length === 0} onClick={subirInfo}>
                    {subiendoInfo
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Subiendo {progresoInfo ? `${progresoInfo.done}/${progresoInfo.total}` : ""}</>
                      : "Subir"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {cargando ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : errorCarga ? (
          <BloqueError mensaje={errorCarga} onReintentar={cargar} />
        ) : infos.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {readOnly
              ? "Todavía no tenés documentos de información cargados."
              : "Subí los primeros documentos de información para este asesor."}
          </div>
        ) : (
          <ul className="space-y-2">
            {infos.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{nombreVisible(doc.nombre)}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(doc.size_bytes)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" title="Descargar"
                    onClick={() => descargar(doc.file_path, doc.nombre)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!readOnly && (
                    <Button
                      variant="ghost" size="icon" title="Eliminar"
                      disabled={borrandoInfoId === doc.id}
                      onClick={() => borrarInfo(doc)}
                    >
                      {borrandoInfoId === doc.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default DocumentosDelAsesor;
