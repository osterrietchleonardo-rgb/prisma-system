"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { 
  FileText, 
  Search, 
  Eye, 
  BookOpen,
  FileBadge,
  ExternalLink,
  Video,

  Users,
  CheckCircle2,
  FolderPlus,
  Folder,
  ChevronRight,
  FolderOpen,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Sparkles,
  Lock
} from "lucide-react"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useRouter } from "next/navigation"

export default function AsesorDocumentosPage() {
  const [documents, setDocuments] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [agencyId, setAgencyId] = useState<string | null>(null)
  
  // Folders State
  const [folders, setFolders] = useState<Record<string, any>[]>([])
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | "all">("all")
  const [folderToEdit, setFolderToEdit] = useState<Record<string, any> | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)
  
  // Folder Management State
  const [movingDoc, setMovingDoc] = useState<Record<string, any> | null>(null)
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
  const [isUpdatingFolder, setIsUpdatingFolder] = useState(false)
  
  const router = useRouter()
  
  const supabase = createClient()

  const fetchUserAgency = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("agency_id")
        .eq("id", user.id)
        .single()

      if (profile?.agency_id) {
        setAgencyId(profile.agency_id)
      }
    } catch (error) {
      console.error("Error fetching agency:", error)
    }
  }

  const fetchDocs = async (id: string) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("agency_documents")
        .select("*")
        .eq("agency_id", id)
        .or('visibility.eq.asesor,and(visibility.eq.director,ai_enabled.eq.true)')
        .order("created_at", { ascending: false })

      if (error) throw error
      setDocuments(data || [])
    } catch (_error) {
      console.error("Error fetching library:", _error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFolders = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from("document_folders")
        .select("*")
        .eq("agency_id", id)
        .order("name", { ascending: true })

      if (error) throw error
      setFolders(data || [])
    } catch (_error) {
      console.error("Error fetching folders:", _error)
    }
  }

  useEffect(() => {
    fetchUserAgency()
  }, [])

  useEffect(() => {
    if (agencyId) {
      fetchDocs(agencyId)
      fetchFolders(agencyId)
    }
  }, [agencyId])

  const handleCreateFolder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!agencyId) return

    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("description") as string

    try {
      setCreatingFolder(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from("document_folders")
        .insert({
          name,
          description,
          agency_id: agencyId,
          created_by: user.id
        })

      if (error) throw error

      toast.success("Carpeta creada correctamente")
      setIsFolderModalOpen(false)
      fetchFolders(agencyId)
    } catch (error: any) {
      toast.error("Error al crear carpeta: " + error.message)
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleUpdateFolder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!agencyId || !folderToEdit) return

    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("description") as string

    try {
      setCreatingFolder(true)
      const { error } = await supabase
        .from("document_folders")
        .update({
          name,
          description
        })
        .eq("id", folderToEdit.id)

      if (error) throw error

      toast.success("Carpeta actualizada correctamente")
      setIsFolderModalOpen(false)
      setFolderToEdit(null)
      fetchFolders(agencyId)
    } catch (error: any) {
      toast.error("Error al actualizar carpeta: " + error.message)
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta carpeta? Los documentos no se borrarán, solo quedarán sin carpeta.") || !agencyId) return

    try {
      setDeletingFolder(id)
      
      // First, null out folder_id for documents in this folder
      await supabase
        .from("agency_documents")
        .update({ folder_id: null })
        .eq("folder_id", id)

      // Then delete the folder
      const { error } = await supabase
        .from("document_folders")
        .delete()
        .eq("id", id)

      if (error) throw error

      toast.success("Carpeta eliminada")
      if (selectedFolderId === id) setSelectedFolderId("all")
      fetchFolders(agencyId)
    } catch (error: any) {
      toast.error("Error al eliminar carpeta: " + error.message)
    } finally {
      setDeletingFolder(null)
    }
  }

  const handleMoveToFolder = async (folderId: string) => {
    if (!movingDoc || !agencyId) return

    try {
      setIsUpdatingFolder(true)
      const { error } = await supabase
        .from("agency_documents")
        .update({ folder_id: folderId === "none" ? null : folderId })
        .eq("id", movingDoc.id)

      if (error) throw error

      toast.success("Documento movido correctamente")
      setIsMoveModalOpen(false)
      setMovingDoc(null)
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al mover documento: " + error.message)
    } finally {
      setIsUpdatingFolder(false)
    }
  }

  const filteredDocs = documents.filter(d => {
    const matchesSearch = d.title?.toLowerCase().includes(search.toLowerCase()) || 
                         d.type?.toLowerCase().includes(search.toLowerCase())
    
    const matchesFolder = selectedFolderId === "all" || d.folder_id === selectedFolderId
    
    return matchesSearch && matchesFolder
  })

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Biblioteca Digital
            <Badge className="bg-accent/10 text-accent border-accent/20">Recursos Compartidos</Badge>
          </h2>
          <p className="text-muted-foreground mt-1">
            Material de consulta, manuales y capacitaciones compartidas por la dirección.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog open={isFolderModalOpen} onOpenChange={setIsFolderModalOpen}>
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
                  {folderToEdit ? "Modifica el nombre o descripción de la carpeta." : "Organiza los recursos compartidos en carpetas personalizadas."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={folderToEdit ? handleUpdateFolder : handleCreateFolder} className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Nombre de la Carpeta</label>
                  <Input name="name" placeholder="Ej: Manuales de Venta" defaultValue={folderToEdit?.name || ""} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Descripción (Opcional)</label>
                  <Input name="description" placeholder="Ej: Guías paso a paso para asesores" defaultValue={folderToEdit?.description || ""} />
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="ghost" type="button" onClick={() => {
                    setIsFolderModalOpen(false)
                    setFolderToEdit(null)
                  }}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-accent" disabled={creatingFolder}>
                    {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {folderToEdit ? "Guardar Cambios" : "Crear Carpeta"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>


          <Dialog open={isMoveModalOpen} onOpenChange={setIsMoveModalOpen}>
            <DialogContent className="bg-card border-accent/20 sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                  <Folder className="text-accent" />
                  Mover a Carpeta
                </DialogTitle>
                <DialogDescription>
                  Selecciona una carpeta para organizar este documento.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-muted-foreground italic mb-2 block">
                    Documento: {movingDoc?.title}
                  </label>
                  <div className="grid gap-2">
                    <Button 
                      variant="outline" 
                      className={cn(
                        "justify-start gap-3 h-12 rounded-xl",
                        !movingDoc?.folder_id && "border-accent bg-accent/5"
                      )}
                      onClick={() => handleMoveToFolder("none")}
                      disabled={isUpdatingFolder}
                    >
                      <Folder className="h-4 w-4" />
                      Sin Carpeta (Raíz)
                    </Button>
                    {folders.map((folder) => (
                      <Button
                        key={folder.id}
                        variant="outline"
                        className={cn(
                          "justify-start gap-3 h-12 rounded-xl",
                          movingDoc?.folder_id === folder.id && "border-accent bg-accent/5"
                        )}
                        onClick={() => handleMoveToFolder(folder.id)}
                        disabled={isUpdatingFolder}
                      >
                        <FolderOpen className="h-4 w-4 text-accent" />
                        {folder.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsMoveModalOpen(false)}>
                  Cancelar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar recursos por título o contenido..." 
            className="pl-10 bg-card/40 border-accent/10 focus-visible:ring-accent/30 rounded-xl h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Folders Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 custom-scrollbar no-scrollbar">
        <Button
          variant={selectedFolderId === "all" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "rounded-xl h-10 px-4 whitespace-nowrap gap-2",
            selectedFolderId === "all" ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-muted-foreground"
          )}
          onClick={() => setSelectedFolderId("all")}
        >
          {selectedFolderId === "all" ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
          Todos los Archivos
        </Button>
        {folders.map(folder => (
          <div key={folder.id} className="flex items-center gap-1 group">
            <Button
              variant={selectedFolderId === folder.id ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "rounded-xl h-10 px-4 whitespace-nowrap gap-2",
                selectedFolderId === folder.id ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-muted-foreground hover:bg-accent/5 hover:text-accent/80"
              )}
              onClick={() => setSelectedFolderId(folder.id)}
            >
              {selectedFolderId === folder.id ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              {folder.name}
              <Badge variant="outline" className="ml-1 px-1.5 h-5 bg-background/50 border-none text-[10px]">
                {documents.filter(d => d.folder_id === folder.id).length}
              </Badge>
            </Button>
            {selectedFolderId === folder.id && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-accent"
                  onClick={() => {
                    setFolderToEdit(folder)
                    setIsFolderModalOpen(true)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteFolder(folder.id)}
                  disabled={deletingFolder === folder.id}
                >
                  {deletingFolder === folder.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-44 rounded-2xl w-full" />)}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-card/20 rounded-[2rem] border-2 border-dashed border-accent/5">
            <div className="w-20 h-20 rounded-full bg-accent/5 flex items-center justify-center mb-6">
              <BookOpen className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <p className="text-xl font-medium text-foreground">Sin recursos disponibles</p>
            <p className="text-sm text-muted-foreground mt-2">Aún no se han compartido documentos con tu perfil.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDocs.map((doc) => (
              <Card key={doc.id} className="group border-accent/10 bg-card/30 backdrop-blur-xl hover:border-accent/40 transition-all hover:shadow-2xl hover:shadow-accent/5 overflow-hidden flex flex-col rounded-2xl">
                <CardHeader className="p-5 pb-0">
                  <div className="flex justify-between items-start">
                    <div className={cn(
                      "p-2.5 rounded-xl",
                      doc.type === "youtube" ? "bg-red-500/10 text-red-500" : "bg-accent/10 text-accent"
                    )}>
                      {doc.type === "youtube" ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    {doc.visibility === "director" ? (
                      <Badge variant="outline" className="bg-violet-500/5 text-violet-400 border-violet-500/20 px-2 py-0 h-6 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Consultable via IA
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-accent/5 text-accent border-none px-2 py-0 h-6 flex items-center gap-1">
                        <Users className="h-3 w-3" /> Compartido
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-5 text-base font-bold line-clamp-2 leading-tight min-h-[40px] group-hover:text-accent transition-colors duration-300">
                    {doc.title}
                  </CardTitle>
                  <CardDescription className="text-[11px] flex items-center gap-2 mt-2 font-medium">
                    {format(new Date(doc.created_at), "d MMM, yyyy", { locale: es })}
                    <span>•</span>
                    <span className="uppercase text-accent font-bold tracking-wider">
                      {doc.type === "youtube" ? "VIDEO" : doc.file_url?.split(".").pop()?.toUpperCase() || "DOC"}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 flex-1 flex flex-col">
                  {doc.visibility === "director" ? (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-violet-300 bg-violet-500/10 p-2.5 rounded-lg border border-violet-500/20">
                      <Lock className="h-3 w-3 shrink-0" />
                      <span>Documento privado — consulta disponible a través de <strong>Tutor IA</strong></span>
                    </div>
                  ) : doc.content_text && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded-lg line-clamp-2 italic">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      Indexado para Consultas
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-accent/5">
                    {doc.visibility !== "director" && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 rounded-lg hover:bg-accent/10 hover:text-accent transition-colors"
                        onClick={() => {
                          setMovingDoc(doc)
                          setIsMoveModalOpen(true)
                        }}
                      >
                        <FolderPlus className="h-5 w-5" />
                      </Button>
                    )}
                    
                    <div className="flex gap-2 ml-auto">
                      {doc.visibility === "director" ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-lg px-4 h-9 text-xs border-violet-500/20 bg-violet-500/5 hover:bg-violet-500 hover:text-white transition-all duration-300 gap-1.5" 
                          onClick={() => router.push("/asesor/tutor-ia")}
                        >
                          <Sparkles className="h-3 w-3" /> Consultar con IA
                        </Button>
                      ) : doc.file_url ? (
                        <Button variant="outline" size="sm" className="rounded-lg px-4 h-9 text-xs border-accent/20 bg-accent/5 hover:bg-accent hover:text-white transition-all duration-300" onClick={() => {
                          const { data } = supabase.storage.from("documents").getPublicUrl(doc.file_url);
                          window.open(data.publicUrl, "_blank");
                        }}>
                          Abrir <ExternalLink className="ml-1.5 h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="rounded-lg px-4 h-9 text-xs border-red-500/20 bg-red-500/5 hover:bg-red-500 hover:text-white transition-all duration-300" onClick={() => window.open(doc.video_url, "_blank")}>
                          YT <ExternalLink className="ml-1.5 h-3 w-3" />
                        </Button>
                      )}
                    </div>
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
