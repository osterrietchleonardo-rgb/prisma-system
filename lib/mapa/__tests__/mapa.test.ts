// Tests de la logica pura del mapa. Se corren con:
//   node --test lib/mapa/__tests__/mapa.test.ts
//
// Los imports llevan la extension .ts a proposito: Node la exige para correr
// TypeScript directo (verificado en Node v24.12.0). tsconfig lo habilita con
// allowImportingTsExtensions.
import { test, describe } from "node:test"
import assert from "node:assert/strict"

import { bboxDePoligono, parsearBBox, serializarBBox } from "../bbox.ts"
import { leerFiltros } from "../filtros.ts"
import { filtrarPorTrazos } from "../filtro-poligono.ts"
import { agruparPorUbicacion } from "../agrupar.ts"
import { consultarMapa, TOPE_PUNTOS } from "../consulta.ts"
import { normalizarTexto, precioCreible, recuadroDePunto, sacarBarriosRepetidos, unirLugares } from "../lugares.ts"
import { TIPOS_MAPA, esTipoValido, etiquetaDeTipo, tipoEnCastellano, valoresDeTipo } from "../tipos-propiedad.ts"
import type { PropiedadMapa } from "../tipos.ts"

// ─────────────────────────── bbox ───────────────────────────

describe("parsearBBox", () => {
  test("acepta un rectangulo valido", () => {
    assert.deepEqual(parsearBBox("-34.60,-58.44,-34.56,-58.40"), {
      sur: -34.6, oeste: -58.44, norte: -34.56, este: -58.4,
    })
  })

  test("rechaza null y vacio", () => {
    assert.equal(parsearBBox(null), null)
    assert.equal(parsearBBox(""), null)
  })

  test("rechaza texto que no son numeros", () => {
    assert.equal(parsearBBox("a,b,c,d"), null)
  })

  test("rechaza si no son exactamente 4 numeros", () => {
    assert.equal(parsearBBox("-34.60,-58.44,-34.56"), null)
    assert.equal(parsearBBox("-34.60,-58.44,-34.56,-58.40,1"), null)
  })

  test("rechaza sur mayor que norte (rectangulo dado vuelta)", () => {
    assert.equal(parsearBBox("-34.56,-58.44,-34.60,-58.40"), null)
  })

  test("rechaza latitud fuera de rango", () => {
    assert.equal(parsearBBox("200,-58.44,201,-58.40"), null)
  })

  test("rechaza longitud fuera de rango", () => {
    assert.equal(parsearBBox("-34.60,-500,-34.56,-58.40"), null)
  })

  test("rechaza infinitos y NaN", () => {
    assert.equal(parsearBBox("Infinity,-58.44,-34.56,-58.40"), null)
    assert.equal(parsearBBox("NaN,-58.44,-34.56,-58.40"), null)
  })
})

describe("serializarBBox", () => {
  test("ida y vuelta devuelve lo mismo", () => {
    const original = { sur: -34.6, oeste: -58.44, norte: -34.56, este: -58.4 }
    assert.deepEqual(parsearBBox(serializarBBox(original)), original)
  })
})

describe("bboxDePoligono", () => {
  test("encierra el trazo", () => {
    assert.deepEqual(
      bboxDePoligono({ type: "Polygon", coordinates: [[[-58.44, -34.60], [-58.40, -34.60], [-58.40, -34.56], [-58.44, -34.60]]] }),
      { sur: -34.6, oeste: -58.44, norte: -34.56, este: -58.4 },
    )
  })

  test("un trazo sin puntos usables devuelve null en vez de romper", () => {
    assert.equal(bboxDePoligono({}), null)
    assert.equal(bboxDePoligono({ type: "Polygon", coordinates: [[]] }), null)
    assert.equal(bboxDePoligono(null), null)
  })

  test("ignora los pares con basura en vez de contaminar el rectangulo", () => {
    const b = bboxDePoligono({
      type: "Polygon",
      coordinates: [[[-58.44, -34.60], ["a", "b"], [-58.40, -34.56]]],
    })
    assert.deepEqual(b, { sur: -34.6, oeste: -58.44, norte: -34.56, este: -58.4 })
  })
})

