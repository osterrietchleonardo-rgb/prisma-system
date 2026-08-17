import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { resumenParaMemoria, insertarIdeasMotor } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"
import { canonDeVoz, traerRecursos, type Recurso } from "@/lib/admin-vakdor/marketing/recursos"
import { fetchGscOportunidades, type GscOportunidad } from "@/lib/admin-vakdor/marketing/metricas"
import { parsearIdeas, type ClavesValidas } from "@/lib/admin-vakdor/marketing/generar-validacion"

export const dynamic = "force-dynamic"

interface Cluster {
  clave: string
  titulo: string
  keyword_pilar: string
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const previas = await resumenParaMemoria()
  const evitar = previas.map((p) => `- ${p.titulo}${p.angulo ? ` (${p.angulo})` : ""}`).join("\n") || "(ninguna todavía)"

  // Insights reales de Buffer (los cachea el worker 1x/día). Fundamentan las ideas con datos.
  let insights = ""
  try {
    const { data } = await getAdminDb()
      .from("marketing_insights").select("resumen").order("fecha", { ascending: false }).limit(1).maybeSingle()
    insights = typeof data?.resumen === "string" ? data.resumen : ""
  } catch { /* falla suave */ }

  let canon = ""
  let estructuras: Recurso[] = []
  let escenas: Recurso[] = []
  let propositos: Recurso[] = []
  try {
    canon = await canonDeVoz()
    estructuras = await traerRecursos("estructura")
    escenas = await traerRecursos("escena")
    propositos = await traerRecursos("proposito")
  } catch (e) {
    // Falla suave, igual que los insights: sin banco se generan ideas igual,
    // solo que sin la voz ni las escenas. Peor contenido, no una ruta caida.
    console.error(`generar(recursos): ${(e as Error).message}`)
  }

  // Territorios. Falla suave aparte: si esto se cae, las ideas salen sin cluster.
  let clusters: Cluster[] = []
  try {
    const { data } = await getAdminDb()
      .from("marketing_clusters").select("clave, titulo, keyword_pilar").eq("activo", true)
    clusters = (data ?? []) as Cluster[]
  } catch (e) {
    console.error(`generar(clusters): ${(e as Error).message}`)
  }

  // Búsquedas por las que el sitio ya aparece sin estar arriba. Falla suave: sin esto
  // el motor elige tema a ciegas, que es exactamente como venía funcionando.
  let oportunidades: GscOportunidad[] = []
  try {
    oportunidades = (await fetchGscOportunidades("90d")).data
  } catch (e) {
    console.error(`generar(gsc): ${(e as Error).message}`)
  }

  const user = [
    `Generá 5 ideas de contenido para Vakdor (mezcla LinkedIn y blog).`,
    canon ? `CANON DE VOZ (toda idea tiene que poder escribirse con esta voz):\n${canon}` : "",
    clusters.length
      ? `TERRITORIOS DISPONIBLES (asigná uno a cada idea en "cluster", y mezclá territorios entre las 5):\n${clusters.map((c) => `- ${c.clave}: ${c.titulo} (búsqueda pilar: "${c.keyword_pilar}")`).join("\n")}`
      : "",
    propositos.length
      ? `PROPÓSITOS DISPONIBLES (el PARA QUÉ de la pieza; asigná uno distinto a cada idea en "proposito"):\n${propositos.map((p) => `- ${p.clave}: ${p.titulo}`).join("\n")}`
      : "",
    estructuras.length ? `ESTRUCTURAS NARRATIVAS DISPONIBLES (asigná una distinta a cada idea; tiene que ser coherente con el propósito):\n${estructuras.map((e) => `- ${e.clave}: ${e.titulo}`).join("\n")}` : "",
    escenas.length ? `ESCENAS DEL RUBRO (el gancho de cada idea tiene que apoyarse en una de éstas, no en una generalidad):\n${escenas.slice(0, 30).map((e) => `- ${e.titulo}: ${e.detalle}`).join("\n")}` : "",
    oportunidades.length
      ? `OPORTUNIDADES REALES DE BÚSQUEDA (Search Console). Son búsquedas por las que el sitio YA aparece sin estar arriba:\n${oportunidades.map((o) => `- "${o.query}" — posición ${o.position}, ${o.impressions} impresiones`).join("\n")}\n\nPriorizá ideas de BLOG que respondan mejor a estas búsquedas, y poné la búsqueda exacta en "keyword_objetivo". NO inventes búsquedas que no estén en esta lista: si una idea no responde a ninguna, dejá "keyword_objetivo" vacío.`
      : "",
    insights ? `DATOS REALES DE RENDIMIENTO (Buffer) — priorizá los patrones que más rinden y evitá los que menos; no inventes:\n${insights}` : "",
    `Balanceá el EMBUDO: asigná a cada idea una etapa "funnel": "tofu" (descubrimiento, dolor amplio, sin vender), "mofu" (nutrición, el mecanismo/método PRISMA), "bofu" (empujón a ver la demostración). Mezclá las 3 etapas.`,
    `NO repitas estos ángulos/títulos ya usados:\n${evitar}`,
    `El "gancho" de cada idea tiene que ser una escena concreta, NUNCA una tesis abstracta.`,
    `Devolvé SOLO un array JSON válido, sin texto extra, con objetos:`,
    `{"titulo": string, "fuente": "linkedin"|"blog", "formato": "post_texto"|"carrusel"|"articulo_blog", "funnel": "tofu"|"mofu"|"bofu", "cluster": string, "proposito": string, "estructura": string, "keyword_objetivo": string, "angulo": string, "gancho": string, "motivo": string}`,
  ].filter(Boolean).join("\n\n")

  let raw: string
  try {
    raw = await generarTexto(BRAND_SYSTEM, user)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Extraer el array JSON de la respuesta (tolerante a fences ```json).
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return NextResponse.json({ error: "respuesta IA sin JSON", raw }, { status: 502 })
  let parsed: unknown
  try { parsed = JSON.parse(match[0]) } catch { return NextResponse.json({ error: "JSON inválido", raw }, { status: 502 }) }
  if (!Array.isArray(parsed)) return NextResponse.json({ error: "no es array", raw }, { status: 502 })

  // Las claves se validan contra lo que existe HOY en la base, no contra listas de código:
  // una estructura o un cluster agregados por SQL tienen que entrar sin desplegar.
  const claves: ClavesValidas = {
    clusters: clusters.map((c) => c.clave),
    propositos: propositos.map((p) => p.clave).filter((c): c is string => typeof c === "string"),
    estructuras: estructuras.map((e) => e.clave).filter((c): c is string => typeof c === "string"),
  }
  const ideas = parsearIdeas(parsed, claves)

  try {
    const creadas = await insertarIdeasMotor(ideas)
    return NextResponse.json({ creadas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
