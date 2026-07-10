// Fuente: Supabase Management API — advisors de seguridad y performance del proyecto prisma.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const REF = "vutopjvdrwmvrkgnrfno" // proyecto "prisma"

async function contarAdvisors(tipo: "security" | "performance", token: string): Promise<{ error: number; warn: number; info: number }> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/advisors/${tipo}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`advisors ${tipo} ${res.status}`)
  const j = await res.json()
  const lints: { level: string }[] = j.lints ?? []
  const c = { error: 0, warn: 0, info: 0 }
  for (const l of lints) {
    if (l.level === "ERROR") c.error++
    else if (l.level === "WARN") c.warn++
    else c.info++
  }
  return c
}

export async function getSupabaseAdvisors(): Promise<{ kvs: Record<string, string>; sub: Semaforo }> {
  try {
    const token = process.env.SUPABASE_API_KEY_MANAGEMENT
    if (!token) throw new Error("Falta SUPABASE_API_KEY_MANAGEMENT")
    const [seg, perf] = await Promise.all([
      contarAdvisors("security", token),
      contarAdvisors("performance", token),
    ])
    // Rojo si hay errores de seguridad; amarillo si solo warnings; verde si limpio.
    const sub: Semaforo = seg.error > 0 ? "rojo" : seg.warn > 0 || perf.warn > 0 ? "amarillo" : "verde"
    return {
      kvs: {
        "Seguridad": `${seg.error} err · ${seg.warn} warn`,
        "Performance": `${perf.error} err · ${perf.warn} warn`,
      },
      sub,
    }
  } catch {
    return { kvs: { Estado: "no disponible" }, sub: "gris" }
  }
}
