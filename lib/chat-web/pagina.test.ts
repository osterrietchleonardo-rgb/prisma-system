import { describe, it, expect } from "vitest"
import { cspDeLaVentana, paginaDelChat } from "./pagina"

const base = {
  widgetId: "w-1",
  nombreAgencia: "Central & Cía",
  nombreBot: "Sofía",
  saludo: "¡Hola! ¿En qué te puedo ayudar?",
  paleta: {
    heredado: true,
    fondo: "#f8f7f6",
    texto: "#211f1c",
    textoSuave: "#6b6560",
    borde: "#e0dbd7",
    botonFondo: "#b87333",
    botonTexto: "#101828",
    visitanteFondo: "#b87333",
    visitanteTexto: "#101828",
    agenteFondo: "#efedeb",
    agenteTexto: "#211f1c",
    link: "#a0642c",
  },
  fuentes: { titulo: "Georgia, serif", cuerpo: "system-ui, sans-serif" },
  logo: null as string | null,
}

describe("cspDeLaVentana: solo el sitio de esa agencia puede mostrarla", () => {
  it("permite los dominios declarados, y nada más", () => {
    const csp = cspDeLaVentana(["central.com", "www.central.com"])
    expect(csp).toContain("frame-ancestors https://central.com https://www.central.com")
    expect(csp).not.toContain("frame-ancestors *")
  })
  it("sin dominios, no la puede enmarcar nadie", () => {
    expect(cspDeLaVentana([])).toContain("frame-ancestors 'none'")
  })
  it("un dominio raro no se cuela en la cabecera", () => {
    const csp = cspDeLaVentana(["central.com", "javascript:alert(1)", "otro.com;script-src *"])
    expect(csp).toContain("https://central.com")
    expect(csp).not.toContain("javascript:")
    expect(csp).not.toContain("script-src *")
  })
})

describe("paginaDelChat", () => {
  it("trae el nombre del bot, el saludo y los colores de la marca", () => {
    const html = paginaDelChat(base)
    expect(html).toContain("Sofía")
    expect(html).toContain("¿En qué te puedo ayudar?")
    expect(html).toContain("#b87333")
  })

  it("el nombre de la agencia no puede inyectar HTML", () => {
    const html = paginaDelChat({ ...base, nombreAgencia: '<script>robar()</script>', nombreBot: '"><img src=x>' })
    expect(html).not.toContain("<script>robar()")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;script&gt;")
  })

  it("lleva el id del widget para poder conversar, y NADA de la agencia que no sea público", () => {
    const html = paginaDelChat(base)
    expect(html).toContain("w-1")
    for (const secreto of ["service_role", "SUPABASE", "api_key", "email_destino", "whatsapp_destino"])
      expect(html.toLowerCase(), secreto).not.toContain(secreto.toLowerCase())
  })

  it("avisa de qué se trata: es un asistente, no una persona", () => {
    expect(paginaDelChat(base).toLowerCase()).toContain("asistente")
  })

  it("sin logo no deja una imagen rota", () => {
    expect(paginaDelChat({ ...base, logo: null })).not.toContain("<img")
    expect(paginaDelChat({ ...base, logo: "https://x/logo.png" })).toContain("https://x/logo.png")
  })
})
