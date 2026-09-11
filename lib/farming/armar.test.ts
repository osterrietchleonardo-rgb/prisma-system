import { describe, it, expect } from "vitest"
import { armarRespuesta, armarZona, colegasActivos, nombreDe, type FilaPerfil, type FilaZona } from "./armar"

/**
 * De filas de la base a lo que ve la pantalla. Reglas:
 *  1. "mías" son las que tengo como dueño; "compartidas conmigo" las que otro me sumó;
 *     "ajenas" son solo contornos (forma + de quién), nunca la zona completa.
 *  2. El director recibe "equipo" con todas; el asesor lo recibe vacío.
 *  3. Colegas = asesores ACTIVOS de la agencia, sin uno mismo, sin pausados ni eliminados.
 *  4. Un perfil sin nombre no rompe nada: "otro asesor".
 */

const cuadrado = { type: "Polygon" as const, coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const YO = "u-yo", JUAN = "u-juan", MARIA = "u-maria", PAUSADO = "u-pausado", DIRECTOR = "u-dir"

const perfiles: FilaPerfil[] = [
  { id: YO, full_name: "Leo", role: "asesor", estado: "activo" },
  { id: JUAN, full_name: "Juan Pérez", role: "asesor", estado: "activo" },
  { id: MARIA, full_name: null, role: "asesor", estado: null },
  { id: PAUSADO, full_name: "Pausado", role: "asesor", estado: "pausado" },
  { id: DIRECTOR, full_name: "El Director", role: "director", estado: "activo" },
]

const fila = (id: string, owner: string, nombre = "Zona"): FilaZona => ({
  id, agency_id: "ag", owner_user_id: owner, nombre, geojson: cuadrado, area_km2: 1.02,
  origen_mapa_zona_id: null, estado: "activa", trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z",
})

describe("nombreDe y colegasActivos", () => {
  it("un perfil sin nombre se llama 'otro asesor'", () => {
    expect(nombreDe(perfiles, MARIA)).toBe("otro asesor")
    expect(nombreDe(perfiles, "no-existe")).toBe("otro asesor")
    expect(nombreDe(perfiles, JUAN)).toBe("Juan Pérez")
  })

  it("colegas: asesores activos, sin uno mismo, sin pausados, sin el director", () => {
    expect(colegasActivos(perfiles, YO).map((c) => c.id)).toEqual([JUAN, MARIA])
  })
})

describe("armarZona", () => {
  it("cuenta los pedazos y resuelve los nombres de los compartidos", () => {
    const z = armarZona(fila("z1", YO), [{ zona_id: "z1", user_id: JUAN, agregado_por: YO, created_at: "" }], perfiles)
    expect(z.pedazos).toBe(1)
    expect(z.owner_nombre).toBe("Leo")
    expect(z.compartida_con).toEqual([{ id: JUAN, nombre: "Juan Pérez" }])
  })
})

describe("armarRespuesta", () => {
  const filas = [fila("z-mia", YO, "Mía"), fila("z-juan", JUAN, "De Juan"), fila("z-maria", MARIA, "De María")]
  const compartidas = [{ zona_id: "z-maria", user_id: YO, agregado_por: MARIA, created_at: "" }]

  it("asesor: mías, compartidas conmigo, y el resto como contorno", () => {
    const r = armarRespuesta({ filas, compartidas, perfiles, userId: YO, role: "asesor" })
    expect(r.mias.map((z) => z.id)).toEqual(["z-mia"])
    expect(r.compartidas_conmigo.map((z) => z.id)).toEqual(["z-maria"])
    expect(r.ajenas.map((z) => z.id)).toEqual(["z-juan"])
    expect(Object.keys(r.ajenas[0]).sort()).toEqual(["geojson", "id", "nombre", "owner_nombre"])
    expect(r.equipo).toEqual([])
    expect(r.colegas.map((c) => c.id)).toEqual([JUAN, MARIA])
    expect(r.topes).toEqual({ max_zonas: 3, max_km2: 5 })
  })

  it("director: nada propio, todas en equipo", () => {
    const r = armarRespuesta({ filas, compartidas, perfiles, userId: DIRECTOR, role: "director" })
    expect(r.mias).toEqual([])
    expect(r.equipo.map((z) => z.id)).toEqual(["z-mia", "z-juan", "z-maria"])
    expect(r.ajenas.map((z) => z.id)).toEqual(["z-mia", "z-juan", "z-maria"])
  })
})
