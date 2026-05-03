"use client"

import * as React from "react"
import { Search, User, Home, FileText, MessageSquare, ArrowRight, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRouter } from "next/navigation"
import { globalSearch } from "@/lib/actions/search"
import { useDebounce } from "@/hooks/use-debounce"

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SearchResult {
  id: string
  title: string
  type: string
  link: string
  subtitle?: string
}

const typeIcons: Record<string, any> = {
  propiedad: Home,
  lead: User,
  contract: FileText,
  campaign: MessageSquare,
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const debouncedQuery = useDebounce(query, 300)
  const router = useRouter()

  React.useEffect(() => {
    async function performSearch() {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      try {
        const data = await globalSearch(debouncedQuery)
        setResults(data as SearchResult[])
      } catch (error) {
        console.error("Search error:", error)
      } finally {
        setLoading(false)
      }
    }

    performSearch()
  }, [debouncedQuery])

  const handleSelect = (link: string) => {
    onOpenChange(false)
    router.push(link)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 sm:max-w-[550px] border-accent/20 bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="p-4 border-b border-accent/10">
          <div className="relative">
            {loading ? (
              <Loader2 className="absolute left-2 top-2.5 h-4 w-4 text-accent animate-spin" />
            ) : (
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              placeholder="Buscar propiedades, leads, contratos..."
              className="pl-8 bg-transparent border-none focus-visible:ring-0 text-base placeholder:text-muted-foreground/50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[350px]">
          <div className="p-2">
            {results.length > 0 ? (
              <div className="space-y-1">
                {results.map((result) => {
                  const Icon = typeIcons[result.type] || Search
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSelect(result.link)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/10 transition-all text-left group"
                    >
                      <div className="p-2 rounded-md bg-accent/5 group-hover:bg-accent/20 transition-colors">
                        <Icon className="h-4 w-4 text-accent" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold group-hover:text-accent transition-colors">{result.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-accent/70 uppercase tracking-widest font-black">
                            {result.type}
                          </span>
                          {result.subtitle && (
                            <>
                              <span className="text-[10px] text-muted-foreground">|</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {result.subtitle}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-accent opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                    </button>
                  )
                })}
              </div>
            ) : query.length >= 2 && !loading ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No se encontraron resultados para "{query}"</p>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground/40">
                <p className="text-xs uppercase tracking-widest font-bold">Escribe para buscar en PRISMA</p>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t border-accent/10 bg-accent/5 flex justify-between items-center">
          <div className="flex gap-2">
             <kbd className="px-1.5 py-0.5 rounded border border-accent/20 bg-background text-[9px] font-bold text-accent/70">↑↓</kbd>
             <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter self-center">Navegar</span>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
            Presiona <kbd className="px-1.5 py-0.5 rounded border border-accent/20 bg-background text-[9px]">ESC</kbd> para cerrar
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
