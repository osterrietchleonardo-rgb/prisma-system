import { describe, it, expect } from "vitest"
import { armarAvisoDerivacion, enviarDerivacionPorEmail, linkWhatsApp, telefonoUsable } from "./derivar"

const base = {
  nombreAgencia: "Central",
  nombreBot: "Sofía",
  objetivo: "vender_propiedad" as const,
  resumen: "Quiere vender un PH en Belgrano, lo intentó 6 meses con otra inmobiliaria.",
  datos: { nombre: "Alicia", telefono: "+54 9 11 5928-9642", email: "alicia@mail.com", zona: "Belgrano" },
  paginaOrigen: "https://central.com/tasaciones",
}

describe("telefonoUsable", () => {
  it("deja el número solo con dígitos", () => {
    expect(telefonoUsable("+54 9 11 5928-9642")).toBe("5491159289642")
  })
  it("lo que no puede ser un teléfono, null", () => {
    for (const malo of ["", "1234", "no tengo", undefined]) expect(telefonoUsable(malo), String(malo)).toBeNull()
  })
})

describe("linkWhatsApp: el equipo tiene que poder escribirle en un toque", () => {
  it("abre el chat CON EL VISITANTE, con el saludo escrito", () => {
    const link = linkWhatsApp("5491159289642", "Hola Alicia, soy del equipo de Central")
    expect(link).not.toBeNull()
    expect(link!.startsWith("https://wa.me/5491159289642?text=")).toBe(true)
    expect(decodeURIComponent(link!)).toContain("Hola Alicia, soy del equipo de Central")
  })
  it("sin teléfono no hay link", () => {
    expect(linkWhatsApp(null, "hola")).toBeNull()
  })
})

describe("armarAvisoDerivacion", () => {
  it("el asunto dice QUÉ quiere y quién es: se entiende sin abrirlo", () => {
    const a = armarAvisoDerivacion(base)
    expect(a.asunto).toContain("Alicia")
    expect(a.asunto.toLowerCase()).toContain("vender")
  })

  it("el cuerpo trae los datos, el resumen y de qué página vino", () => {
    const a = armarAvisoDerivacion(base)
    for (const dato of ["Alicia", "alicia@mail.com", "Belgrano", "PH en Belgrano", "tasaciones"])
      expect(a.html, dato).toContain(dato)
  })

  it("trae el botón para escribirle por WhatsApp", () => {
    const a = armarAvisoDerivacion(base)
    expect(a.html).toContain("wa.me/5491159289642")
  })

  it("si le toca a un asesor de PRISMA, el botón lleva al chat de PRISMA y NO a wa.me", () => {
    const a = armarAvisoDerivacion({ ...base, chatEnPrisma: "https://prisma.vakdor.com/asesor/whatsapp?c=abc" })
    expect(a.html).toContain("Abrir el chat en PRISMA")
    expect(a.html).toContain("/asesor/whatsapp?c=abc")
    // el punto de la decisión: que NO se conteste desde el WhatsApp personal
    expect(a.html).not.toContain("wa.me/")
  })

  it("sin teléfono, no promete un WhatsApp que no se puede abrir: muestra el email", () => {
    const a = armarAvisoDerivacion({ ...base, datos: { nombre: "Alicia", email: "alicia@mail.com" } })
    expect(a.html).not.toContain("wa.me/")
    expect(a.html).toContain("alicia@mail.com")
    expect(a.linkWhatsApp).toBeNull()
  })

  it("el texto del visitante no puede meter HTML en el correo del equipo", () => {
    const a = armarAvisoDerivacion({
      ...base,
      resumen: '<script>alert(1)</script> quiere vender',
      datos: { ...base.datos, nombre: '<img src=x onerror="robar()">' },
    })
    // Doble protección: las etiquetas se SACAN, y lo que quede se escapa.
    expect(a.html).not.toContain("<script>")
    expect(a.html).not.toContain("<img")
    expect(a.html).not.toContain("onerror=")
    expect(a.html).toContain("quiere vender")
  })

  it("un signo < que escribió el visitante queda escapado, no rompe el correo", () => {
    const a = armarAvisoDerivacion({ ...base, datos: { ...base.datos, presupuesto: "< 100k USD" } })
    expect(a.html).toContain("&lt; 100k USD")
  })

  it("el mensaje corto para WhatsApp dice lo mismo, sin HTML", () => {
    const a = armarAvisoDerivacion(base)
    expect(a.textoWhatsApp).toContain("Alicia")
    expect(a.textoWhatsApp).not.toContain("<")
    expect(a.textoWhatsApp.length).toBeLessThanOrEqual(600)
  })
})

describe("enviarDerivacionPorEmail: el lead tiene que llegarle a alguien", () => {
  const aviso = armarAvisoDerivacion(base)
  const env = { RESEND_API_KEY: "clave", RESEND_FROM: "PRISMA <avisos@vakdor.com>" }

  it("manda a todos los destinatarios en un solo correo y dice a quienes", async () => {
    const pedidos: Array<Record<string, unknown>> = []
    const fetchFalso = (async (_u: string, o: { body: string }) => {
      pedidos.push(JSON.parse(o.body))
      return { ok: true, json: async () => ({ id: "re-1" }) }
    }) as unknown as typeof fetch

    const r = await enviarDerivacionPorEmail({
      aviso, para: ["leads@central.com", "juan@central.com"], nombreAgencia: "Central", env, fetchFn: fetchFalso,
    })
    expect(r.resultado).toBe("enviado")
    expect(pedidos[0].to).toEqual(["leads@central.com", "juan@central.com"])
    expect(String(pedidos[0].subject)).toContain("Alicia")
    expect(String(pedidos[0].from)).toContain("Central")
  })

  it("sin destinatarios no inventa un envio", async () => {
    const r = await enviarDerivacionPorEmail({ aviso, para: [], nombreAgencia: "Central", env })
    expect(r.resultado).toBe("sin_destinatario")
  })

  it("sin la clave de correo configurada, lo dice en vez de fallar en silencio", async () => {
    const r = await enviarDerivacionPorEmail({ aviso, para: ["x@y.com"], nombreAgencia: "Central", env: {} })
    expect(r.resultado).toBe("sin_resend")
  })

  it("si el correo rebota, vuelve el motivo (no se pierde el lead en silencio)", async () => {
    const fetchRoto = (async () => ({ ok: false, status: 422, json: async () => ({}) })) as unknown as typeof fetch
    const r = await enviarDerivacionPorEmail({
      aviso, para: ["x@y.com"], nombreAgencia: "Central", env, fetchFn: fetchRoto,
    })
    expect(r.resultado).toBe("error_422")
  })

  it("no repite un destinatario ni manda a un email roto", async () => {
    const pedidos: Array<Record<string, unknown>> = []
    const fetchFalso = (async (_u: string, o: { body: string }) => {
      pedidos.push(JSON.parse(o.body))
      return { ok: true, json: async () => ({ id: "re-1" }) }
    }) as unknown as typeof fetch
    await enviarDerivacionPorEmail({
      aviso, para: ["a@b.com", "a@b.com", "", "no-es-email", " A@B.com "], nombreAgencia: "Central", env, fetchFn: fetchFalso,
    })
    expect(pedidos[0].to).toEqual(["a@b.com"])
  })
})