// ────────────────────────── filtros ─────────────────────────

describe("leerFiltros", () => {
  const leer = (qs: string) => leerFiltros(new URLSearchParams(qs))

  test("sin parametros usa los valores por defecto", () => {
    const f = leer("")
    assert.equal(f.operacion, "Venta")
    assert.equal(f.moneda, "USD")
    assert.deepEqual(f.fuentes, ["own", "agency", "roomix"])
    assert.equal(f.precio_min, null)
    assert.equal(f.precio_max, null)
  })

  test("un precio invalido queda en null, nunca NaN", () => {
    const f = leer("precio_min=hola")
    assert.equal(f.precio_min, null)
    assert.ok(!Number.isNaN(f.precio_min as any))
  })

  test("lee precios validos", () => {
    const f = leer("precio_min=100000&precio_max=400000")
    assert.equal(f.precio_min, 100000)
    assert.equal(f.precio_max, 400000)
  })

  test("descarta fuentes desconocidas", () => {
    assert.deepEqual(leer("fuentes=own,inventada").fuentes, ["own"])
  })

  test("si no queda ninguna fuente valida, vuelve a las tres", () => {
    assert.deepEqual(leer("fuentes=inventada").fuentes, ["own", "agency", "roomix"])
    assert.deepEqual(leer("fuentes=").fuentes, ["own", "agency", "roomix"])
  })

  test("solo acepta Venta o Alquiler", () => {
    assert.equal(leer("operacion=Alquiler").operacion, "Alquiler")
    assert.equal(leer("operacion=cualquiera").operacion, "Venta")
  })

  test("acepta un tipo de la lista", () => {
    assert.equal(leer("tipo=departamento").tipo, "departamento")
  })

  test("un tipo inventado se ignora, no se pasa a la consulta", () => {
    // Este era el bug: "Departamento" llegaba tal cual a la base, no coincidia con
    // ningun valor y la consulta escaneaba el rectangulo entero hasta el timeout.
    assert.equal(leer("tipo=Departamento").tipo, null)
    assert.equal(leer("tipo=Local Comercial").tipo, null)
    assert.equal(leer("tipo=").tipo, null)
  })
})

// ─────────────── tipos de propiedad (etiqueta -> valores reales) ───────────────

describe("tipos-propiedad", () => {
  test("todos los valores de la lista se validan a si mismos", () => {
    for (const t of TIPOS_MAPA) assert.ok(esTipoValido(t.valor), `${t.valor} deberia ser valido`)
  })

  test("los valores son unicos", () => {
    const vals = TIPOS_MAPA.map((t) => t.valor)
    assert.equal(new Set(vals).size, vals.length)
  })

  test("cada opcion existe al menos en UNA de las dos fuentes", () => {
    for (const t of TIPOS_MAPA) {
      assert.ok(
        t.cartera.length > 0 || t.colaboracion.length > 0,
        `${t.valor} no existe en ninguna fuente: no habria que ofrecerlo`,
      )
    }
  })

  test("sin tipo elegido no hay filtro (null, no lista vacia)", () => {
    assert.equal(valoresDeTipo(null, "cartera"), null)
    assert.equal(valoresDeTipo(null, "colaboracion"), null)
  })

  test("un tipo inventado se trata como 'sin filtro', no como 'sin resultados'", () => {
    // Devolver [] dejaria el mapa vacio sin explicacion por un parametro mal escrito.
    assert.equal(valoresDeTipo("inventado", "cartera"), null)
  })

  test("Departamento traduce a los valores reales de cada tabla", () => {
    assert.deepEqual(valoresDeTipo("departamento", "cartera"), ["Departamento", "Condo"])
    assert.deepEqual(valoresDeTipo("departamento", "colaboracion"), ["Apartment"])
  })

  test("Lote existe en la cartera pero NO en la red: lista vacia, no null", () => {
    // La diferencia importa: [] significa "no preguntes, no lo distingue".
    assert.deepEqual(valoresDeTipo("lote", "cartera"), ["Lote"])
    assert.deepEqual(valoresDeTipo("lote", "colaboracion"), [])
  })

  test("los valores crudos de la base se muestran en castellano", () => {
    assert.equal(tipoEnCastellano("Apartment"), "Departamento")
    assert.equal(tipoEnCastellano("Accommodation"), "Comercial y otros")
    assert.equal(tipoEnCastellano("Bussiness Premises"), "Local comercial")
  })

  test("los que ya estan en castellano pasan derecho, y el vacio no dice 'undefined'", () => {
    assert.equal(tipoEnCastellano("Casa"), "Casa")
    assert.equal(tipoEnCastellano("Oficina"), "Oficina")
    assert.equal(tipoEnCastellano(null), "")
    assert.equal(tipoEnCastellano(""), "")
  })

  test("etiquetaDeTipo devuelve el texto de pantalla y null si no existe", () => {
    assert.equal(etiquetaDeTipo("casa"), "Casa / PH")
    assert.equal(etiquetaDeTipo("inventado"), null)
    assert.equal(etiquetaDeTipo(null), null)
  })
})

