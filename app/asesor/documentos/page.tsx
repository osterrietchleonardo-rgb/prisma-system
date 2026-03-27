"use client"

import { useState, useEffect } from "react"
import { 
  FileText, 
  Search, 
  Eye, 
  BookOpen,
  FileBadge,
  ExternalLink,
  Video,
  Youtube,
  Users,
  CheckCircle2
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export default function AsesorDocumentosPage() {
  const [documents, setDocuments] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [agencyId, setAgencyId] = useState<string | null>(null)
  
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
        .eq("visibility", "asesor") // Only shared docs
        .order("created_at", { ascending: false })

      if (error) throw error
      setDocuments(data || [])
    } catch (_error) {
      toast.error("Error al cargar biblioteca")
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

  const filteredDocs = documents.filter(d => 
    d.title?.toLowerCase().includes(search.toLowerCase()) || 
    d.type?.toLowerCase().includes(search.toLowerCase())
  )

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
      </div>

      <div className="relative w-full max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar recursos por título o contenido..." 
          className="pl-10 bg-card/40 border-accent/10 focus-visible:ring-accent/30 rounded-xl h-11"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                      {doc.type === "youtube" ? <Youtube className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <Badge variant="outline" className="bg-accent/5 text-accent border-none px-2 py-0 h-6 flex items-center gap-1">
                      <Users className="h-3 w-3" /> Compartido
                    </Badge>
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
                      Indexado para Consultas
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-accent/5">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-accent/10 hover:text-accent transition-colors">
                      <Eye className="h-5 w-5" />
                    </Button>
                    
                    {doc.file_url ? (
                      <Button variant="outline" size="sm" className="rounded-lg px-4 h-9 text-xs border-accent/20 bg-accent/5 hover:bg-accent hover:text-white transition-all duration-300" onClick={() => {
                        const { data } = supabase.storage.from("documents").getPublicUrl(doc.file_url);
                        window.open(data.publicUrl, "_blank");
                      }}>
                        Abrir Recurso <ExternalLink className="ml-1.5 h-3 w-3" />
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

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
