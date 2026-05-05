"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"
import { redirect } from "next/navigation"

const registerSchema = z.object({
  fullName: z.string().min(3, "Mínimo 3 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  role: z.enum(["director", "asesor"]),
  agencyName: z.string().optional(),
  inviteCode: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
})

export async function register(rawData: z.infer<typeof registerSchema>) {
  const data = registerSchema.parse(rawData)
  const supabase = createClient()
  const adminClient = createAdminClient()
  
  // 1. Crear usuario con signUp para que Supabase maneje el envío del email de confirmación
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        role: data.role,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    }
  })

  if (authError) {
    if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
       throw new Error("El usuario ya se encuentra registrado.")
    } else {
      throw new Error(`Error de autenticación: ${authError.message}`)
    }
  }

  if (!authData.user) throw new Error("No se pudo crear el usuario")
  const userId = authData.user.id

  // --- Lógica de Creación de Perfil (Sin necesidad de tantos reintentos ahora) ---
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: userId,
      email: data.email,
      role: data.role,
      full_name: data.fullName,
    }, { onConflict: 'id' })

  if (profileError) {
      // Un último intento de espera solo por precaución física de la DB
      await new Promise(res => setTimeout(res, 500))
      const { error: retryProfile } = await adminClient
        .from('profiles')
        .upsert({
          id: userId,
          email: data.email,
          role: data.role,
          full_name: data.fullName,
        }, { onConflict: 'id' })
      if (retryProfile) throw new Error("Error perfil: " + retryProfile.message)
  }

    // 2. Lógica específica por Rol
  if (data.role === 'director') {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    
    // Crear Agencia
    const { data: agency, error: agencyError } = await adminClient
      .from('agencies')
      .insert({
        name: data.agencyName || 'Mi Inmobiliaria',
        owner_id: userId,
        invite_code: inviteCode, // Mantenemos por ahora para retrocompatibilidad
      })
      .select()
      .single()

    if (agencyError) throw new Error("Error inmobiliaria: " + agencyError.message)

    // Crear primera invitación oficial de un solo uso
    await adminClient
      .from('agency_invites')
      .insert({
        agency_id: agency.id,
        code: inviteCode,
        is_used: false
      })

    // Vincular perfil
    const { error: linkError } = await adminClient
      .from('profiles')
      .update({ agency_id: agency.id })
      .eq('id', userId)

    if (linkError) throw new Error("Error vinculación: " + linkError.message)

  } else {
    // Asesor: Validar Código de Invitación de Un Solo Uso
    if (!data.inviteCode) throw new Error("Inválido: Código obligatorio")

    const { data: invite, error: findError } = await adminClient
      .from('agency_invites')
      .select('agency_id, is_used')
      .eq('code', data.inviteCode)
      .single()

    if (findError || !invite) throw new Error("Código de invitación inexistente")
    if (invite.is_used) throw new Error("Este código de invitación ya ha sido utilizado")

    const { error: asesorLinkError } = await adminClient
      .from('profiles')
      .update({ agency_id: invite.agency_id, role: 'asesor', full_name: data.fullName })
      .eq('id', userId)
    
    if (asesorLinkError) throw new Error("Error vinculación asesor: " + asesorLinkError.message)

    // Marcar invitación como usada
    await adminClient
      .from('agency_invites')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString(),
        used_by: userId 
      })
      .eq('code', data.inviteCode)
  }

  // 4. Sincronizar metadatos de Auth (para que el JWT tenga el rol y agency_id de inmediato)
  if (data.role === 'director' || (data.role === 'asesor')) {
     await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { 
            role: data.role,
            full_name: data.fullName,
            // Si es director, ya tenemos la agencia, podemos intentar pre-cargarla
            // aunque el perfil sea el source of truth.
        }
     })
  }

  return { success: true, message: "Registro exitoso. Por favor revisá tu email para confirmar tu cuenta." }
}

export async function login(rawData: z.infer<typeof loginSchema>) {
  const data = loginSchema.parse(rawData)
  const supabase = createClient()
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  if (error) throw new Error(error.message)
  
  // Role based redirect happens in the component or middleware
  return { user: authData.user }
}

export async function signInWithGoogle(origin: string, role?: string, inviteCode?: string, agencyName?: string) {
  const supabase = createClient()
  
  const queryParams = new URLSearchParams()
  if (role) queryParams.set('role', role)
  if (inviteCode) queryParams.set('inviteCode', inviteCode)
  if (agencyName) queryParams.set('agencyName', agencyName)
  
  // Prioridad: 1. Origin del browser, 2. Env Var de Vercel, 3. URL Hardcoded oficial
  const baseOrigin = origin || process.env.APP_URL || 'https://prisma.vakdor.com'
  const redirectTo = `${baseOrigin}/auth/callback${queryParams.toString() ? `?${queryParams.toString()}` : ''}`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // Crucial para Server Actions
    }
  })

  if (error) throw new Error(error.message)
  if (data.url) {
    redirect(data.url)
  }
}

export async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect("/auth/login")
}

export async function resetPassword(email: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/reset-password`,
  })

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function updatePassword(password: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.updateUser({
    password: password
  })

  if (error) throw new Error(error.message)
  return { success: true }
}