// ──────────────────── recorte por el lapiz ──────────────────

// Cuadrado alrededor de (0,0), de -1 a 1 en ambos ejes.
const cuadradoCentro = {
  type: "Polygon",
  coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
}
// Cuadrado lejos, alrededor de (10,10).
const cuadradoLejos = {
  type: "Polygon",
  coordinates: [[[9, 9], [11, 9], [11, 11], [9, 11], [9, 9]]],
}

const prop = (id: string, lat: number | null, lng: number | null) => ({ id, lat, lng })

describe("filtrarPorTrazos", () => {
  test("sin trazos devuelve todas", () => {
    const todas = [prop("a", 0, 0), prop("b", 50, 50)]
    assert.deepEqual(filtrarPorTrazos(todas, []), todas)
  })

  test("un trazo deja solo las de adentro", () => {
    const r = filtrarPorTrazos([prop("dentro", 0, 0), prop("fuera", 50, 50)], [cuadradoCentro])
    assert.deepEqual(r.map((p) => p.id), ["dentro"])
  })

  test("dos trazos SE SUMAN (union, no interseccion)", () => {
    const r = filtrarPorTrazos(
      [prop("centro", 0, 0), prop("lejos", 10, 10), prop("ninguno", 50, 50)],
      [cuadradoCentro, cuadradoLejos],
    )
    assert.deepEqual(r.map((p) => p.id).sort(), ["centro", "lejos"])
  })

  test("una propiedad sin coordenadas queda afuera y no rompe", () => {
    const r = filtrarPorTrazos([prop("sin", null, null), prop("con", 0, 0)], [cuadradoCentro])
    assert.deepEqual(r.map((p) => p.id), ["con"])
  })

  test("un trazo invalido se ignora en vez de tumbar el filtro", () => {
    const r = filtrarPorTrazos([prop("a", 0, 0)], [{} as any, cuadradoCentro])
    assert.deepEqual(r.map((p) => p.id), ["a"])
  })

  test("si TODOS los trazos son invalidos no devuelve nada (no finge que no hay filtro)", () => {
    assert.deepEqual(filtrarPorTrazos([prop("a", 0, 0)], [{} as any]), [])
  })

  test("un punto sobre el borde: se deja asentado que Turf lo cuenta adentro", () => {
    const r = filtrarPorTrazos([prop("borde", 1, 0)], [cuadradoCentro])
    assert.equal(r.length, 1)
  })
})

// ───────────── un pin por ubicacion (duplicados) ────────────

const aviso = (o: Partial<PropiedadMapa> & { id: string }): PropiedadMapa => ({
  lat: -34.6,
  lng: -58.44,
  price: 100000,
  total_area: 50,
  property_type: "Departamento",
  source: "roomix",
  roomix_agency_name: "Inmobiliaria A",
  // El resto no interviene en el agrupado, pero PropiedadMapa los pide.
  title: "Departamento",
  description: null,
  currency: "USD",
  status: "Venta",
  bedrooms: 2,
  bathrooms: 1,
  address: "Alguna calle 100",
  images: [],
  similarity: 0,
  agent_name: "",
  agent_email: "",
  ...o,
})

