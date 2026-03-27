import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DirectorSidebar } from "@/components/director-sidebar"
import { DirectorHeader } from "@/components/director-header"

export default async function DirectorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  // Fetch profile with agency join
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(`
      *,
      agencies!profiles_agency_id_fkey (
        name
      )
    `)
    .eq("id", session.user.id)
    .single()

  if (error || !profile) {
    console.error("Error fetching profile:", error)
    // Optional: redirect to error or setup profile
  }

  // Double check role: ONLY redirect if we are SURE it's the wrong role
  if (profile?.role === "asesor") {
    redirect("/asesor/dashboard")
  }

  if (!profile && !error) {
    // If no profile but no error, maybe it's still propagating
    // For now, don't redirect to avoid the loop, just let it render or handle null
  }

  const agencyData = profile?.agencies as { name: string } | null
  const agencyName = agencyData?.name || "PRISMA IA"

  return (
    <div className="h-screen flex overflow-hidden bg-muted/40 font-plus-jakarta">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex md:w-72 md:flex-col md:flex-shrink-0 z-50">
        <DirectorSidebar
          agencyName={agencyName}
          userName={profile?.full_name || "Usuario"}
          userRole="Director"
        />
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <DirectorHeader
          userName={profile?.full_name || "Usuario"}
          userEmail={profile?.email || ""}
          agencyName={agencyName}
          userRole="Director"
        />
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  )
}
