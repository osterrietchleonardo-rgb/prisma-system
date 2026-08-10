// Consulta del mapa: une la cartera de la agencia con la red de colaboracion.
//
// Se separa del endpoint HTTP a proposito, para poder verificarla contra la base real
// con un script, sin necesidad de sesion ni cookies.
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizarTexto } from "./lugares.ts"
import { valoresDeTipo } from "./tipos-propiedad.ts"
import type { BBox, FiltrosMapa, PropiedadMapa, RespuestaMapa } from "./tipos.ts"

/** Tope duro de puntos por respuesta, contando las dos fuentes JUNTAS. */
export const TOPE_PUNTOS = 1000

/** Lo que devuelven mapa_cartera y mapa_colaboracion (las dos, la misma forma). */
interface FilaMapa {
  ref: string
  title: string | null
  price: number | string | null
  currency: string | null
  property_type: string | null
  status: string | null
  bedrooms: number | null
  bathrooms: number | null
  total_area: number | string | null
  address: string | null
  city: string | null
  foto: string | null
  lat: number | null
  lng: number | null
  assigned_agent_id: string | null
  agent_name: string | null
  agent_email: string | null
  agencia_nombre: string | null
  canonical_url: string | null
}

const num = (v: number | string | null): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Pasa una fila a la forma que ya usa el chat, para poder reusar tal cual la tarjeta
 * con carrusel y el modal de detalle (components/shared/consultor-results.tsx).
 *
 * `description` viene vacia y `images` trae solo la portada: el mapa pide lo justo para
 * dibujar. La ficha completa se pide aparte al clickear el punto (ver la migracion
 * 20260805130000, donde estan los numeros que justifican esto).
 */
function aPropiedadMapa(f: FilaMapa, esColaboracion: boolean, userId: string): PropiedadMapa {
  const source = esColaboracion ? "roomix" : f.assigned_agent_id === userId ? "own" : "agency"
  return {
    id: esColaboracion ? `roomix_${f.ref}` : f.ref,
    title: f.title,
    description: null,
    price: num(f.price),
    currency: f.currency || "USD",
    property_type: f.property_type || "",
    status: f.status || "Venta",
    bedrooms: f.bedrooms ?? 0,
    bathrooms: f.bathrooms ?? 0,
    total_area: num(f.total_area),
    address: f.address,
    city: f.city,
    images: f.foto ? [f.foto] : [],
    similarity: 0,
    source,
    agent_name: f.agent_name || (esColaboracion ? "" : "Sin asignar"),
    agent_email: f.agent_email || "",
    lat: f.lat,
    lng: f.lng,
    ...(esColaboracion
      ? {
          roomix_agency_name: f.agencia_nombre || "Inmobiliaria colaboradora",
          canonical_url: f.canonical_url || undefined,
        }
      : {}),
  }
}