describe("agruparPorUbicacion", () => {
  test("avisos en coordenadas distintas dan pines distintos", () => {
    const g = agruparPorUbicacion([aviso({ id: "1" }), aviso({ id: "2", lat: -34.7 })])
    assert.equal(g.length, 2)
  })

  test("avisos en la misma coordenada dan UN solo pin con las dos adentro", () => {
    const g = agruparPorUbicacion([aviso({ id: "1" }), aviso({ id: "2", price: 200000 })])
    assert.equal(g.length, 1)
    assert.equal(g[0].propiedades.length, 2)
  })

  test("las de la cartera mandan: el pin va dorado aunque haya colaboracion", () => {
    const g = agruparPorUbicacion([
      aviso({ id: "colab", source: "roomix" }),
      aviso({ id: "mia", source: "own" }),
    ])
    assert.equal(g.length, 1)
    assert.equal(g[0].fuente_del_pin, "own")
  })

  test("agency le gana a roomix pero pierde con own", () => {
    assert.equal(
      agruparPorUbicacion([aviso({ id: "c", source: "roomix" }), aviso({ id: "a", source: "agency" })])[0].fuente_del_pin,
      "agency",
    )
  })

  test("marca como misma propiedad los avisos de DISTINTAS inmobiliarias que coinciden", () => {
    const g = agruparPorUbicacion([
      aviso({ id: "1", roomix_agency_name: "LAMS" }),
      aviso({ id: "2", roomix_agency_name: "Pernice" }),
    ])
    assert.equal(g[0].posibles_repetidas.length, 1)
    assert.deepEqual(g[0].posibles_repetidas[0].sort(), ["1", "2"])
  })

  test("NO marca los de una MISMA inmobiliaria: son unidades distintas del edificio", () => {
    // Caso real verificado: 3 deptos de Fuschetto, mismo precio y m2, pisos 1/2/3.
    const g = agruparPorUbicacion([
      aviso({ id: "piso1", roomix_agency_name: "Fuschetto" }),
      aviso({ id: "piso2", roomix_agency_name: "Fuschetto" }),
      aviso({ id: "piso3", roomix_agency_name: "Fuschetto" }),
    ])
    assert.deepEqual(g[0].posibles_repetidas, [])
    assert.equal(g[0].propiedades.length, 3, "las tres tienen que seguir estando")
  })

  test("distinto precio o superficie no es la misma propiedad", () => {
    const g = agruparPorUbicacion([
      aviso({ id: "1", roomix_agency_name: "LAMS", price: 100000 }),
      aviso({ id: "2", roomix_agency_name: "Pernice", price: 999999 }),
    ])
    assert.deepEqual(g[0].posibles_repetidas, [])
  })

  test("nunca se pierde una propiedad: la suma de los pines da el total", () => {
    const entrada = [
      aviso({ id: "1" }), aviso({ id: "2" }), aviso({ id: "3", lat: -34.7 }),
      aviso({ id: "4", roomix_agency_name: "Otra" }),
    ]
    const total = agruparPorUbicacion(entrada).reduce((n, g) => n + g.propiedades.length, 0)
    assert.equal(total, entrada.length)
  })

  test("las que no tienen coordenadas no arman pin (el panel las lista aparte)", () => {
    const g = agruparPorUbicacion([aviso({ id: "sin", lat: null, lng: null }), aviso({ id: "con" })])
    assert.equal(g.length, 1)
    assert.deepEqual(g[0].propiedades.map((p: any) => p.id), ["con"])
  })
})

// ─────────────────────── el aviso de "hay mas" ───────────────────────
//
// Regresion del 2026-08-10. La deteccion original pedia TOPE_PUNTOS + 1 filas y miraba
// si volvia la de mas. PostgREST recorta toda respuesta a 1.000 filas por su cuenta, asi
// que la de mas no volvia NUNCA: el mapa mostraba 1.000 de 40.036 diciendo "1000
// propiedades a la vista". Estos tests fuerzan el tope contra un Supabase de mentira.

