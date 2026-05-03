"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"
import { Filter } from "lucide-react"

interface Advisor {
  id: string
  name: string
}

interface Props {
  advisors: Advisor[]
}

export function AdvisorFilter({ advisors }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentAgentId = searchParams.get("agentId") || "all"

  const handleValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete("agentId")
    } else {
      params.set("agentId", value)
    }
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtrar por Asesor</span>
      </div>
      
      <Select value={currentAgentId} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full sm:w-[220px] h-10 md:h-9 text-xs bg-background/50 backdrop-blur-sm border-accent/20">
          <SelectValue placeholder="Todos los asesores" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los asesores (Global)</SelectItem>
          {advisors.map((advisor) => (
            <SelectItem key={advisor.id} value={advisor.id}>
              {advisor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
