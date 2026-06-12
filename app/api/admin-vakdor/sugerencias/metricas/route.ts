import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

const STOPWORDS_ES = new Set([
  "de","la","el","en","y","a","los","las","un","una","que","es","por","con",
  "para","se","del","al","como","su","pero","lo","le","más","ya","o","este",
  "mi","tu","sin","sobre","entre","también","hay","fue","ser","muy","no","si",
  "me","te","nos","nos","esto","eso","aquí","allí","cuando","donde","cómo",
  "qué","quién","porque","aunque","tanto","así","bien","todo","todos"
])

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const now = new Date()
  const hace6meses = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  const { data: todos } = await db
    .from("system_feedback")
    .select("id, type, estado, created_at, updated_at, content, email, agency_id, user_id, profiles!system_feedback_user_id_fkey(full_name, agency_id), agencies!system_feedback_agency_id_fkey(name)")
    .order("created_at", { ascending: false })

  const all = todos || []

  // Por categoría (para torta)
  const porCategoria = all.reduce((acc, f) => {
    const cat = f.type || "otro"
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Distribución por estado
  const porEstado = all.reduce((acc, f) => {
    const est = f.estado || "pendiente"
    acc[est] = (acc[est] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Evolución mensual (últimos 6 meses)
  const evolucionMensual: Record<string, number> = {}
  all.filter(f => f.created_at >= hace6meses).forEach((f) => {
    const mes = f.created_at.substring(0, 7)
    evolucionMensual[mes] = (evolucionMensual[mes] || 0) + 1
  })

  // Top 5 agencias con más sugerencias
  const porAgencia = all.reduce((acc, f) => {
    const agName = (f.agencies as unknown as { name: string } | null)?.name || f.agency_id || "Sin agencia"
    acc[agName] = (acc[agName] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const topAgencias = Object.entries(porAgencia).sort(([,a],[,b]) => b-a).slice(0, 5)

  // Top 5 usuarios que más reportan
  const porUsuario: Record<string, { nombre: string; cantidad: number }> = {}
  all.forEach((f) => {
    if (f.user_id) {
      const prof = f.profiles as unknown as { full_name: string } | null
      const nombre = prof?.full_name || f.email || f.user_id
      if (!porUsuario[f.user_id]) porUsuario[f.user_id] = { nombre, cantidad: 0 }
      porUsuario[f.user_id].cantidad++
    }
  })
  const topUsuarios = Object.values(porUsuario).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

  // Tiempo promedio de resolución
  const resueltas = all.filter(f => f.estado === "resuelta" && f.updated_at && f.created_at)
  const tiempoPromedio = resueltas.length > 0
    ? resueltas.reduce((sum, f) => {
        const diff = new Date(f.updated_at!).getTime() - new Date(f.created_at).getTime()
        return sum + diff / (1000 * 3600 * 24) // días
      }, 0) / resueltas.length
    : null

  // Tasa de resolución
  const tasaResolucion = all.length > 0 ? (resueltas.length / all.length) * 100 : 0

  // Word frequencies (server-side, sin stopwords)
  const wordCounts: Record<string, number> = {}
  all.forEach((f) => {
    const words = (f.content || "")
      .toLowerCase()
      .replace(/[^\w\sáéíóúüñ]/g, " ")
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !STOPWORDS_ES.has(w))
    words.forEach((w: string) => { wordCounts[w] = (wordCounts[w] || 0) + 1 })
  })
  const topPalabras = Object.entries(wordCounts)
    .sort(([,a],[,b]) => b-a)
    .slice(0, 30)
    .map(([palabra, cantidad]) => ({ palabra, cantidad }))

  return NextResponse.json({
    porCategoria,
    porEstado,
    evolucionMensual,
    topAgencias,
    topUsuarios,
    tiempoPromedioResolucion: tiempoPromedio,
    tasaResolucion: Math.round(tasaResolucion),
    topPalabras,
    total: all.length,
    pendientes: all.filter(f => !f.estado || f.estado === "pendiente").length,
  })
}
