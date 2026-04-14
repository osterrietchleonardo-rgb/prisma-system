"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Trash2, Loader2, Image as ImageIcon, FileText, Calendar, ExternalLink, Download, Edit2, History as HistoryIcon, Search, Eye, Save } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface MarketingAd {
  id: string
  created_at: string
  copy_type: 'video' | 'post'
  angle: string
  content: any
  public_url?: string
  image_format?: string
  image_id?: string
}

export function MarketingHistory() {
  const [ads, setAds] = useState<MarketingAd[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [adToDelete, setAdToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedAd, setSelectedAd] = useState<MarketingAd | null>(null)
  const [isEditingMode, setIsEditingMode] = useState(false)
  const [editContent, setEditContent] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  const supabase = createClient()

  const fetchAds = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('copy_drafts')
        .select(`
          *,
          images:generated_images(id, public_url, format)
        `)
        .order('created_at', { ascending: false })
      
      if (error) throw error

      const formattedAds = data.map((d: any) => ({
        ...d,
        public_url: d.images?.[0]?.public_url,
        image_format: d.images?.[0]?.format,
        image_id: d.images?.[0]?.id
      }))

      setAds(formattedAds)
    } catch (error: any) {
      toast.error("Error al cargar el historial: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAds()
  }, [])

  const handleSaveEdit = async () => {
    if (!selectedAd || !editContent) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('copy_drafts')
        .update({ content: editContent })
        .eq('id', selectedAd.id)
      
      if (error) throw error
      
      toast.success("Anuncio actualizado correctamente")
      setAds(ads.map(a => a.id === selectedAd.id ? { ...a, content: editContent } : a))
      setSelectedAd({ ...selectedAd, content: editContent })
      setIsEditingMode(false)
    } catch (error: any) {
      toast.error("Error al guardar: " + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!adToDelete) return
    setIsDeleting(true)
    try {
      // First delete associated images if any (since we might not have cascade)
      await supabase.from('generated_images').delete().eq('draft_id', adToDelete)
      
      const { error } = await supabase
        .from('copy_drafts')
        .delete()
        .eq('id', adToDelete)
      
      if (error) throw error
      
      toast.success("Anuncio eliminado correctamente")
      setAds(ads.filter(a => a.id !== adToDelete))
    } catch (error: any) {
      toast.error("Error al eliminar: " + error.message)
    } finally {
      setIsDeleting(false)
      setAdToDelete(null)
    }
  }

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${filename}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      toast.error("Error al descargar la imagen")
    }
  }

  const filteredAds = ads.filter(ad => {
    const hook = ad.content?.hook?.toLowerCase() || ""
    const angle = ad.angle?.toLowerCase() || ""
    const searchTerm = search.toLowerCase()
    return hook.includes(searchTerm) || angle.includes(searchTerm)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por hook o ángulo..." 
            className="pl-10 h-10 rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
          <Loader2 className="w-10 h-10 text-accent animate-spin" />
          <p className="text-muted-foreground font-medium">Cargando galería de anuncios...</p>
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/10 rounded-3xl border border-dashed border-muted">
           <HistoryIcon className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
           <h3 className="text-xl font-bold">{search ? "No se encontraron resultados" : "Aún no tienes anuncios generados"}</h3>
           <p className="text-muted-foreground max-w-sm mt-2">
             Comienza el flujo de generación para ver tus piezas de marketing aquí.
           </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAds.map((ad) => (
            <Card key={ad.id} className="group border-accent/10 hover:border-accent/30 transition-all hover:shadow-xl hover:shadow-accent/5 bg-card/50 overflow-hidden flex flex-col">
              <div className="relative aspect-[16/9] bg-muted overflow-hidden">
                {ad.public_url ? (
                  <img 
                    src={ad.public_url} 
                    alt={ad.angle}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-10 h-10 opacity-20 mb-2" />
                      <span className="text-xs">Sin imagen generada</span>
                   </div>
                )}
                <div className="absolute top-2 left-2 flex gap-2">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur-md border-none text-[10px] font-bold uppercase">
                    {ad.copy_type === 'video' ? '🎬 Video' : '📸 Post'}
                  </Badge>
                  {ad.image_format && (
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur-md border-none text-[10px] font-bold uppercase">
                      {ad.image_format}
                    </Badge>
                  )}
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" className="rounded-full gap-2" onClick={() => setSelectedAd(ad)}>
                    <Eye className="w-4 h-4" /> Ver Detalles
                  </Button>
                </div>
              </div>

              <CardHeader className="p-4 space-y-1">
                <div className="flex justify-between items-start">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(ad.created_at), "d 'de' MMMM, HH:mm", { locale: es })}
                  </div>
                  <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setAdToDelete(ad.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-sm line-clamp-2 leading-relaxed">
                  {ad.content?.hook || ad.angle}
                </CardTitle>
                <CardDescription className="text-[11px] font-medium text-accent italic">
                  Ángulo: {ad.angle}
                </CardDescription>
              </CardHeader>

              <CardFooter className="p-4 pt-0 mt-auto flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs h-8 border-accent/20 hover:bg-accent/5 text-accent font-bold"
                  onClick={() => setSelectedAd(ad)}
                >
                  <FileText className="w-3 h-3 mr-1" /> Copy
                </Button>
                {ad.public_url && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => handleDownload(ad.public_url!, `prisma-ad-${ad.id}`)}
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Details View */}
      <Dialog open={!!selectedAd} onOpenChange={(open) => {
        if (!open) {
          setSelectedAd(null)
          setIsEditingMode(false)
          setEditContent(null)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-accent/20 scrollbar-hide">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-accent" />
              {isEditingMode ? "Editar Anuncio" : "Detalles del Anuncio"}
            </DialogTitle>
            <DialogDescription>
              Generado el {selectedAd && format(new Date(selectedAd.created_at), "PPP 'a las' HH:mm", { locale: es })}
            </DialogDescription>
          </DialogHeader>

          {selectedAd && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
              <div className="space-y-4">
                <div className="aspect-[4/5] md:aspect-auto md:h-[500px] w-full bg-muted rounded-3xl overflow-hidden shadow-2xl relative border border-accent/10">
                  {selectedAd.public_url ? (
                    <img 
                      src={selectedAd.public_url} 
                      className="w-full h-full object-cover"
                      alt="Art"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
                      <ImageIcon className="w-16 h-16 opacity-10 mb-4" />
                      <p className="text-sm opacity-50">No hay pieza visual generada para este anuncio.</p>
                    </div>
                  )}
                  {selectedAd.public_url && (
                    <div className="absolute bottom-4 right-4">
                      <Button onClick={() => handleDownload(selectedAd.public_url!, `prisma-full-${selectedAd.id}`)} className="rounded-full shadow-xl">
                        <Download className="w-4 h-4 mr-2" /> Descargar HD
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                 <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-accent mb-3">
                      {selectedAd.copy_type === 'video' ? 'Guión de Video' : 'Copy Persuasivo'}
                    </h4>
                    <div className="bg-muted/30 p-6 rounded-2xl border border-muted space-y-4">
                       {selectedAd.copy_type === 'video' ? (
                         // FIELDS FOR VIDEO
                         ['hook', 'problema', 'agitacion', 'solucion', 'cta'].map(field => (
                           <div key={field} className="space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase">{field}:</label>
                              {isEditingMode ? (
                                <textarea 
                                  value={editContent?.[field] || ""} 
                                  onChange={(e) => setEditContent({ ...editContent, [field]: e.target.value })}
                                  className="w-full bg-background border rounded-lg p-2 text-sm min-h-[60px]"
                                />
                              ) : (
                                <p className="text-sm font-medium leading-relaxed">{selectedAd.content?.[field]}</p>
                              )}
                           </div>
                         ))
                       ) : (
                         // FIELDS FOR POST
                         ['hook', 'desarrollo', 'cta'].map(field => (
                           <div key={field} className="space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase">
                                {field === 'desarrollo' ? 'Cuerpo / Beneficios' : field}:
                              </label>
                              {isEditingMode ? (
                                <textarea 
                                  value={editContent?.[field] || ""} 
                                  onChange={(e) => setEditContent({ ...editContent, [field]: e.target.value })}
                                  className="w-full bg-background border rounded-lg p-2 text-sm min-h-[80px]"
                                />
                              ) : (
                                <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", field === 'hook' || field === 'cta' ? "font-bold" : "text-muted-foreground")}>
                                  {selectedAd.content?.[field] || selectedAd.content?.['body']} 
                                </p>
                              )}
                           </div>
                         ))
                       )}
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-accent/5 p-4 rounded-xl border border-accent/10">
                       <p className="text-[10px] font-bold text-accent uppercase mb-1">Ángulo</p>
                       <p className="text-xs font-bold capitalize">{selectedAd.angle}</p>
                    </div>
                    <div className="bg-accent/5 p-4 rounded-xl border border-accent/10">
                       <p className="text-[10px] font-bold text-accent uppercase mb-1">Formato</p>
                       <p className="text-xs font-bold capitalize">{selectedAd.copy_type}</p>
                    </div>
                 </div>

                 <div className="flex gap-2">
                    {isEditingMode ? (
                      <>
                        <Button variant="outline" className="flex-1 font-bold" onClick={() => setIsEditingMode(false)}>
                          Cancelar
                        </Button>
                        <Button className="flex-1 font-bold bg-accent" onClick={handleSaveEdit} disabled={isSaving}>
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                          Guardar Cambios
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" className="flex-1 font-bold border-accent/20" onClick={() => {
                          setEditContent(selectedAd.content)
                          setIsEditingMode(true)
                        }}>
                          <Edit2 className="w-4 h-4 mr-2" /> Editar Texto
                        </Button>
                        <Button variant="destructive" size="icon" className="h-10 w-10" onClick={() => { setAdToDelete(selectedAd.id); setSelectedAd(null); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                 </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!adToDelete} onOpenChange={() => setAdToDelete(null)}>
        <DialogContent className="border-accent/20">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">¿Eliminar pieza publicitaria?</DialogTitle>
            <DialogDescription className="text-balance">
              Esta acción eliminará el copy y la imagen asociada de tu galería permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setAdToDelete(null)} className="font-bold">Cancelar</Button>
            <Button 
              onClick={handleDelete}
              disabled={isDeleting}
              variant="destructive"
              className="font-bold"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Sparkles(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}
