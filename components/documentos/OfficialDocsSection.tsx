"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  FileText,
  Upload,
  Search,
  Trash2,
  Plus,
  Loader2,
  Download,
  FolderPlus,
  Folder,
  FolderOpen,
  Pencil,
  FileCheck,
  RefreshCw,
  ShieldCheck,
  Lock,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface OfficialDocsSectionProps {
  /** true = vista de asesor (solo lectura/descarga). false/undefined = director (gestión completa). */
  readOnly?: boolean
}

const STORAGE_BUCKET = "documents"

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return ""
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function OfficialDocsSection({ readOnly = false }: OfficialDocsSectionProps) {
  const supabase = createClient()

  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const [folders, setFolders] = useState<Record<string, any>[]>([])
  const [documents, setDocuments] = useState<Record<string, any>[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | "all">("all")

  // Folder modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [folderToEdit, setFolderToEdit] = useState<Record<string, any> | null>(null)
  const [savingFolder, setSavingFolder] = useState(false)
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)

  // Upload modal
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)

  // Move modal
  const [movingDoc, setMovingDoc] = useState<Record<string, any> | null>(null)
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
  const [isUpdatingFolder, setIsUpdatingFolder] = useState(false)

  // Replace
  const [replacingDoc, setReplacingDoc] = useState<Record<string, any> | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const fetchUserAgency = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from("profiles")
        .select("agency_id")
        .eq("id", user.id)
        .single()
      if (profile?.agency_id) setAgencyId(profile.agency_id)
    } catch (error) {
      console.error("Error fetching agency:", error)
    }
  }

  const fetchFolders = async (id: string) => {
    const { data, error } = await supabase
      .from("official_document_folders")
      .select("*")
      .eq("agency_id", id)
      .order("name", { ascending: true })
    if (!error) setFolders(data || [])
  }

  const fetchDocs = async (id: string) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("official_documents")
        .select("*")
        .eq("agency_id", id)
        .order("created_at", { ascending: false })
      if (error) throw error
      setDocuments(data || [])
    } catch (_error) {
      toast.error("Error al cargar documentos oficiales")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUserAgency() }, [])
  useEffect(() => {
    if (agencyId) {
      fetchDocs(agencyId)
      fetchFolders(agencyId)
    }
  }, [agencyId])

  // ── Folders ──────────────────────────────────────────────
  const handleSaveFolder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!agencyId) return
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("description") as string
    try {
      setSavingFolder(true)
      if (folderToEdit) {
        const { error } = await supabase
          .from("official_document_folders")
          .update({ name, description })
          .eq("id", folderToEdit.id)
        if (error) throw error
        toast.success("Carpeta actualizada")
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
          .from("official_document_folders")
          .insert({ name, description, agency_id: agencyId, created_by: user?.id })
        if (error) throw error
        toast.success("Carpeta creada")
      }
      setIsFolderModalOpen(false)
      setFolderToEdit(null)
      fetchFolders(agencyId)
    } catch (error: any) {
      toast.error("Error con la carpeta: " + error.message)
    } finally {
      setSavingFolder(false)
    }
  }

  const handleDeleteFolder = async (id: string) => {
    if (!agencyId) return
    if (!confirm("¿Eliminar esta carpeta? Los archivos no se borran, quedan sin carpeta.")) return
    try {
      setDeletingFolder(id)
      await supabase.from("official_documents").update({ folder_id: null }).eq("folder_id", id)
      const { error } = await supabase.from("official_document_folders").delete().eq("id", id)
      if (error) throw error
      toast.success("Carpeta eliminada")
      if (selectedFolderId === id) setSelectedFolderId("all")
      fetchFolders(agencyId)
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al eliminar carpeta: " + error.message)
    } finally {
      setDeletingFolder(null)
    }
  }

  // ── Upload (uno o varios archivos a la vez) ──────────────
  // El título de cada documento toma el nombre de su archivo (sin la extensión).
  const titleFromFileName = (fileName: string) =>
    fileName.replace(/\.[^/.]+$/, "").trim() || fileName

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!agencyId) return
    if (selectedFiles.length === 0) {
      toast.error("Seleccioná al menos un archivo")
      return
    }
    const formData = new FormData(e.currentTarget)
    const folderId = formData.get("folderId") as string
    const targetFolderId = folderId && folderId !== "none" ? folderId : null

    try {
      setUploading(true)
      setUploadProgress({ done: 0, total: selectedFiles.length })
      const { data: { user } } = await supabase.auth.getUser()

      let okCount = 0
      const failed: string[] = []

      for (const file of selectedFiles) {
        const storagePath = `official/${agencyId}/${Date.now()}-${file.name}`
        try {
          const { error: storageError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, file, { upsert: false })
          if (storageError) throw storageError

          const { error: dbError } = await supabase.from("official_documents").insert({
            agency_id: agencyId,
            folder_id: targetFolderId,
            title: titleFromFileName(file.name),
            file_url: storagePath,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user?.id,
          })
          if (dbError) {
            // rollback del archivo si falla el insert
            await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
            throw dbError
          }
          okCount++
        } catch (_err) {
          failed.push(file.name)
        } finally {
          setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
        }
      }

      if (okCount > 0) {
        toast.success(
          okCount === 1 ? "Documento subido correctamente" : `${okCount} documentos subidos correctamente`
        )
      }
      if (failed.length > 0) {
        toast.error(`No se pudieron subir ${failed.length}: ${failed.join(", ")}`)
      }

      if (failed.length === 0) {
        setIsUploadOpen(false)
        setSelectedFiles([])
      }
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al subir: " + error.message)
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  // ── Replace (nueva versión) ─────────────────────────────
  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // permite re-seleccionar el mismo nombre
    if (!file || !replacingDoc || !agencyId) {
      setReplacingDoc(null)
      return
    }
    const doc = replacingDoc
    try {
      setUploading(true)
      const newPath = `official/${agencyId}/${Date.now()}-${file.name}`
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(newPath, file, { upsert: false })
      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from("official_documents")
        .update({
          file_url: newPath,
          file_type: file.type,
          file_size: file.size,
          version: (doc.version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id)
      if (dbError) {
        await supabase.storage.from(STORAGE_BUCKET).remove([newPath])
        throw dbError
      }

      // borrar la versión anterior del storage (reemplazo limpio)
      if (doc.file_url) {
        await supabase.storage.from(STORAGE_BUCKET).remove([doc.file_url])
      }

      toast.success("Versión actualizada correctamente")
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al reemplazar: " + error.message)
    } finally {
      setUploading(false)
      setReplacingDoc(null)
    }
  }

  // ── Move ─────────────────────────────────────────────────
  const handleMoveToFolder = async (folderId: string) => {
    if (!movingDoc || !agencyId) return
    try {
      setIsUpdatingFolder(true)
      const { error } = await supabase
        .from("official_documents")
        .update({ folder_id: folderId === "none" ? null : folderId })
        .eq("id", movingDoc.id)
      if (error) throw error
      toast.success("Documento movido")
      setIsMoveModalOpen(false)
      setMovingDoc(null)
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al mover: " + error.message)
    } finally {
      setIsUpdatingFolder(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async (doc: Record<string, any>) => {
    if (!agencyId) return
    if (!confirm("¿Eliminar este documento oficial? No se puede deshacer.")) return
    try {
      if (doc.file_url) {
        await supabase.storage.from(STORAGE_BUCKET).remove([doc.file_url])
      }
      const { error } = await supabase.from("official_documents").delete().eq("id", doc.id)
      if (error) throw error
      toast.success("Documento eliminado")
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al eliminar: " + error.message)
    }
  }

  const handleDownload = (doc: Record<string, any>) => {
    if (!doc.file_url) return
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(doc.file_url)
    window.open(data.publicUrl, "_blank")
  }

  const filteredDocs = documents.filter((d) => {
    const matchesSearch = d.title?.toLowerCase().includes(search.toLowerCase())
    const matchesFolder = selectedFolderId === "all" || d.folder_id === selectedFolderId
    return matchesSearch && matchesFolder
  })

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-accent" />
            Documentos Oficiales
          </h3>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Lock className="h-3.5 w-3.5" />
            {readOnly
              ? "Documentación oficial de la agencia. Solo lectura y descarga."
              : "Archivos oficiales para descarga. Esta sección NO es consultada por la IA."}
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-3">
            <Dialog open={isFolderModalOpen} onOpenChange={(o) => { setIsFolderModalOpen(o); if (!o) setFolderToEdit(null) }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-accent/20 hover:bg-accent/5 gap-2 h-11 px-6">
                  <FolderPlus className="h-5 w-5 text-accent" />
                  Nueva Carpeta
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-accent/20 sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                    {folderToEdit ? <Folder className="text-accent" /> : <FolderPlus className="text-accent" />}
                    {folderToEdit ? "Editar Carpeta" : "Crear Nueva Carpeta"}
                  </DialogTitle>
                  <DialogDescription>
                    Organizá los documentos oficiales en carpetas personalizadas.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSaveFolder} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Nombre de la Carpeta</label>
                    <Input name="name" placeholder="Ej: Reglamentos Internos" defaultValue={folderToEdit?.name || ""} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Descripción (Opcional)</label>
                    <Input name="description" placeholder="Ej: Normativa oficial de la agencia" defaultValue={folderToEdit?.description || ""} />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button variant="ghost" type="button" onClick={() => { setIsFolderModalOpen(false); setFolderToEdit(null) }}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-accent" disabled={savingFolder}>
                      {savingFolder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {folderToEdit ? "Guardar Cambios" : "Crear Carpeta"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isUploadOpen} onOpenChange={(o) => { if (uploading) return; setIsUploadOpen(o); if (!o) setSelectedFiles([]) }}>
              <DialogTrigger asChild>
                <Button className="bg-accent hover:bg-accent/90 gap-2 h-11 px-6 shadow-lg shadow-accent/20">
                  <Plus className="h-5 w-5" />
                  Subir Documentos
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-accent/20 sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="text-accent" />
                    Subir Documentos Oficiales
                  </DialogTitle>
                  <DialogDescription>
                    Podés subir uno o varios archivos a la vez. El nombre de cada documento se toma del archivo. Quedan disponibles para que los asesores los descarguen. No se procesan con IA.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpload} className="space-y-5 py-4 min-w-0">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Carpeta donde guardar</label>
                    <Select name="folderId" defaultValue={selectedFolderId === "all" ? "none" : selectedFolderId}>
                      <SelectTrigger className="bg-muted/30">
                        <SelectValue placeholder="Sin carpeta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin carpeta</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            <div className="flex items-center gap-2">
                              <Folder className="h-4 w-4 text-accent/60" />
                              <span>{f.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Todos los archivos seleccionados se guardan en esta carpeta.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Archivos</label>
                    <div className={cn(
                      "flex items-center justify-center border-2 border-dashed rounded-2xl p-8 hover:bg-accent/5 transition-all cursor-pointer relative group",
                      selectedFiles.length > 0 ? "border-accent/40 bg-accent/5" : "border-accent/20"
                    )}>
                      <input
                        type="file"
                        multiple
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                      />
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform",
                          selectedFiles.length > 0 ? "bg-accent/20 scale-110" : "bg-accent/10"
                        )}>
                          {selectedFiles.length > 0 ? <FileCheck className="h-6 w-6 text-accent" /> : <Upload className="h-6 w-6 text-accent" />}
                        </div>
                        {selectedFiles.length > 0 ? (
                          <>
                            <p className="text-sm font-semibold text-accent">
                              {selectedFiles.length === 1 ? "1 archivo seleccionado" : `${selectedFiles.length} archivos seleccionados`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Click o arrastrá para cambiar la selección</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium">Click o arrastrá para subir</p>
                            <p className="text-xs text-muted-foreground mt-1">Uno o varios archivos — cualquier formato, sin límite de tamaño</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Lista de archivos seleccionados */}
                    {selectedFiles.length > 0 && (
                      <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 rounded-xl border border-accent/10 bg-muted/20 p-2">
                        {selectedFiles.map((file, i) => (
                          <div key={`${file.name}-${i}`} className="flex w-full items-center gap-2 rounded-lg bg-card/60 px-3 py-2">
                            <FileText className="h-4 w-4 text-accent/70 shrink-0" />
                            <span className="text-xs font-medium truncate min-w-0 flex-1" title={file.name}>{titleFromFileName(file.name)}</span>
                            {formatBytes(file.size) && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                            )}
                            {!uploading && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <DialogFooter className="pt-2">
                    <Button variant="ghost" type="button" disabled={uploading} onClick={() => { setIsUploadOpen(false); setSelectedFiles([]) }}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-accent px-8" disabled={uploading || selectedFiles.length === 0}>
                      {uploading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Subiendo {uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : ""}...</>
                      ) : (
                        selectedFiles.length > 1 ? `Subir ${selectedFiles.length} Documentos` : "Subir Documento"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* hidden input para reemplazo */}
      {!readOnly && (
        <input ref={replaceInputRef} type="file" className="hidden" onChange={handleReplaceFile} />
      )}

      {/* Move modal */}
      {!readOnly && (
        <Dialog open={isMoveModalOpen} onOpenChange={setIsMoveModalOpen}>
          <DialogContent className="bg-card border-accent/20 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Folder className="text-accent" />
                Mover a Carpeta
              </DialogTitle>
              <DialogDescription>Elegí una carpeta para este documento.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <label className="text-sm font-semibold text-muted-foreground italic block">
                Documento: {movingDoc?.title}
              </label>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className={cn("justify-start gap-3 h-12 rounded-xl", !movingDoc?.folder_id && "border-accent bg-accent/5")}
                  onClick={() => handleMoveToFolder("none")}
                  disabled={isUpdatingFolder}
                >
                  <Folder className="h-4 w-4" /> Sin Carpeta (Raíz)
                </Button>
                {folders.map((folder) => (
                  <Button
                    key={folder.id}
                    variant="outline"
                    className={cn("justify-start gap-3 h-12 rounded-xl", movingDoc?.folder_id === folder.id && "border-accent bg-accent/5")}
                    onClick={() => handleMoveToFolder(folder.id)}
                    disabled={isUpdatingFolder}
                  >
                    <FolderOpen className="h-4 w-4 text-accent" /> {folder.name}
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsMoveModalOpen(false)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Toolbar: search + folders */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 py-2">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card/50 border-accent/20 rounded-xl h-10 w-full md:max-w-md"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
        <Button
          variant={selectedFolderId === "all" ? "secondary" : "ghost"}
          size="sm"
          className={cn("rounded-xl h-10 px-4 whitespace-nowrap gap-2",
            selectedFolderId === "all" ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-muted-foreground")}
          onClick={() => setSelectedFolderId("all")}
        >
          {selectedFolderId === "all" ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
          Todos
        </Button>
        {folders.map((folder) => (
          <div key={folder.id} className="flex items-center gap-1 group">
            <Button
              variant={selectedFolderId === folder.id ? "secondary" : "ghost"}
              size="sm"
              className={cn("rounded-xl h-10 px-4 whitespace-nowrap gap-2",
                selectedFolderId === folder.id ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-muted-foreground hover:bg-accent/5")}
              onClick={() => setSelectedFolderId(folder.id)}
            >
              {selectedFolderId === folder.id ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              {folder.name}
              <Badge variant="outline" className="ml-1 px-1.5 h-5 bg-background/50 border-none text-[10px]">
                {documents.filter((d) => d.folder_id === folder.id).length}
              </Badge>
            </Button>
            {!readOnly && selectedFolderId === folder.id && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-accent"
                  onClick={() => { setFolderToEdit(folder); setIsFolderModalOpen(true) }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteFolder(folder.id)} disabled={deletingFolder === folder.id}>
                  {deletingFolder === folder.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Grid */}
      <main className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-3xl bg-muted/50" />)}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center bg-muted/20 rounded-3xl border-2 border-dashed border-accent/10">
            <div className="w-20 h-20 bg-accent/5 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="h-10 w-10 text-accent/40" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">No hay documentos oficiales</h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              {readOnly
                ? "La dirección todavía no subió documentación oficial."
                : "Subí los primeros documentos oficiales de tu agencia para que los asesores puedan descargarlos."}
            </p>
            {!readOnly && (
              <Button variant="outline" className="mt-6 border-accent/20" onClick={() => setIsUploadOpen(true)}>
                Subir ahora
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocs.map((doc) => (
              <Card key={doc.id} className="group relative bg-card border-accent/10 hover:border-accent/30 hover:shadow-2xl hover:shadow-accent/5 transition-all duration-500 rounded-3xl overflow-hidden flex flex-col h-full">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="p-3 rounded-2xl bg-accent/10 text-accent">
                      <FileText className="h-6 w-6" />
                    </div>
                    {(doc.version || 1) > 1 && (
                      <Badge variant="outline" className="rounded-lg px-2 py-0 text-[10px] uppercase font-bold tracking-wider border-accent/20 text-accent bg-accent/5">
                        v{doc.version}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-4 line-clamp-2 text-lg font-bold group-hover:text-accent transition-colors">
                    {doc.title}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1 font-medium text-[11px]">
                    {doc.file_type?.split("/")[1]?.toUpperCase() || doc.file_url?.split(".").pop()?.toUpperCase() || "ARCHIVO"}
                    {formatBytes(doc.file_size) && <><span>•</span>{formatBytes(doc.file_size)}</>}
                    <span>•</span>
                    {format(new Date(doc.created_at), "dd MMM yyyy", { locale: es })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col pt-0">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {doc.folder_id && (
                      <Badge variant="secondary" className="bg-accent/5 text-accent border-accent/10 flex items-center gap-1.5 py-1 px-3 rounded-xl text-[10px]">
                        <Folder className="h-3 w-3" />
                        {folders.find((f) => f.id === doc.folder_id)?.name || "Carpeta"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-accent/5">
                    {!readOnly ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-accent/10 hover:text-accent transition-colors"
                          title="Mover a carpeta"
                          onClick={() => { setMovingDoc(doc); setIsMoveModalOpen(true) }}>
                          <FolderPlus className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-accent/10 hover:text-accent transition-colors"
                          title="Reemplazar por nueva versión"
                          disabled={uploading && replacingDoc?.id === doc.id}
                          onClick={() => { setReplacingDoc(doc); replaceInputRef.current?.click() }}>
                          {uploading && replacingDoc?.id === doc.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Eliminar"
                          onClick={() => handleDelete(doc)}>
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    ) : <span />}
                    <Button variant="outline" size="sm"
                      className="rounded-lg px-4 h-9 text-xs border-accent/20 bg-accent/5 hover:bg-accent hover:text-white transition-all duration-300"
                      onClick={() => handleDownload(doc)}>
                      Descargar <Download className="ml-1.5 h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