/** Un Supabase falso que devuelve las filas que se le pidan, sin tocar la red. */
function supabaseFalso(filasPorFuncion: Record<string, number>) {
  const fila = (i: number) => ({
    ref: `r${i}`, title: null, price: 1, currency: "USD", property_type: "Apartment",
    status: "Venta", bedrooms: null, bathrooms: null, total_area: null,
    address: null, city: null, foto: null, lat: -34.6, lng: -58.4,
    assigned_agent_id: null, agent_name: "", agent_email: "",
    agencia_nombre: null, canonical_url: null,
  })
  return {
    rpc: async (nombre: string, params: any) => ({
      data: Array.from(
        { length: Math.min(filasPorFuncion[nombre] ?? 0, params.p_limit, TOPE_PUNTOS) },
        (_, i) => fila(i),
      ),
      error: null,
    }),
  } as any
}

const PARAMS_BASE = {
  bbox: { sur: -34.7, oeste: -58.5, norte: -34.5, este: -58.3 },
  filtros: {
    operacion: "Venta", tipo: null, precio_min: null, precio_max: null,
    moneda: "USD", ambientes_min: null, fuentes: ["own", "agency", "roomix"],
  } as any,
  agencyId: "a", userId: "u",
}

describe("consultarMapa · aviso de resultados recortados", () => {
  test("avisa cuando la colaboracion llena el cupo (aunque PostgREST corte en 1000)", async () => {
    // 40.036 disponibles, pero la capa REST solo deja pasar 1.000.
    const r = await consultarMapa(supabaseFalso({ mapa_colaboracion: 40036 }), PARAMS_BASE)
    assert.equal(r.propiedades.length, TOPE_PUNTOS)
    assert.equal(r.truncado, true, "con el cupo lleno el mapa TIENE que avisar")
  })

  test("no avisa cuando entra todo con lugar de sobra", async () => {
    const r = await consultarMapa(supabaseFalso({ mapa_colaboracion: 120 }), PARAMS_BASE)
    assert.equal(r.propiedades.length, 120)
    assert.equal(r.truncado, false)
  })

  test("no avisa cuando la colaboracion no devuelve nada", async () => {
    const r = await consultarMapa(supabaseFalso({}), PARAMS_BASE)
    assert.equal(r.propiedades.length, 0)
    assert.equal(r.truncado, false, "cero resultados no es un recorte")
  })
})

// ─────────────────────── buscador de lugares ───────────────────────

describe("normalizarTexto", () => {
  test("saca los acentos: Nuñez y Núñez son el mismo barrio", () => {
    assert.equal(normalizarTexto("Núñez"), normalizarTexto("Nuñez"))
    assert.equal(normalizarTexto("Núñez"), "nunez")
  })

  test("ignora mayusculas y espacios de los costados", () => {
    assert.equal(normalizarTexto("  Villa URQUIZA "), "villa urquiza")
  })

  test("da lo MISMO que lower(unaccent(btrim())) de Postgres", () => {
    // Los pares salen de la base real: si esto se desincroniza, el buscador muestra
    // repetido el mismo barrio (uno vendria del catalogo y otro de la cartera).
    for (const [crudo, esperado] of [
      ["Núñez", "nunez"],
      ["Belgrano R", "belgrano r"],
      ["Barrio Vicente López", "barrio vicente lopez"],
      ["Countries/B.Cerrado (G. Rodriguez)", "countries/b.cerrado (g. rodriguez)"],
    ]) {
      assert.equal(normalizarTexto(crudo), esperado)
    }
  })
})

describe("recuadroDePunto", () => {
  test("arma un recuadro centrado en el punto", () => {
    const b = recuadroDePunto(-34.6, -58.4)
    assert.ok(b.sur < -34.6 && b.norte > -34.6)
    assert.ok(b.oeste < -58.4 && b.este > -58.4)
    assert.equal(Math.round(((b.norte - b.sur) / 2) * 1e6) / 1e6, 0.0045)
  })
})

