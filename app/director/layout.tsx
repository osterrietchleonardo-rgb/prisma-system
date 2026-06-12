import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DirectorSidebar } from "@/components/director-sidebar"
import { DirectorHeader } from "@/components/director-header"
import { createAdminClient } from "@/lib/supabase/admin"
import { getTokenIssuedAt } from "@/lib/auth/session"

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

  // ADMIN VAKDOR: Check account status — pausado/eliminado → force logout
  if (profile) {
    if (profile.estado === "pausado" || profile.estado === "eliminado") {
      await supabase.auth.signOut()
      redirect("/auth/login?error=account_suspended")
    }
    // Check if admin invalidated this session after it was issued
    if (profile.tokens_invalidos_desde) {
      const tokenIat = getTokenIssuedAt(session.access_token) // JWT issued-at (seconds)
      const invalidSince = Math.floor(new Date(profile.tokens_invalidos_desde).getTime() / 1000)
      if (tokenIat < invalidSince) {
        await supabase.auth.signOut()
        redirect("/auth/login?error=session_revoked")
      }
    }
  }

  // Fetch AI Credits for the specific agency
  let aiCredits = null;
  if (profile?.agency_id) {
    const { data } = await supabase
      .from("agency_ai_credits")
      .select("credits_total, credits_used")
      .eq("agency_id", profile.agency_id)
      .maybeSingle();
    aiCredits = data;
  }

  // If agency exists but no credits row, auto-initialize real credits via admin
  if (!aiCredits && profile?.agency_id) {
    const adminSupabase = createAdminClient()
    const { data: newCredits, error: insertError } = await adminSupabase
      .from("agency_ai_credits")
      .insert({
        agency_id: profile.agency_id,
        credits_total: 10000,
        credits_used: 0
      })
      .select("credits_total, credits_used")
      .single()

    if (!insertError && newCredits) {
      aiCredits = newCredits
    } else {
      console.error("Failed to auto-initialize credits. Missing Service Role Key?", insertError)
      // Provide a fallback so UI never breaks
      aiCredits = { credits_total: 10000, credits_used: 0 }
    }
  } else if (!aiCredits) {
     aiCredits = { credits_total: 10000, credits_used: 0 }
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
          aiCredits={aiCredits ? { allocated: aiCredits.credits_total, consumed: aiCredits.credits_used } : null}
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-accent/20 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  )
}
