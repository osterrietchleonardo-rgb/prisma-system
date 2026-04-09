"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { IpcForm } from "./ipc-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Plus, Edit2, Trash2, Target, Users, ArrowRight, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface IpcProfile {
  id: string
  nombre_perfil: string
  tipo_lead: string
  objetivo: string
  sub_objetivo?: string
  zona_geografica: string
  created_at: string
  formato_preferido?: string
  // ... other fields
}

export function IpcManager() {
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingIpc, setEditingIpc] = useState<any>(null)
  const [ipcs, setIpcs] = useState<IpcProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterObjective, setFilterObjective] = useState<string>("all")
  const [ipcToDelete, setIpcToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const supabase = createClient()

  const fetchIpcs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ipc_profiles')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      toast.error("Error al cargar los perfiles")
    } else {
      setIpcs(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchIpcs()
  }, [])

  const handleEdit = (ipc: any) => {
    setEditingIpc(ipc)
    setView('form')
  }

  const handleDelete = async () => {
    if (!ipcToDelete) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('ipc_profiles')
        .delete()
        .eq('id', ipcToDelete)
      
      if (error) throw error
      
      toast.success("Perfil eliminado correctamente")
      setIpcs(ipcs.filter(i => i.id !== ipcToDelete))
    } catch (error: any) {
      toast.error("Error al eliminar: " + error.message)
    } finally {
      setIsDeleting(false)
      setIpcToDelete(null)
    }
  }

  const handleSave = () => {
    setView('list')
    setEditingIpc(null)
    fetchIpcs()
  }

  const filteredIpcs = ipcs.filter(ipc => {
    const matchesSearch = ipc.nombre_perfil.toLowerCase().includes(search.toLowerCase()) ||
                         ipc.tipo_lead.toLowerCase().includes(search.toLowerCase())
    const matchesObjective = filterObjective === "all" || ipc.objetivo === filterObjective
    return matchesSearch && matchesObjective
  })

  if (view === 'form') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => { setView('list'); setEditingIpc(null); }} className="font-bold">
          <ArrowRight className="w-4 h-4 mr-2 rotate-180" /> Volver al listado
        </Button>
        <IpcForm initialData={editingIpc} onSave={handleSave} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nombre o tipo..." 
            className="pl-10 h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant={filterObjective === "all" ? "default" : "outline"}
            onClick={() => setFilterObjective("all")}
            size="sm"
            className="h-10"
          >
            Todos
          </Button>
          <Button 
            variant={filterObjective === "captacion" ? "default" : "outline"}
            onClick={() => setFilterObjective("captacion")}
            size="sm"
            className="h-10 border-amber-200 hover:bg-amber-50"
          >
            Captación
          </Button>
          <Button 
            variant={filterObjective === "comercializacion" ? "default" : "outline"}
            onClick={() => setFilterObjective("comercializacion")}
            size="sm"
            className="h-10 border-emerald-200 hover:bg-emerald-50"
          >
            Comercialización
          </Button>
        </div>
        <Button onClick={() => { setEditingIpc(null); setView('form'); }} className="h-10 gap-2">
          <Plus className="w-4 h-4" />
          Nuevo IPC
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
          <Loader2 className="w-10 h-10 text-accent animate-spin" />
          <p className="text-muted-foreground font-medium">Cargando tus perfiles IPC...</p>
        </div>
      ) : filteredIpcs.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/10 rounded-3xl border border-dashed border-muted">
           <Target className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
           <h3 className="text-xl font-bold">{search ? "No se encontraron resultados" : "Aún no tienes perfiles IPC"}</h3>
           <p className="text-muted-foreground max-w-sm mt-2">
             {search ? "Intenta con otros términos de búsqueda." : "Comienza creando tu primer Cliente Ideal para generar anuncios personalizados."}
           </p>
           {!search && (
             <Button variant="outline" onClick={() => setView('form')} className="mt-6 border-accent/20">
               <Plus className="w-4 h-4 mr-2" /> Crear mi primer IPC
             </Button>
           )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
          {filteredIpcs.map((ipc) => (
            <Card key={ipc.id} className="group border-accent/10 hover:border-accent/30 transition-all hover:shadow-xl hover:shadow-accent/5 bg-card/50 overflow-hidden">
              <div className={cn(
                "h-2 w-full",
                ipc.objetivo === 'captacion' ? "bg-amber-500" : "bg-emerald-500"
              )} />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-wrap gap-2">
                    <div className="px-2 py-1 rounded-md bg-accent/5 border border-accent/10 whitespace-nowrap">
                      <span className="text-[10px] font-bold text-accent uppercase">Objetivo:</span>
                      <span className="ml-1 text-[10px] lowercase">{ipc.objetivo}</span>
                    </div>
                    <div className="px-2 py-1 rounded-md bg-accent/5 border border-accent/10 whitespace-nowrap">
                      <span className="text-[10px] font-bold text-accent uppercase">Formato:</span>
                      <span className="ml-1 text-[10px] lowercase">{ipc.formato_preferido || 'No definido'}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-accent" onClick={() => handleEdit(ipc)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setIpcToDelete(ipc.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-lg line-clamp-1">{ipc.nombre_perfil}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {ipc.tipo_lead} • {ipc.zona_geografica}
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-0 pb-6 bg-transparent">
                <Button variant="ghost" className="w-full justify-between group/btn text-accent font-bold hover:bg-accent/5" onClick={() => handleEdit(ipc)}>
                  Ver detalles <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!ipcToDelete} onOpenChange={() => setIpcToDelete(null)}>
        <DialogContent className="border-accent/20">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">¿Estás completamente seguro?</DialogTitle>
            <DialogDescription className="text-balance">
              Esta acción no se puede deshacer. Se eliminará permanentemente el perfil IPC y no podrás usarlo para futuras generaciones.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setIpcToDelete(null)} className="font-bold">Cancelar</Button>
            <Button 
              onClick={handleDelete}
              disabled={isDeleting}
              variant="destructive"
              className="font-bold"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Sí, eliminar perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

