/**
 * Seed script: creates the initial admin_vakdor user.
 * Usage: npx ts-node scripts/seed-admin-vakdor.ts
 *
 * Reads credentials from environment variables:
 *   ADMIN_VAKDOR_EMAIL
 *   ADMIN_VAKDOR_PASSWORD
 *   ADMIN_VAKDOR_NOMBRE (optional, defaults to "Administrador")
 *   ADMIN_VAKDOR_JWT_SECRET (required for hashing)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import * as dotenv from "dotenv"
import { createHash } from "crypto"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })
dotenv.config({ path: ".env" })

const email = process.env.ADMIN_VAKDOR_EMAIL
const password = process.env.ADMIN_VAKDOR_PASSWORD
const nombre = process.env.ADMIN_VAKDOR_NOMBRE || "Administrador"
const secret = process.env.ADMIN_VAKDOR_JWT_SECRET
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !password || !secret || !supabaseUrl || !serviceKey) {
  console.error("❌ Faltan variables de entorno:")
  if (!email) console.error("   - ADMIN_VAKDOR_EMAIL")
  if (!password) console.error("   - ADMIN_VAKDOR_PASSWORD")
  if (!secret) console.error("   - ADMIN_VAKDOR_JWT_SECRET")
  if (!supabaseUrl) console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  if (!serviceKey) console.error("   - SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

// Normalize email first (CRITICAL: must match what login API uses)
const normalizedEmail = email.toLowerCase().trim()

// Hash: must use normalizedEmail as salt — same as login route does with adminUser.email
const passwordHash = createHash("sha256")
  .update(password + normalizedEmail + secret)
  .digest("hex")

const supabase = createClient(supabaseUrl, serviceKey)

async function seed() {
  console.log(`🌱 Creando admin: ${email}`)

  // Check if already exists
  const { data: existing } = await supabase
    .from("admin_vakdor_users")
    .select("id, email")
    .eq("email", normalizedEmail)
    .maybeSingle()

  if (existing) {
    console.log("⚠️  Ya existe un admin con ese email. Actualizando contraseña...")
    const { error } = await supabase
      .from("admin_vakdor_users")
      .update({ password_hash: passwordHash, is_active: true })
      .eq("id", existing.id)

    if (error) {
      console.error("❌ Error actualizando:", error.message)
      process.exit(1)
    }
    console.log("✅ Contraseña actualizada correctamente")
    return
  }

  const { data, error } = await supabase
    .from("admin_vakdor_users")
    .insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      nombre,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.error("❌ Error creando admin:", error.message)
    process.exit(1)
  }

  console.log(`✅ Admin creado: ${data.id}`)
  console.log(`   Email: ${data.email}`)
  console.log(`   Nombre: ${data.nombre}`)
  console.log(`\n🔗 Login en: /admin-vakdor/login`)
}

seed().catch(console.error)
