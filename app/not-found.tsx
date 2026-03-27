import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Search, Home, LayoutDashboard } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
      <div className="relative group">
        <h1 className="text-[12rem] font-bold tracking-tighter bg-gradient-to-br from-[#b87333] via-[#e29e6d] to-[#b87333] bg-clip-text text-transparent opacity-20 group-hover:opacity-30 transition-opacity select-none animate-pulse">
          404
        </h1>
        <div className="absolute inset-0 flex items-center justify-center">
          <Search className="h-24 w-24 text-[#b87333] animate-bounce" />
        </div>
      </div>
      
      <div className="mt-[-2rem] space-y-4 max-w-md">
        <h2 className="text-3xl font-bold text-foreground">
          Esta página no existe en el sistema
        </h2>
        <p className="text-muted-foreground text-lg">
          Parece que el lead se perdió en el pipeline 😅
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Button asChild variant="outline" className="w-full sm:w-auto border-accent/20 hover:bg-accent/10 hover:text-accent gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Volver al Inicio
            </Link>
          </Button>
          
          <Button asChild className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-white gap-2 shadow-lg shadow-accent/20">
            {/* The user wants to verify auth and redirect, but this is a purely server-rendered or static-friendly 404. 
                We use /dashboard as a generic redirect point that the mid-level auth handles. */}
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              Ir al Dashboard
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-16 text-xs text-muted-foreground/30 font-mono">
        &copy; {new Date().getFullYear()} PRISMA IA - Prop Tech powered by Gemini
      </div>
    </div>
  )
}
