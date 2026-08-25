import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  if (code) {
    const supabase = createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && session?.user) {
      console.log('Auth Callback Success: User logged in', session.user.email)
      const user = session.user
      const roleFromUrl = searchParams.get('role') as 'director' | 'asesor' | null
      const role = roleFromUrl || user.user_metadata?.role || 'director'
      const inviteCodeFromUrl = searchParams.get('inviteCode')
      const inviteCode = inviteCodeFromUrl || user.user_metadata?.invite_code
      const agencyName = searchParams.get('agencyName')

      // Check if profile exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile) {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const adminClient = createAdminClient()

        // Create Profile
        await adminClient
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
            role: role
          })

        if (role === 'director') {
          const generatedInvite = Math.random().toString(36).substring(2, 8).toUpperCase()
          const { data: agency } = await adminClient
            .from('agencies')
            .insert({
              name: agencyName || 'Mi Inmobiliaria',
              owner_id: user.id,
              invite_code: generatedInvite
            })
            .select()
            .single()

          if (agency) {
            await adminClient
              .from('profiles')
              .update({ agency_id: agency.id })
              .eq('id', user.id)
            
            await adminClient.from('agency_invites').insert({
              agency_id: agency.id,
              code: generatedInvite,
              is_used: false
            })
          }
        } else if (inviteCode) {
           // ============================================================
           // ADVERTENCIA — AGUJERO DE SEGURIDAD DORMIDO, NO CORREGIDO ACÁ.
           // ============================================================
           // Este bloque consume códigos de agency_invites con EXACTAMENTE el
           // mismo agujero que la rama feat/asesores-celular-y-documentos vino
           // a cerrar en lib/actions/auth.ts (register()): acá solo se lee
           // `agency_id, is_used, role` — NO se compara invite.invitee_email
           // contra el email real de la sesión de Google (emailCoincideConInvite),
           // NO se copia invitee_name al perfil, y NO se copia invitee_phone.
           // Es decir: cualquiera que consiga un código de invitación (por
           // ejemplo, viéndolo de reojo en la pantalla de otra persona) podría
           // usarlo para entrar con SU PROPIA cuenta de Google, sin que el
           // código esté atado a su email. Eso es exactamente lo que
           // emailCoincideConInvite() existe para impedir.
           //
           // Por qué hoy esto NO se dispara: el formulario de registro
           // (app/auth/registro, vía lib/actions/auth.ts) no ofrece "Registrate
           // con Google" — solo entra por acá el LOGIN con Google de alguien
           // que ya tiene perfil, y ese camino no pasa por este bloque porque
           // `if (!profile)` ya es falso. El único disparador real hoy es
           // signInWithGoogle() en lib/actions/auth.ts, y nada en la UI actual
           // le pasa un inviteCode. Está dormido por accidente, no por diseño.
           //
           // Qué hay que hacer ANTES de agregar "Registrate con Google" al
           // formulario de registro (o cualquier otro camino que llegue acá
           // con un inviteCode real):
           //   1. Traer también invitee_email, invitee_name e invitee_phone
           //      en el select de abajo.
           //   2. Cortar con un error/redirect si
           //      !emailCoincideConInvite(invite.invitee_email, user.email)
           //      ANTES de marcar el código como usado (igual que hace
           //      register() en lib/actions/auth.ts).
           //   3. Copiar invitee_name y invitee_phone al perfil, igual que
           //      hace register() (así el código no solo autoriza: también
           //      arma el perfil con los datos que cargó el director).
           //
           // NO se cambia el comportamiento de este archivo en esta rama: no se
           // puede probar el flujo de Google desde acá con seguridad, y romper
           // el ingreso con Google sería peor que dejar dormido un agujero que
           // hoy no es alcanzable.
           // Unirse a una inmobiliaria existente: el rol lo define el código.
           const { data: invite } = await adminClient
            .from('agency_invites')
            .select('agency_id, is_used, role')
            .eq('code', inviteCode)
            .single()

           if (invite && !invite.is_used) {
             const joinRole = invite.role === 'director' ? 'director' : 'asesor'
             await adminClient
              .from('profiles')
              .update({ agency_id: invite.agency_id, role: joinRole })
              .eq('id', user.id)

             await adminClient
              .from('agency_invites')
              .update({ is_used: true, used_at: new Date().toISOString(), used_by: user.id })
              .eq('code', inviteCode)
           }
        }

        // Sync Auth Metadata
        await adminClient.auth.admin.updateUserById(user.id, {
          user_metadata: { role: role || 'director' }
        })
      }

      // Final redirect
      const next = searchParams.get('next')
      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      const { data: finalProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        
      const finalRole = finalProfile?.role || 'director'
      const redirectPath = finalRole === 'director' ? '/director/dashboard' : '/asesor/dashboard'
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }

    // Handle error case within 'if (code)'
    const errorMessage = error?.message || 'session_not_found'
    console.error('Auth Callback Error (exchangeCodeForSession):', {
      error,
      errorMessage,
      code: code ? 'present' : 'missing'
    })
    return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(errorMessage)}`)
  }

  console.error('Auth Callback Error: No code provided in URL')
  return NextResponse.redirect(`${origin}/auth/auth-code-error?error=no_code`)
}
