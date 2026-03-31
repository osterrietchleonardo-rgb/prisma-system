import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background space-y-4 animate-in fade-in duration-500">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-4 bg-accent/40 rounded-full animate-pulse" />
        </div>
      </div>
      <p className="text-sm font-medium text-muted-foreground animate-pulse tracking-wide">
        PREPARANDO PRISMA IA...
      </p>
    </div>
  )
}
