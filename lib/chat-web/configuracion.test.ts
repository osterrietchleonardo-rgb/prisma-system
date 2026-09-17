import { describe, it, expect } from "vitest"
import { MINUTOS_ENTRE_RASTREOS, puedeRastrearDeNuevo, validarConfiguracion } from "./configuracion"

const base = {
  sitio: "centralrealestate.com.ar",
  whatsapp_destino: "+54 9 11 5060-4928",
  email_destino: "leads@centralrealestate.com.ar",
  secciones: [{ nombre: "Tasaciones", url: "https://centralrealestate.com.ar/tasaciones", resumen: "Valuamos tu propiedad" }],
}

describe("validarConfiguracion: lo que carga el director", () => {
  it("con lo mínimo, sale lista para guardar", () => {
    const r = validarConfiguracion(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.sitio).toBe("https://centralrealestate.com.ar/")
    // los dominios NO los escribe nadie: salen del sitio, así no hay forma de equivocarse
    expect(r.valor.dominios).toEqual(["centralrealestate.com.ar", "www.centralrealestate.com.ar"])
    expect(r.valor.whatsapp_destino).toBe("5491150604928")
    expect(r.valor.activo).toBe(false) // nace apagado
  })

  it("una dirección que no es un sitio se rechaza con un motivo entendible", () => {
    for (const malo of ["", "no es una url", "javascript:alert(1)"]) {
      const r = validarConfiguracion({ ...base, sitio: malo })
      expect(r.ok, malo).toBe(false)
      if (r.ok) return
      expect(r.errores.sitio).toMatch(/direcci[óo]n/i)
    }
  })

  it("el WhatsApp se guarda solo con números, venga como venga escrito", () => {
    for (const escrito of ["+54 9 11 5060-4928", "5491150604928", "54 9 11 50604928"]) {
      const r = validarConfiguracion({ ...base, whatsapp_destino: escrito })
      expect(r.ok, escrito).toBe(true)
      if (r.ok) expect(r.valor.whatsapp_destino).toBe("5491150604928")
    }
  })

  it("un WhatsApp que no puede ser un número se rechaza: si no, los leads se pierden en silencio", () => {
    for (const malo of ["", "1234", "no tengo"]) {
      const r = validarConfiguracion({ ...base, whatsapp_destino: malo })
      expect(r.ok, malo).toBe(false)
      if (!r.ok) expect(r.errores.whatsapp_destino).toBeTruthy()
    }
  })

  it("se puede mandar cada tipo de consulta a un WhatsApp distinto", () => {
    const r = validarConfiguracion({
      ...base,
      destinos_por_objetivo: { sumarse_equipo: "+54 11 4444-5555", vender_propiedad: "" },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.destinos_por_objetivo.sumarse_equipo).toBe("541144445555")
    // el vacío no se guarda: significa "usá el principal"
    expect(r.valor.destinos_por_objetivo.vender_propiedad).toBeUndefined()
  })

  it("una sección sin nombre o con un link que no es un link no entra", () => {
    const r = validarConfiguracion({
      ...base,
      secciones: [
        { nombre: "", url: "https://c.com/x", resumen: "" },
        { nombre: "Alquileres", url: "javascript:robar()", resumen: "" },
        { nombre: "Tasaciones", url: "https://c.com/tasaciones", resumen: "Valuamos" },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.secciones.map((s) => s.nombre)).toEqual(["Tasaciones"])
  })

  it("el color del chat acepta un hex y rechaza cualquier otra cosa", () => {
    expect(validarConfiguracion({ ...base, acento: "#b87333" })).toMatchObject({ ok: true })
    const vacio = validarConfiguracion({ ...base, acento: "" })
    expect(vacio.ok && vacio.valor.acento).toBeNull() // vacío = heredar la marca
    const malo = validarConfiguracion({ ...base, acento: "azul" })
    expect(malo.ok).toBe(false)
  })

  it("junta TODOS los errores, no el primero: el director corrige una vez", () => {
    const r = validarConfiguracion({ sitio: "nada", whatsapp_destino: "x", email_destino: "", secciones: [] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errores).sort()).toEqual(["email_destino", "sitio", "whatsapp_destino"])
  })

  // 17/9: el email es el canal que no depende de que Meta apruebe una plantilla, asi que es el
  // que va a funcionar primero. Sin email, el lead no llega a nadie.
  it("el email es obligatorio y se guarda en minusculas y sin espacios", () => {
    const r = validarConfiguracion({ ...base, email_destino: "  Leads@Central.COM.ar " })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.email_destino).toBe("leads@central.com.ar")
  })

  it("un email que no puede ser un email se rechaza", () => {
    for (const malo of ["", "leads", "leads@", "@central.com", "leads@central", "a b@c.com"]) {
      const r = validarConfiguracion({ ...base, email_destino: malo })
      expect(r.ok, malo).toBe(false)
      if (!r.ok) expect(r.errores.email_destino).toBeTruthy()
    }
  })

  it("la persona del equipo se elige de la lista: se guarda su id, no su telefono", () => {
    const id = "cdfcd033-e84a-4310-8113-f67449634131"
    const r = validarConfiguracion({ ...base, perfil_equipo_id: id })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.perfil_equipo_id).toBe(id)
  })

  it("sin elegir a nadie, queda vacio y los leads van al destino principal", () => {
    for (const vacio of ["", null, undefined, "ninguno"]) {
      const r = validarConfiguracion({ ...base, perfil_equipo_id: vacio })
      expect(r.ok, String(vacio)).toBe(true)
      if (r.ok) expect(r.valor.perfil_equipo_id).toBeNull()
    }
  })

  it("un id que no es un id se rechaza en vez de guardarse roto", () => {
    const r = validarConfiguracion({ ...base, perfil_equipo_id: "el-juan" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.perfil_equipo_id).toBeTruthy()
  })
})

describe("puedeRastrearDeNuevo: leer el sitio cuesta plata y tiempo", () => {
  const ahora = Date.parse("2026-09-17T12:00:00Z")
  it("la primera vez, sí", () => {
    expect(puedeRastrearDeNuevo(null, ahora).puede).toBe(true)
  })
  it("recién rastreado, no, y dice cuánto falta", () => {
    const hace1min = new Date(ahora - 60_000).toISOString()
    const r = puedeRastrearDeNuevo(hace1min, ahora)
    expect(r.puede).toBe(false)
    if (r.puede) return
    expect(r.faltanMinutos).toBe(MINUTOS_ENTRE_RASTREOS - 1)
  })
  it("pasada la espera, sí", () => {
    const viejo = new Date(ahora - (MINUTOS_ENTRE_RASTREOS + 1) * 60_000).toISOString()
    expect(puedeRastrearDeNuevo(viejo, ahora).puede).toBe(true)
  })
  it("una fecha rota no bloquea para siempre", () => {
    expect(puedeRastrearDeNuevo("cualquier cosa", ahora).puede).toBe(true)
  })
})
