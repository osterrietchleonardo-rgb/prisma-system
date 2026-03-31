"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Building, MapPin, Ruler, Bath, BedDouble, ArrowRight, Loader2 } from "lucide-react"
import { TokkoProperty } from "@/types/marketing-ia"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface PropertySelectorProps {
  onSelect: (property: TokkoProperty | null) => void;
  onContinue: () => void;
}

export function PropertySelector({ onSelect, onContinue }: PropertySelectorProps) {
  const [query, setQuery] = useState("")
  const [properties, setProperties] = useState<TokkoProperty[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  
  const [propertyType, setPropertyType] = useState("0") // Todos
  const [operationType, setOperationType] = useState("1") // Venta

  const searchProperties = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        query,
        property_type: propertyType,
        operation_type: operationType
      })
      const res = await fetch(`/api/marketing-ia/tokko-search?${params}`)
      if (!res.ok) throw new Error("Error en la búsqueda")
      const data = await res.json()
      setProperties(data)
      if (data.length === 0) toast.info("No se encontraron propiedades")
    } catch (error) {
      toast.error("Error al buscar propiedades")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    searchProperties()
  }, [])

  const handleSelect = (p: TokkoProperty) => {
    setSelectedId(p.id)
    onSelect(p)
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-bold">¿Querés asociar una propiedad de tu cartera?</h3>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por dirección, barrio o referencia..." 
              className="pl-10" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchProperties()}
            />
          </div>
          <Button onClick={searchProperties} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </Button>
        </div>
        
        <div className="flex gap-4">
          <div className="flex-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Tipo</Label>
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todos</SelectItem>
                <SelectItem value="1">Departamento</SelectItem>
                <SelectItem value="2">Casa</SelectItem>
                <SelectItem value="3">PH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Operación</Label>
            <Select value={operationType} onValueChange={setOperationType}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Venta</SelectItem>
                <SelectItem value="2">Alquiler</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-accent/5 animate-pulse" />
          ))
        ) : properties.map((p) => (
          <Card 
            key={p.id} 
            className={cn(
              "p-3 cursor-pointer transition-all hover:border-accent group relative overflow-hidden",
              selectedId === p.id ? "border-accent bg-accent/5" : "border-muted"
            )}
            onClick={() => handleSelect(p)}
          >
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-md bg-muted overflow-hidden flex-shrink-0">
                {p.photos?.[0]?.thumb ? (
                  <img src={p.photos[0].thumb} className="w-full h-full object-cover" alt={p.title} />
                ) : (
                  <Building className="w-full h-full p-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm truncate">{p.title}</h4>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {p.address}, {p.zone}
                </p>
                <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground font-medium">
                  <span className="flex items-center gap-0.5"><Ruler className="w-3 h-3" /> {p.surface_total}m²</span>
                  <span className="flex items-center gap-0.5"><BedDouble className="w-3 h-3" /> {p.rooms} amb</span>
                  <span className="flex items-center gap-0.5"><Bath className="w-3 h-3" /> {p.bathrooms} baños</span>
                </div>
                <p className="text-accent font-bold mt-1">
                  {p.currency} {p.price.toLocaleString()}
                </p>
              </div>
              <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  size="sm" 
                  className={cn(
                    "h-7 text-[10px]",
                    selectedId === p.id 
                      ? "bg-accent text-accent-foreground hover:bg-accent/90" 
                      : "bg-background border-muted hover:border-accent"
                  )}
                >
                  {selectedId === p.id ? "Seleccionado" : "Seleccionar"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="ghost" className="text-muted-foreground" onClick={() => onContinue()}>
          Saltar este paso
        </Button>
        <Button onClick={onContinue} disabled={!selectedId} className="bg-accent">
          Continuar <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
