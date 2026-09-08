// Convierte "una propiedad de tal fuente" en el pedazo de snapshot que guardan las fichas
// públicas. Vivía pegado adentro de app/api/ficha/share/route.ts; lo usan la ficha de UNA
// propiedad y la de una SELECCIÓN, y si cada una tuviera su copia se desincronizarían.
import { normalizarImagenes, urlsFotoRed } from "@/lib/acm/fotos-url"
import { logoParaDestino } from "@/lib/marketing-ia/logo-variante"

export type FuentePropiedad = "own" | "agency" | "roomix"

export interface PropiedadFicha {
  title: string | null
  description: string
  price: number
  currency: string
  property_type: string
  status: string
  bedrooms: number
  bathrooms: number
  total_area: number
  address: string
  city: string
  images: string[]
  amenities: string[]
  source: FuentePropiedad
  public_url?: string | null
}

export interface MarcaAgencia {
  colors: string[]
  font: string
  logo_url: string | null
}

export type ResultadoPropiedad =
  | { ok: true; propiedad: PropiedadFicha }
  | { ok: false; estado: 404 | 503; motivo: string }

/** Lo mínimo del cliente de Supabase que esta función usa (así el test puede falsearlo). */
export interface ClienteFicha {
  from(tabla: string): {
    select(cols: string): {
      eq(col: string, val: unknown): any
    }
  }
}

/**
 * Tope de fotos por propiedad. Mismo número que el ACM (app/api/acm/ficha/route.ts):
 * doce propiedades con treinta fotos cada una no abren en el celular del cliente.
 */
const MAX_IMAGENES = 16

export function marcaDeLaAgencia(config: unknown): MarcaAgencia {
  const mk = (config as any) || {}
  return {
    colors: Array.isArray(mk.brand_colors)
      ? mk.brand_colors.filter((c: any) => typeof c === "string" && c)
      : [],
    font: typeof mk.brand_font === "string" ? mk.brand_font : "sans",
    // Cual de los dos logos de la agencia sale en la ficha que recibe el cliente lo eligio el
    // director en Marketing IA → Configuración IA. Sin elegir nada, el estandar.
    logo_url: logoParaDestino(config, "ficha_cliente"),
  }
}

function fotos(images: unknown): string[] {
  return urlsFotoRed(Array.from(new Set(normalizarImagenes(images))).slice(0, MAX_IMAGENES))
}

export async function propiedadParaFicha(
  supabase: ClienteFicha,
  source: string,
  id: string,
  agencyId: string,
): Promise<ResultadoPropiedad> {
  if (source === "roomix") {
    const slug = String(id).replace(/^roomix_/, "")
    // Sólo las columnas que se usan: traer "*" arrastraba el embedding de 768 dimensiones
    // de cada fila escaneada y hacía mucho más pesada la consulta.
    const { data: rp, error } = await supabase
      .from("roomix_properties")
      .select(
        "title, description, price, currency, property_type, operation, bedrooms, rooms, bathrooms, area_m2, address, neighborhood, city, images, amenities",
      )
      .eq("slug", slug)
      .maybeSingle()

    // Un error de consulta (timeout, permisos, red) NO es que la propiedad no exista:
    // decirlo como "no se encontró" mandaba al asesor a buscar un problema que no era.
    if (error) {
      console.error("Ficha — falló la consulta a roomix_properties:", { slug, error })
      return {
        ok: false,
        estado: 503,
        motivo: "No pudimos traer la propiedad en este momento. Probá de nuevo en unos segundos.",
      }
    }
    if (!rp) {
      return {
        ok: false,
        estado: 404,
        motivo: "Esta propiedad ya no está publicada por la inmobiliaria que la ofrecía.",
      }
    }

    return {
      ok: true,
      propiedad: {
        title: rp.title,
        description: rp.description || "",
        price: rp.price ? Number(rp.price) : 0,
        currency: rp.currency || "USD",
        property_type: rp.property_type || "",
        status: rp.operation === "rent" ? "Alquiler" : "Venta",
        bedrooms: rp.bedrooms || rp.rooms || 0,
        bathrooms: rp.bathrooms || 0,
        total_area: rp.area_m2 ? Number(rp.area_m2) : 0,
        address: rp.address || rp.neighborhood || "",
        city: rp.neighborhood || rp.city || "",
        // El `.webp` que publica roomix da 404 en su propio CDN el 12% de las veces
        // y la foto queda rota (ver `normalizarFotoRoomix`).
        images: fotos(rp.images),
        amenities: Array.isArray(rp.amenities) ? rp.amenities : [],
        source: "roomix",
        // Esta ficha es la que el asesor le manda a SU cliente, así que no lleva NINGÚN
        // rastro de la inmobiliaria que publica: ni nombre, ni logo, ni teléfono, ni los
        // links al aviso original. Cualquiera de esos datos manda al cliente directo al
        // colega. Todo eso vive en la tarjeta del Buscador IA, que es de uso interno.
      },
    }
  }

  const { data: p, error } = await supabase
    .from("properties")
    .select(
      "id, title, description, price, currency, property_type, status, bedrooms, bathrooms, total_area, covered_area, address, city, images, tokko_data, agency_id",
    )
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (error) {
    console.error("Ficha — falló la consulta a properties:", { id, error })
    return {
      ok: false,
      estado: 503,
      motivo: "No pudimos traer la propiedad en este momento. Probá de nuevo en unos segundos.",
    }
  }
  if (!p) {
    return { ok: false, estado: 404, motivo: "No se encontró la propiedad o no pertenece a tu agencia." }
  }

  const tags = (p.tokko_data as any)?.tags
  return {
    ok: true,
    propiedad: {
      title: p.title,
      description: p.description || "",
      price: p.price ? Number(p.price) : 0,
      currency: p.currency || "USD",
      property_type: p.property_type || "",
      status: p.status || "",
      bedrooms: p.bedrooms || 0,
      bathrooms: p.bathrooms || 0,
      total_area: Number(p.total_area || p.covered_area || 0),
      address: p.address || "",
      city: p.city || "",
      images: fotos(p.images),
      amenities: Array.isArray(tags)
        ? tags
            .map((t: any) => t?.name)
            .filter((n: any): n is string => typeof n === "string" && !!n)
            .slice(0, 30)
        : [],
      source: source === "agency" ? "agency" : "own",
      public_url: (p.tokko_data as any)?.public_url || null,
    },
  }
}
