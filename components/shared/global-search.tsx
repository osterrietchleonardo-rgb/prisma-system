"use client"

import * as React from "react"
import { Search, User, Home, FileText, MessageSquare, ArrowRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRouter } from "next/navigation"

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SAMPLE_RESULTS = [
  { id: "1", title: "Propiedad - Calle Florida 123", type: "property", icon: Home, link: "/director/propiedades" },
  { id: "2", title: "Lead - Juan Perez", type: "lead", icon: User, link: "/director/leads" },
  { id: "3", title: "Contrato - Alquiler Septiembre", type: "contract", icon: FileText, link: "/director/contratos" },
  { id: "4", title: "Campaña - WhatsApp Septiembre", type: "campaign", icon: MessageSquare, link: "/director/whatsapp" },
]

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = React.useState("")
  const router = useRouter()

  const filteredResults = SAMPLE_RESULTS.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase())
  )

  const handleSelect = (link: string) => {
    onOpenChange(false)
    router.push(link)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 sm:max-w-[550px] border-accent/20 bg-background/95 backdrop-blur-xl">
        <DialogHeader className="p-4 border-b border-accent/10">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar propiedades, leads, contratos..."
              className="pl-8 bg-transparent border-none focus-visible:ring-0 text-base"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[300px]">
          <div className="p-2">
            {filteredResults.length > 0 ? (
              <div className="space-y-1">
                {filteredResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result.link)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/10 transition-colors text-left group"
                  >
                    <div className="p-2 rounded-md bg-accent/5 group-hover:bg-accent/20 transition-colors">
                      <result.icon className="h-4 w-4 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{result.title}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold opacity-50">
                        {result.type}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No se encontraron resultados para "{query}"</p>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t border-accent/10 bg-accent/5 flex justify-end">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
            Presiona <kbd className="px-1.5 py-0.5 rounded border border-accent/20 bg-background text-[9px]">ESC</kbd> para cerrar
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
