"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Trash2, Loader2, Image as ImageIcon, FileText, Calendar, Download, Edit2, History as HistoryIcon, Search, Eye, Save, Copy } from "lucide-react"
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
  session_id?: string
}

interface AdGroup {
  groupId: string;
  created_at: string;
  variants: MarketingAd[];
}

export function MarketingHistory() {
  const [adGroups, setAdGroups] = useState<AdGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // Delete states
  const [variantToDelete, setVariantToDelete] = useState<string | null>(null)
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Edit states
  const [selectedGroup, setSelectedGroup] = useState<AdGroup | null>(null)
  const [activeVariantIndex, setActiveVariantIndex] = useState(0)
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

      const formattedAds: MarketingAd[] = data.map((d: any) => ({
        ...d,
        public_url: d.images?.[0]?.public_url,
        image_format: d.images?.[0]?.format,
        image_id: d.images?.[0]?.id
      }))

      // Combine by session_id or id
      const groupsMap = new Map<string, AdGroup>()
      for (const ad of formattedAds) {
        const key = ad.session_id || ad.id
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { groupId: key, created_at: ad.created_at, variants: [] })
        }
        groupsMap.get(key)!.variants.push(ad)
      }

      setAdGroups(Array.from(groupsMap.values()))
    } catch (error: any) {
      toast.error("Error al cargar el historial: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAds()
    
    const reloadHandler = () => fetchAds()
    window.addEventListener('generation-complete', reloadHandler)
    return () => window.removeEventListener('generation-complete', reloadHandler)
  }, [])

  const handleSaveEdit = async () => {
    if (!selectedGroup) return
    const activeVariant = selectedGroup.variants[activeVariantIndex]
    if (!activeVariant || !editContent) return
    
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('copy_drafts')
        .update({ content: editContent })
        .eq('id', activeVariant.id)
      
      if (error) throw error
      
      toast.success("Variante actualizada correctamente")
      fetchAds() // quick refetch to sync all states
      setSelectedGroup(prev => {
        if(!prev) return prev;
        const newV = [...prev.variants];
        newV[activeVariantIndex] = { ...newV[activeVariantIndex], content: editContent };
        return { ...prev, variants: newV };
      })
      setIsEditingMode(false)
    } catch (error: any) {
      toast.error("Error al guardar: " + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteVariant = async () => {
    if (!variantToDelete) return
    setIsDeleting(true)
    try {
      await supabase.from('generated_images').delete().eq('draft_id', variantToDelete)
      const { error } = await supabase.from('copy_drafts').delete().eq('id', variantToDelete)
      if (error) throw error
      
      toast.success("Variante eliminada")
      if (selectedGroup) {
        if (selectedGroup.variants.length === 1) {
          setSelectedGroup(null)
        } else {
          setActiveVariantIndex(0) // reset
        }
      }
      fetchAds()
    } catch (error: any) {
      toast.error("Error al eliminar variante: " + error.message)
    } finally {
      setIsDeleting(false)
      setVariantToDelete(null)
    }
  }

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return
    setIsDeleting(true)
    try {
      // Find the group
      const group = adGroups.find(g => g.groupId === groupToDelete)
      if (!group) return

      for (const variant of group.variants) {
        await supabase.from('generated_images').delete().eq('draft_id', variant.id)
        await supabase.from('copy_drafts').delete().eq('id', variant.id)
      }
      toast.success("Conjunto de creativos eliminado")
      fetchAds()
    } catch (error: any) {
      toast.error("Error al eliminar el conjunto: " + error.message)
    } finally {
      setIsDeleting(false)
      setGroupToDelete(null)
      setSelectedGroup(null) // Just in case we were viewing it
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

  const handleCopyText = (content: any) => {
    let txt = ""
    if (content.hook) txt += content.hook + "\n\n"
    if (content.problema) txt += content.problema + "\n"
    if (content.agitacion) txt += content.agitacion + "\n"
    if (content.solucion) txt += content.solucion + "\n\n"
    if (content.desarrollo) txt += content.desarrollo + "\n\n"
    if (content.cta) txt += content.cta
    
    navigator.clipboard.writeText(txt).then(() => toast.success("Texto copiado al portapapeles"))
  }

  const filteredGroups = adGroups.filter(grp => {
    const searchTerm = search.toLowerCase()
    return grp.variants.some(ad => {
      const hook = ad.content?.hook?.toLowerCase() || ""
      const angle = ad.angle?.toLowerCase() || ""
      return hook.includes(searchTerm) || angle.includes(searchTerm)
    })
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
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/10 rounded-3xl border border-dashed border-muted">
           <HistoryIcon className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
           <h3 className="text-xl font-bold">{search ? "No se encontraron resultados" : "Aún no tienes anuncios generados"}</h3>
           <p className="text-muted-foreground max-w-sm mt-2">
             Ve a 'Crear Anuncio' para generar tus creatividades de marketing.
           </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group) => {
            const primaryAd = group.variants[0]
            if (!primaryAd) return null;

            return (
            <Card key={group.groupId} className="group border-accent/10 hover:border-accent/30 transition-all hover:shadow-xl hover:shadow-accent/5 bg-card/50 overflow-hidden flex flex-col pt-0">
              <div className="w-full flex items-center justify-between p-2 bg-gradient-to-br from-accent/5 to-accent/10 border-b border-accent/10">
                <span className="text-[10px] font-bold text-accent px-2">SESIÓN DE GENERACIÓN</span>
                <span className="text-[10px] bg-accent text-accent-foreground px-2 py-0.5 rounded font-black">
                  {group.variants.length} VARIANTES
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive text-muted-foreground" onClick={() => setGroupToDelete(group.groupId)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              <div className="relative aspect-[16/9] bg-muted overflow-hidden">
                {primaryAd.public_url ? (
                  <div className="w-full h-full flex overflow-x-hidden snap-x snap-mandatory">
                    {group.variants.map((v, i) => (
                      <div key={v.id} className="min-w-full h-full snap-start relative">
                        {v.public_url ? (
                          <img src={v.public_url} alt={v.angle} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground">
                            <ImageIcon className="w-8 h-8 opacity-20 mb-2" />
                            <span className="text-xs">V{i+1}: Sin imagen</span>
                          </div>
                        )}
                        <span className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded">
                          V{i+1} : {v.angle}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-10 h-10 opacity-20 mb-2" />
                      <span className="text-xs">Sin imágenes generadas</span>
                   </div>
                )}
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" className="rounded-full gap-2 bg-accent hover:bg-accent/90" onClick={() => {
                    setSelectedGroup(group);
                    setActiveVariantIndex(0);
                  }}>
                    <Eye className="w-4 h-4" /> Inspeccionar Variantes
                  </Button>
                </div>
              </div>

              <CardHeader className="p-4 space-y-1">
                <div className="flex justify-between items-start">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(group.created_at), "d 'de' MMMM, HH:mm", { locale: es })}
                  </div>
                </div>
                <CardTitle className="text-sm line-clamp-2 leading-relaxed">
                  {primaryAd.content?.hook || "Generación de Marketing"}
                </CardTitle>
                <div className="flex flex-wrap gap-1 mt-2">
                    {group.variants.map((v, idx) => (
                      <Badge key={v.id} variant="outline" className="text-[9px] capitalize px-1 py-0 border-accent/20">
                        V{idx+1} {v.angle.slice(0, 10)}...
                      </Badge>
                    ))}
                </div>
              </CardHeader>

            </Card>
          )})}
        </div>
      )}

      {/* Details View */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => {
        if (!open) {
          setSelectedGroup(null)
          setIsEditingMode(false)
          setEditContent(null)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-accent/20 scrollbar-hide">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-accent" />
              Conjunto de Variantes 
            </DialogTitle>
            <DialogDescription>
              Generado el {selectedGroup && format(new Date(selectedGroup.created_at), "PPP 'a las' HH:mm", { locale: es })}
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-4 py-4">
              {/* TABS FOR VARIANTS */}
              <div className="flex gap-2 overflow-x-auto pb-2 border-b border-accent/10">
                {selectedGroup.variants.map((v, i) => (
                  <Button 
                    key={v.id} 
                    variant={i === activeVariantIndex ? 'default' : 'outline'}
                    className={cn("whitespace-nowrap transition-all", i === activeVariantIndex ? "bg-accent text-accent-foreground shadow-md" : "hover:border-accent")}
                    onClick={() => {
                      setActiveVariantIndex(i)
                      setIsEditingMode(false)
                    }}
                  >
                    Variante {i + 1}: <span className="capitalize ml-1">{v.angle.split('_').join(' ')}</span>
                  </Button>
                ))}
              </div>

              {selectedGroup.variants[activeVariantIndex] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="space-y-4">
                    <div className="aspect-[4/5] md:aspect-auto md:h-[500px] w-full bg-muted rounded-3xl overflow-hidden shadow-2xl relative border border-accent/10">
                      {selectedGroup.variants[activeVariantIndex].public_url ? (
                        <img 
                          src={selectedGroup.variants[activeVariantIndex].public_url} 
                          className="w-full h-full object-cover"
                          alt="Art"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
                          <ImageIcon className="w-16 h-16 opacity-10 mb-4" />
                          <p className="text-sm opacity-50">Generación de imagen fallida o pendiente.</p>
                        </div>
                      )}
                      {selectedGroup.variants[activeVariantIndex].public_url && (
                        <div className="absolute bottom-4 right-4">
                          <Button onClick={() => handleDownload(selectedGroup.variants[activeVariantIndex].public_url!, `prisma-v${activeVariantIndex+1}-${selectedGroup.variants[activeVariantIndex].id}`)} className="rounded-full shadow-xl bg-black/80 hover:bg-black text-white hover:text-white border-0">
                            <Download className="w-4 h-4 mr-2" /> Descargar HD
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6 flex flex-col">
                    <div className="flex justify-between items-center bg-accent/5 p-3 rounded-xl border border-accent/10">
                       <div>
                          <p className="text-[10px] font-bold text-accent uppercase">Formato</p>
                          <p className="text-xs font-bold capitalize">{selectedGroup.variants[activeVariantIndex].copy_type}</p>
                       </div>
                       <div>
                          <Button variant="ghost" size="sm" className="h-8 group hover:bg-accent/10" onClick={() => handleCopyText(selectedGroup.variants[activeVariantIndex].content)}>
                            <Copy className="w-3.5 h-3.5 mr-2 text-accent group-hover:text-accent" /> 
                            Copiar Todo
                          </Button>
                       </div>
                    </div>

                    <div className="flex-1">
                        <div className="bg-muted/30 p-6 rounded-2xl border border-muted space-y-4 h-full">
                          {selectedGroup.variants[activeVariantIndex].copy_type === 'video' ? (
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
                                    <p className="text-sm font-medium leading-relaxed">{selectedGroup.variants[activeVariantIndex].content?.[field]}</p>
                                  )}
                              </div>
                            ))
                          ) : (
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
                                    <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", field === 'hook' || field === 'cta' ? "font-bold text-foreground" : "text-muted-foreground")}>
                                      {selectedGroup.variants[activeVariantIndex].content?.[field] || selectedGroup.variants[activeVariantIndex].content?.['body']} 
                                    </p>
                                  )}
                              </div>
                            ))
                          )}
                        </div>
                    </div>

                    <div className="flex gap-2 mt-auto pt-2">
                        {isEditingMode ? (
                          <>
                            <Button variant="outline" className="flex-1 font-bold" onClick={() => setIsEditingMode(false)}>
                              Cancelar
                            </Button>
                            <Button className="flex-1 font-bold bg-accent hover:bg-accent/90" onClick={handleSaveEdit} disabled={isSaving}>
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                              Guardar Cambios
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" className="flex-1 font-bold border-accent/20" onClick={() => {
                              setEditContent(selectedGroup.variants[activeVariantIndex].content)
                              setIsEditingMode(true)
                            }}>
                              <Edit2 className="w-4 h-4 mr-2" /> Editar Variante
                            </Button>
                            <Button variant="destructive" className="font-bold flex-1" onClick={() => setVariantToDelete(selectedGroup.variants[activeVariantIndex].id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Borrar Variante
                            </Button>
                          </>
                        )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Single Variant Confirmation */}
      <Dialog open={!!variantToDelete} onOpenChange={() => setVariantToDelete(null)}>
        <DialogContent className="border-accent/20">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">¿Eliminar esta Variante?</DialogTitle>
            <DialogDescription>
              Se borrará permanentemente este copy y su imagen, conservando las demás variantes del conjunto.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setVariantToDelete(null)}>Cancelar</Button>
            <Button onClick={handleDeleteVariant} disabled={isDeleting} variant="destructive">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <Dialog open={!!groupToDelete} onOpenChange={() => setGroupToDelete(null)}>
        <DialogContent className="border-destructive/20 border-2">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-destructive flex items-center gap-2">
               <Trash2 className="w-5 h-5" /> ¿Eliminar Conjunto Entero?
            </DialogTitle>
            <DialogDescription>
              Vas a eliminar TODAS las variantes generadas en esta sesión (texto e imágenes HD). Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setGroupToDelete(null)}>Cancelar</Button>
            <Button onClick={handleDeleteGroup} disabled={isDeleting} variant="destructive">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Sí, eliminar todas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