export async function consultarMapa(
  admin: SupabaseClient,
  params: { bbox: BBox; filtros: FiltrosMapa; agencyId: string; userId: string },
): Promise<RespuestaMapa> {
  const { bbox, filtros, agencyId, userId } = params

  // El barrio viaja normalizado (minusculas, sin acentos) porque las dos tablas lo
  // escriben distinto: la cartera "Nuñez" y la red "Núñez". Las funciones SQL comparan
  // normalizado contra normalizado.
  const barrio = filtros.barrio ? normalizarTexto(filtros.barrio) : null

  const comunes = {
    p_sur: bbox.sur,
    p_oeste: bbox.oeste,
    p_norte: bbox.norte,
    p_este: bbox.este,
    p_operacion: filtros.operacion,
    p_precio_min: filtros.precio_min,
    p_precio_max: filtros.precio_max,
    p_moneda: filtros.moneda,
    p_ambientes_min: filtros.ambientes_min,
    p_barrio: barrio,
  }

  // Una etiqueta de pantalla puede tapar varios valores de la base, y no siempre las dos
  // fuentes tienen el tipo elegido (la red no distingue lotes). Ver tipos-propiedad.ts.
  const tiposCartera = valoresDeTipo(filtros.tipo, "cartera")
  const tiposColab = valoresDeTipo(filtros.tipo, "colaboracion")

  // Lista vacia = esa fuente no tiene este tipo. NO se consulta: la base tendria que
  // recorrer el rectangulo entero para devolver cero, y eso es lo que hacia saltar el
  // "canceling statement due to statement timeout" (16.439 ms medidos).
  const carteraSinEseTipo = tiposCartera !== null && tiposCartera.length === 0
  const colabSinEseTipo = tiposColab !== null && tiposColab.length === 0

  const quiereCartera =
    (filtros.fuentes.includes("own") || filtros.fuentes.includes("agency")) && !carteraSinEseTipo
  const quiereColaboracion = filtros.fuentes.includes("roomix") && !colabSinEseTipo

  // Las dos consultas van EN PARALELO. Se le podria pedir a la colaboracion solo lo que
  // sobra despues de contar la cartera, pero eso obliga a esperar una para lanzar la otra
  // y duplica la latencia de red. Como la cartera entera son ~630 propiedades, se piden
  // las dos juntas y se recorta despues: mismo resultado, la mitad de espera.
  const [resCartera, resColaboracion] = await Promise.all([
    quiereCartera
      ? admin.rpc("mapa_cartera", {
          ...comunes,
          p_tipos: tiposCartera,
          p_agency_id: agencyId,
          p_limit: TOPE_PUNTOS,
        })
      : null,
    quiereColaboracion
      ? admin.rpc("mapa_colaboracion", {
          ...comunes,
          p_tipos: tiposColab,
          p_limit: TOPE_PUNTOS,
        })
      : null,
  ])

  if (resCartera?.error) throw resCartera.error
  if (resColaboracion?.error) throw resColaboracion.error

  // La cartera propia manda: se arma primero, asi nunca queda afuera por culpa del tope.
  const propias = ((resCartera?.data as FilaMapa[] | null) ?? [])
    .map((f) => aPropiedadMapa(f, false, userId))
    // "Mias" y "Agencia" son casillas separadas, pero la base no sabe quien esta mirando.
    .filter((p) => filtros.fuentes.includes(p.source))

  const filasColab = (resColaboracion?.data as FilaMapa[] | null) ?? []
  const resto = Math.max(TOPE_PUNTOS - propias.length, 0)
  const colaboracion = filasColab.slice(0, resto).map((f) => aPropiedadMapa(f, true, userId))

  // "Vino llena la bandeja" = puede haber mas afuera.
  //
  // Antes esto se resolvia pidiendo TOPE_PUNTOS + 1 y mirando si volvia el de mas. NO
  // FUNCIONA: PostgREST —la capa REST de Supabase— recorta toda respuesta a 1.000 filas
  // por su cuenta, sin avisar, aunque la funcion SQL tenga LIMIT 1001. Medido el
  // 2026-08-10 sobre el mismo rectangulo (Chacarita a Recoleta, 40.036 coincidencias):
  //
  //   p_limit=999 -> 999 filas    p_limit=1001 -> 1000 filas
  //   p_limit=1000 -> 1000 filas  p_limit=2000 -> 1000 filas
  //
  // Como el de mas nunca llegaba, `truncado` daba siempre false y el mapa mostraba
  // 1.000 de 40.036 diciendo "1000 propiedades a la vista", como si fueran todas.
  //
  // Ahora se toma como recortado el hecho de llenar el cupo. Puede dar una falsa alarma
  // en el caso exacto de que haya justo 1.000: preferible a esconder 39.000.
  const truncado = quiereColaboracion && filasColab.length > 0 && filasColab.length >= resto

  const propiedades = [...propias, ...colaboracion]
  return {
    propiedades,
    truncado,
    total_devuelto: propiedades.length,
    // Se avisa cuando una fuente quedo afuera por el tipo elegido, para que el usuario
    // no crea que no hay nada cuando en realidad no se pudo preguntar.
    sin_ese_tipo: { cartera: carteraSinEseTipo, colaboracion: colabSinEseTipo },
  }
}
