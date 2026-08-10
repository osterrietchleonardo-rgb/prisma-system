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
