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

function getFriendlyErrorMessage(message: string): string {
  if (message.includes("Invalid login credentials")) return "Email o contraseña incorrectos."
  if (message.includes("Email not confirmed")) return "Debes confirmar tu email antes de ingresar. Revisa tu casilla de correo."
  if (message.includes("already registered") || message.includes("already exists")) return "Este email ya se encuentra registrado."
  if (message.includes("rate limit") || message.includes("too many requests")) return "Demasiados intentos. Por favor espera unos minutos."
  if (message.includes("Password should be at least")) return "La contraseña debe tener al menos 6 caracteres."
  if (message.includes("User not found")) return "No encontramos una cuenta con ese email."
  
  console.error("Auth Error:", message)
  return "Ocurrió un problema. Por favor intenta de nuevo."
}

export async function register(rawData: z.infer<typeof registerSchema>) {
  try {
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

    if (authError) return { error: getFriendlyErrorMessage(authError.message) }
    if (!authData.user) return { error: "No se pudo crear el usuario" }
    
    const userId = authData.user.id

    // Crear Perfil
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        email: data.email,
        role: data.role,
        full_name: data.fullName,
      }, { onConflict: 'id' })

    if (profileError) {
        await adminClient
          .from('profiles')
          .upsert({
            id: userId,
            email: data.email,
            role: data.role,
            full_name: data.fullName,
          }, { onConflict: 'id' })
    }

    if (data.role === 'director') {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      
      const { data: agency, error: agencyError } = await adminClient
        .from('agencies')
        .insert({
          name: data.agencyName || 'Mi Inmobiliaria',
          owner_id: userId,
          invite_code: inviteCode, 
        })
        .select()
        .single()

      if (agencyError) return { error: "Error al crear la agencia." }

      await adminClient
        .from('agency_invites')
        .insert({
          agency_id: agency.id,
          code: inviteCode,
          is_used: false
        })

      await adminClient
        .from('profiles')
        .update({ agency_id: agency.id })
        .eq('id', userId)

    } else {
      if (!data.inviteCode) return { error: "Código de invitación obligatorio" }

      const { data: invite, error: findError } = await adminClient
        .from('agency_invites')
        .select('agency_id, is_used')
        .eq('code', data.inviteCode)
        .single()

      if (findError || !invite) return { error: "Código de invitación inexistente" }
      if (invite.is_used) return { error: "Este código ya fue utilizado" }

      const { error: asesorLinkError } = await adminClient
        .from('profiles')
        .update({ agency_id: invite.agency_id, role: 'asesor', full_name: data.fullName })
        .eq('id', userId)
      
      if (asesorLinkError) return { error: "Error al vincular asesor." }

      await adminClient
        .from('agency_invites')
        .update({ 
          is_used: true, 
          used_at: new Date().toISOString(),
          used_by: userId 
        })
        .eq('code', data.inviteCode)
    }

    await adminClient.auth.admin.updateUserById(userId, {
      user_metadata: { 
          role: data.role,
          full_name: data.fullName,
      }
    })

    return { success: true, message: "Registro exitoso. Por favor revisá tu email para confirmar tu cuenta." }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido" }
  }
}

export async function login(rawData: z.infer<typeof loginSchema>) {
  try {
    const data = loginSchema.parse(rawData)
    const supabase = createClient()
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) return { error: getFriendlyErrorMessage(error.message) }
    
    return { user: authData.user }
  } catch (err) {
    return { error: "Error al iniciar sesión. Intenta de nuevo." }
  }
}

export async function signInWithGoogle(origin: string, role?: string, inviteCode?: string, agencyName?: string) {
  const supabase = createClient()
  
  const queryParams = new URLSearchParams()
  if (role) queryParams.set('role', role)
  if (inviteCode) queryParams.set('inviteCode', inviteCode)
  if (agencyName) queryParams.set('agencyName', agencyName)
  
  const baseOrigin = origin || process.env.APP_URL || 'https://prisma.vakdor.com'
  const redirectTo = `${baseOrigin}/auth/callback${queryParams.toString() ? `?${queryParams.toString()}` : ''}`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
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
  try {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/reset-password`,
    })

    if (error) return { error: getFriendlyErrorMessage(error.message) }
    return { success: true }
  } catch (err) {
    return { error: "Error al enviar el correo de recuperación." }
  }
}

export async function updatePassword(password: string) {
  try {
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) return { error: getFriendlyErrorMessage(error.message) }
    return { success: true }
  } catch (err) {
    return { error: "Error al actualizar la contraseña." }
  }
}