describe("unirLugares", () => {
  const lugar = (tipo: any, nombre: string): any => ({
    id: `${tipo}:${nombre}`, tipo, nombre, detalle: "", bbox: { sur: 0, oeste: 0, norte: 0, este: 0 },
  })

  test("el que viene primero gana", () => {
    const r = unirLugares([lugar("zona", "Palermo")], [lugar("zona", "PALERMO")])
    assert.equal(r.length, 1)
    assert.equal(r[0].nombre, "Palermo")
  })

  test("mismo nombre pero distinto tipo NO es repetido", () => {
    const r = unirLugares([lugar("zona", "Belgrano")], [lugar("barrio", "Belgrano")])
    assert.equal(r.length, 2)
  })

  test("respeta el orden de las listas", () => {
    const r = unirLugares([lugar("zona", "A")], [lugar("cartera", "B")], [lugar("barrio", "C")])
    assert.deepEqual(r.map((l: any) => l.tipo), ["zona", "cartera", "barrio"])
  })
})

describe("sacarBarriosRepetidos", () => {
  const lugar = (tipo: any, nombre: string): any => ({
    id: `${tipo}:${nombre}`, tipo, nombre, detalle: "", bbox: { sur: 0, oeste: 0, norte: 0, este: 0 },
  })

  test("si el barrio ya esta en tu cartera, no se repite el de la red", () => {
    const red = sacarBarriosRepetidos(
      [lugar("barrio", "Núñez"), lugar("barrio", "Palermo")],
      [lugar("cartera", "Nuñez")],
    )
    assert.deepEqual(red.map((l: any) => l.nombre), ["Palermo"])
  })

  test("sin cartera no saca nada", () => {
    const red = sacarBarriosRepetidos([lugar("barrio", "Palermo")], [])
    assert.equal(red.length, 1)
  })
})

describe("leerFiltros · barrio", () => {
  test("lo toma tal cual viene, con acentos y todo", () => {
    const f = leerFiltros(new URLSearchParams("barrio=Núñez"))
    assert.equal(f.barrio, "Núñez")
    // Lo que viaja a la base es la version normalizada, y tiene que dar el mismo valor
    // que guarda mapa_barrios.normalizado.
    assert.equal(normalizarTexto(f.barrio!), "nunez")
  })

  test("sin barrio en la URL no hay filtro", () => {
    assert.equal(leerFiltros(new URLSearchParams("operacion=Venta")).barrio, null)
  })

  test("un barrio vacio es no-filtrar, no filtrar-por-nada", () => {
    // `barrio=` mandaria "" a la consulta y ningun barrio se llama "": el mapa quedaria
    // vacio sin motivo visible.
    assert.equal(leerFiltros(new URLSearchParams("barrio=")).barrio, null)
    assert.equal(leerFiltros(new URLSearchParams("barrio=%20%20")).barrio, null)
  })
})

describe("precioCreible", () => {
  const venta = (price: number | null) => ({ price, status: "Venta" })
  const alquiler = (price: number | null) => ({ price, status: "Alquiler" })

  test("US$ 1 no es un precio, es relleno", () => {
    assert.equal(precioCreible(venta(1)), false)
    assert.equal(precioCreible(alquiler(1)), false)
  })

  test("en venta, menos de 1.000 no existe", () => {
    assert.equal(precioCreible(venta(111)), false)
    assert.equal(precioCreible(venta(999)), false)
    assert.equal(precioCreible(venta(1000)), true)
  })

  test("en alquiler, 500 es un precio de lo mas normal", () => {
    // El corte de venta NO puede aplicarse al alquiler: dejaria como "Consultar" a los
    // alquileres baratos, que son la mayoria de la red.
    assert.equal(precioCreible(alquiler(500)), true)
    assert.equal(precioCreible(alquiler(2)), true)
  })

  test("sin precio tampoco es creible", () => {
    assert.equal(precioCreible(venta(null)), false)
    assert.equal(precioCreible(venta(0)), false)
  })

  test("los precios normales pasan", () => {
    assert.equal(precioCreible(venta(185000)), true)
  })
})
