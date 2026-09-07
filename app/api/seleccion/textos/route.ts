// Los textos que el asesor va a REVISAR antes de generar la ficha.
//
// Devuelve, por cada propiedad elegida, el título y la descripción tal como saldrían
// publicados. La pantalla de repaso los muestra editables: lo que quede ahí es lo que ve el
// cliente. Ver lib/seleccion/textos.ts para por qué esto lo mira una persona y no se limpia
// solo (el caso "Av. Pedro Goyena" vs "Goyena Bienes Raíces").
//
// `publicador` viaja SOLO para señalarle al asesor dónde mirar dentro de la descripción. Es
// de uso interno, igual que el teléfono del colega en la tarjeta del Buscador (LOGICA §10.8):
// nunca se guarda en el snapshot ni llega a la ficha del cliente.
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { propiedadParaFicha } from "@/lib/ficha/snapshot"
import { TOPE_SELECCION } from "@/lib/seleccion/estado"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const cuerpo = await req.json()
    const elegidas = Array.isArray(cuerpo?.propiedades) ? cuerpo.propiedades : []

    if (elegidas.length === 0) {
      return NextResponse.json({ error: "No elegiste ninguna propiedad." }, { status: 400 })
    }
    if (elegidas.length > TOPE_SELECCION) {
      return NextResponse.json(
        { error: `Podés mandar hasta ${TOPE_SELECCION} propiedades en una misma ficha.` },
        { status: 400 },
      )
    }

    const { agencyId } = await requireTenant()
    const supabase = await createClient()

    const textos: Array<{
      id: string
      titulo: string
      descripcion: string
      publicador: string | null
    }> = []
    const omitidas: Array<{ id: string; motivo: string }> = []

    for (const elegida of elegidas) {
      const id = String(elegida?.id ?? "")
      const source = String(elegida?.source ?? "")
      const r = await propiedadParaFicha(supabase as any, source, id, agencyId)

      // Mismo criterio que al crear: un 503 es un problema nuestro y corta; un 404 es un
      // hecho del mundo y se omite.
      if (!r.ok && r.estado === 503) {
        return NextResponse.json({ error: r.motivo }, { status: 503 })
      }
      if (!r.ok) {
        omitidas.push({ id, motivo: r.motivo })
        continue
      }

      let publicador: string | null = null
      if (source === "roomix") {
        const { data } = await supabase
          .from("roomix_properties")
          .select("roomix_agency_name")
          .eq("slug", id.replace(/^roomix_/, ""))
          .maybeSingle()
        publicador = (data as any)?.roomix_agency_name || null
      }

      textos.push({
        id,
        titulo: r.propiedad.title || "",
        descripcion: r.propiedad.description || "",
        publicador,
      })
    }

    if (textos.length === 0) {
      return NextResponse.json(
        { error: "Ninguna de las propiedades que elegiste sigue publicada. Probá con otras." },
        { status: 404 },
      )
    }

    return NextResponse.json({ textos, omitidas })
  } catch (error: any) {
    console.error("Textos de la selección error:", error)
    return NextResponse.json({ error: "No pudimos traer los textos. Probá de nuevo." }, { status: 500 })
  }
}
