"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { 
  FileText, 
  Upload, 
  Search, 
  Trash2, 
  Eye, 
  Plus, 
  BookOpen,
  FileBadge,
  Loader2,
  ExternalLink,
  Video,
  Youtube,
  Lock,
  Users,
  CheckCircle2,
  AlertCircle,
  FileCheck
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
  DialogFooter
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export default function DocumentosPage() {
  const [documents, setDocuments] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState("")
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("all")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadType, setUploadType] = useState<"file" | "youtube">("file")
  
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
        .order("created_at", { ascending: false })

      if (error) throw error
      setDocuments(data || [])
    } catch (_error) {
      toast.error("Error al cargar documentos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUserAgency()
  }, [])

  useEffect(() => {
    if (agencyId) {
      fetchDocs(agencyId)
    }
  }, [agencyId])

  const handleProcess = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!agencyId) return

    const form = e.currentTarget
    const formData = new FormData(form)
    formData.append("agencyId", agencyId)

    try {
      setUploading(true)
      
      let res;
      if (uploadType === "file") {
        res = await fetch("/api/documents/process", {
          method: "POST",
          body: formData
        })
      } else {
        const body = {
          youtubeUrl: formData.get("youtubeUrl"),
          title: formData.get("title"),
          visibility: formData.get("visibility"),
          agencyId
        }
        res = await fetch("/api/documents/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
      }

      if (!res.ok) throw new Error(await res.text())

      toast.success(uploadType === "file" ? "Archivo procesado y guardado" : "Video transcrito y guardado")
      setIsUploadOpen(false)
      fetchDocs(agencyId)
    } catch (error: any) {
      toast.error("Error al procesar: " + error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string, path?: string) => {
    if (!confirm("¿Estás seguro de eliminar este recurso?") || !agencyId) return

    try {
      if (path) {
        await supabase.storage.from("documents").remove([path])
      }
      await supabase.from("agency_documents").delete().eq("id", id)
      toast.success("Eliminado correctamente")
      fetchDocs(agencyId)
    } catch (_error) {
      toast.error("Error al eliminar")
    }
  }

  const filteredDocs = documents.filter(d => {
    const matchesSearch = d.title?.toLowerCase().includes(search.toLowerCase()) || 
                         d.type?.toLowerCase().includes(search.toLowerCase())
    
    if (activeTab === "all") return matchesSearch
    return matchesSearch && d.visibility === activeTab
  })

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Biblioteca de Conocimiento
            <Badge className="bg-accent/10 text-accent border-accent/20">IA Powered</Badge>
          </h2>
          <p className="text-muted-foreground mt-1">
            Gestión inteligente de archivos, manuales y capacitaciones para tu agencia.
          </p>
        </div>
        
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90 gap-2 h-11 px-6 shadow-lg shadow-accent/20">
              <Plus className="h-5 w-5" />
              Nuevo Recurso
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-accent/20 sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                {uploadType === "file" ? <FileText className="text-accent" /> : <Youtube className="text-red-500" />}
                Agregar Recurso
              </DialogTitle>
              <DialogDescription>
                Los documentos y videos serán analizados por IA para permitir consultas inteligentes.
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as any)} className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1">
                <TabsTrigger value="file" className="data-[state=active]:bg-card data-[state=active]:text-accent">
                  <Upload className="h-4 w-4 mr-2" /> Archivo
                </TabsTrigger>
                <TabsTrigger value="youtube" className="data-[state=active]:bg-card data-[state=active]:text-red-500">
                  <Video className="h-4 w-4 mr-2" /> YouTube
                </TabsTrigger>
              </TabsList>

              <form onSubmit={handleProcess} className="space-y-5 py-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    Título del Recurso
                  </label>
                  <Input name="title" placeholder="Ej: Protocolo de Captación 2024" required />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Visibilidad</label>
                  <Select name="visibility" defaultValue="asesor">
                    <SelectTrigger className="bg-muted/30">
                      <SelectValue placeholder="Seleccionar visibilidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="director">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-orange-500" />
                          <span>Privado (Solo Directores)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="asesor">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-accent" />
                          <span>Público (Asesores y Directores)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {uploadType === "file" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Archivo (.pdf, .doc, .csv)</label>
                    <div className={cn(
                      "flex items-center justify-center border-2 border-dashed rounded-2xl p-10 hover:bg-accent/5 transition-all cursor-pointer relative group",
                      selectedFile ? "border-accent/40 bg-accent/5" : "border-accent/20"
                    )}>
                      <input 
                        type="file" 
                        name="file" 
                        accept=".pdf,.docx,.doc,.csv" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform",
                          selectedFile ? "bg-accent/20 scale-110" : "bg-accent/10"
                        )}>
                          {selectedFile ? <FileCheck className="h-6 w-6 text-accent" /> : <Upload className="h-6 w-6 text-accent" />}
                        </div>
                        {selectedFile ? (
                          <>
                            <p className="text-sm font-semibold text-accent">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB - Listo para subir</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium">Click o arrastra para subir</p>
                            <p className="text-xs text-muted-foreground mt-1">PDF, Word o CSV hasta 15MB</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">URL del Video de YouTube</label>
                    <div className="relative">
                      <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input name="youtubeUrl" placeholder="https://youtube.com/watch?v=..." className="pl-10" required />
                    </div>
                    <p className="text-[10px] text-muted-foreground">La IA transcribirá el contenido para indexarlo.</p>
                  </div>
                )}

                <DialogFooter className="pt-2">
                  <Button variant="ghost" type="button" onClick={() => setIsUploadOpen(false)} className="hover:bg-muted">
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-accent px-8 shadow-md shadow-accent/10" disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando con IA...
                      </>
                    ) : "Confirmar y Subir"}
                  </Button>
                </DialogFooter>
              </form>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/40 p-1 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg px-6">Todo</TabsTrigger>
            <TabsTrigger value="director" className="rounded-lg px-6 flex items-center gap-2">
              <Lock className="h-3 w-3" /> Mis Documentos
            </TabsTrigger>
            <TabsTrigger value="asesor" className="rounded-lg px-6 flex items-center gap-2">
              <Users className="h-3 w-3" /> Compartidos
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por título, contenido o IA tags..." 
            className="pl-10 bg-card/40 border-accent/10 focus-visible:ring-accent/30 rounded-xl h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-44 rounded-2xl w-full" />)}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-card/20 rounded-[2rem] border-2 border-dashed border-accent/5">
            <div className="w-20 h-20 rounded-full bg-accent/5 flex items-center justify-center mb-6">
              <FileBadge className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <p className="text-xl font-medium text-foreground">Sin resultados</p>
            <p className="text-sm text-muted-foreground mt-2">No hemos encontrado recursos que coincidan con tu búsqueda.</p>
            <Button variant="outline" className="mt-8 border-accent/20 hover:bg-accent/5" onClick={() => setSearch("")}>
              Limpiar filtros
            </Button>
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
                      {doc.type === "youtube" ? <Youtube className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    {doc.visibility === "director" ? (
                      <Badge variant="outline" className="bg-orange-500/5 text-orange-500 border-none px-2 py-0 h-6 flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Privado
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
                  {doc.content_text && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded-lg line-clamp-2 italic">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      Indexado por IA
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-accent/5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-accent/10 hover:text-accent transition-colors">
                        <Eye className="h-5 w-5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => handleDelete(doc.id, doc.file_url)}>
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                    {doc.file_url ? (
                      <Button variant="outline" size="sm" className="rounded-lg px-4 h-9 text-xs border-accent/20 bg-accent/5 hover:bg-accent hover:text-white transition-all duration-300" onClick={() => {
                        const { data } = supabase.storage.from("documents").getPublicUrl(doc.file_url);
                        window.open(data.publicUrl, "_blank");
                      }}>
                        Descargar <ExternalLink className="ml-1.5 h-3 w-3" />
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="rounded-lg px-4 h-9 text-xs border-red-500/20 bg-red-500/5 hover:bg-red-500 hover:text-white transition-all duration-300" onClick={() => window.open(doc.video_url, "_blank")}>
                        Ver en YT <ExternalLink className="ml-1.5 h-3 w-3" />
                      </Button>
                    )}
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


