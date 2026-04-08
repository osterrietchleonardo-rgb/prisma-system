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
      const role = searchParams.get('role') as 'director' | 'asesor'
      const inviteCode = searchParams.get('inviteCode')
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
            role: role || 'director'
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
        } else if (role === 'asesor' && inviteCode) {
           const { data: invite } = await adminClient
            .from('agency_invites')
            .select('agency_id, is_used')
            .eq('code', inviteCode)
            .single()

           if (invite && !invite.is_used) {
             await adminClient
              .from('profiles')
              .update({ agency_id: invite.agency_id })
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
