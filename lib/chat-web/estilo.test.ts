import { describe, it, expect } from "vitest"
import {
  MINIMO_TEXTO,
  MINIMO_BOTON,
  aHsl,
  aHex,
  contraste,
  fuentesDelChat,
  leerColor,
  paletaDelChat,
  textoSobre,
  acercarHastaContraste,
} from "./estilo"

describe("leerColor: lo que viene de la configuración puede estar escrito de cualquier forma", () => {
  it("acepta #abc, #aabbcc, con y sin numeral, en mayúsculas", () => {
    for (const entrada of ["#FF0000", "ff0000", "#f00", "F00"]) expect(leerColor(entrada), entrada).toBe("#ff0000")
  })
  it("devuelve null si no es un color", () => {
    for (const malo of ["", "rojo", "#12345", "rgb(1,2,3)", null as unknown as string]) expect(leerColor(malo), String(malo)).toBeNull()
  })
})

describe("contraste: la cuenta que dice si un texto se lee", () => {
  it("negro sobre blanco es el máximo (21) y un color contra sí mismo es 1", () => {
    expect(Math.round(contraste("#000000", "#ffffff"))).toBe(21)
    expect(contraste("#3b82f6", "#3b82f6")).toBeCloseTo(1, 5)
  })
  it("no importa el orden", () => {
    expect(contraste("#123456", "#fedcba")).toBeCloseTo(contraste("#fedcba", "#123456"), 10)
  })
})

describe("textoSobre: blanco o negro, el que se lea", () => {
  it("sobre un color oscuro, texto claro; sobre uno claro, texto oscuro", () => {
    expect(contraste(textoSobre("#0b3d2e"), "#0b3d2e")).toBeGreaterThanOrEqual(MINIMO_TEXTO)
    expect(contraste(textoSobre("#ffe600"), "#ffe600")).toBeGreaterThanOrEqual(MINIMO_TEXTO)
  })
  it("el amarillo pide texto oscuro y el azul marino texto claro", () => {
    expect(textoSobre("#ffe600")).toBe("#101828")
    expect(textoSobre("#0b1f4b")).toBe("#ffffff")
  })
})

describe("acercarHastaContraste: mover el color lo justo, sin cambiarle el tono", () => {
  it("un amarillo sobre blanco se oscurece hasta que se lee", () => {
    const ajustado = acercarHastaContraste("#ffe600", "#ffffff", MINIMO_TEXTO)
    expect(contraste(ajustado, "#ffffff")).toBeGreaterThanOrEqual(MINIMO_TEXTO)
    // sigue siendo amarillo: el tono no se toca
    expect(Math.abs(aHsl(ajustado).h - aHsl("#ffe600").h)).toBeLessThan(2)
  })
  it("un azul marino sobre fondo oscuro se aclara hasta que se lee", () => {
    const ajustado = acercarHastaContraste("#0b1f4b", "#101828", MINIMO_TEXTO)
    expect(contraste(ajustado, "#101828")).toBeGreaterThanOrEqual(MINIMO_TEXTO)
    expect(aHsl(ajustado).l).toBeGreaterThan(aHsl("#0b1f4b").l)
  })
  it("un color que ya se lee no se toca", () => {
    expect(acercarHastaContraste("#1d4ed8", "#ffffff", MINIMO_TEXTO)).toBe("#1d4ed8")
  })
  it("con un gris medio imposible, igual devuelve algo legible", () => {
    const ajustado = acercarHastaContraste("#808080", "#808080", MINIMO_TEXTO)
    expect(contraste(ajustado, "#808080")).toBeGreaterThanOrEqual(MINIMO_TEXTO)
  })
})

describe("paletaDelChat: el análisis estético completo", () => {
  const marcas = [
    { nombre: "cobre Vakdor", color: "#b87333" },
    { nombre: "amarillo imposible", color: "#ffe600" },
    { nombre: "azul marino", color: "#0b1f4b" },
    { nombre: "negro", color: "#000000" },
    { nombre: "blanco", color: "#ffffff" },
    { nombre: "verde flúor", color: "#39ff14" },
  ]

  for (const tema of ["claro", "oscuro"] as const) {
    for (const { nombre, color } of marcas) {
      it(`${nombre} en tema ${tema}: todo lo que se lee, se lee`, () => {
        const p = paletaDelChat({ primario: color, tema })

        // El texto principal, siempre legible sobre su fondo.
        expect(contraste(p.texto, p.fondo), "texto/fondo").toBeGreaterThanOrEqual(MINIMO_TEXTO)
        expect(contraste(p.textoSuave, p.fondo), "textoSuave/fondo").toBeGreaterThanOrEqual(3)

        // Los dos globitos de la conversación.
        expect(contraste(p.visitanteTexto, p.visitanteFondo), "globo del visitante").toBeGreaterThanOrEqual(MINIMO_TEXTO)
        expect(contraste(p.agenteTexto, p.agenteFondo), "globo del agente").toBeGreaterThanOrEqual(MINIMO_TEXTO)

        // El botón flotante tiene que verse sobre CUALQUIER sitio: blanco o negro.
        expect(contraste(p.botonTexto, p.botonFondo), "texto del botón").toBeGreaterThanOrEqual(MINIMO_BOTON)
        expect(
          Math.max(contraste(p.botonFondo, "#ffffff"), contraste(p.botonFondo, "#111111")),
          "el botón se despega del sitio"
        ).toBeGreaterThanOrEqual(3)

        // El link y el borde.
        expect(contraste(p.link, p.fondo), "link/fondo").toBeGreaterThanOrEqual(MINIMO_TEXTO)
        expect(contraste(p.borde, p.fondo), "borde/fondo").toBeGreaterThanOrEqual(1.2)
      })
    }
  }

  it("respeta el tono de la marca: el cobre sigue siendo cobre", () => {
    const p = paletaDelChat({ primario: "#b87333", tema: "claro" })
    expect(Math.abs(aHsl(p.botonFondo).h - aHsl("#b87333").h)).toBeLessThan(6)
  })

  it("los fondos son neutros con un toque de la marca, no la marca a pantalla completa", () => {
    const p = paletaDelChat({ primario: "#b87333", tema: "claro" })
    // el fondo del panel es casi blanco: saturación baja
    expect(aHsl(p.fondo).s).toBeLessThan(20)
    expect(aHsl(p.fondo).l).toBeGreaterThan(90)
  })

  it("sin color configurado, usa el gris de PRISMA y no explota", () => {
    const p = paletaDelChat({ primario: "no es un color", tema: "claro" })
    expect(contraste(p.botonTexto, p.botonFondo)).toBeGreaterThanOrEqual(MINIMO_BOTON)
    expect(p.heredado).toBe(false)
  })

  it("el director puede pisar el color solo para el chat", () => {
    const p = paletaDelChat({ primario: "#b87333", acento: "#0b1f4b", tema: "claro" })
    expect(Math.abs(aHsl(p.botonFondo).h - aHsl("#0b1f4b").h)).toBeLessThan(6)
  })

  it("aHex y aHsl son ida y vuelta", () => {
    for (const c of ["#b87333", "#0b1f4b", "#ffe600", "#ffffff", "#000000"]) expect(aHex(aHsl(c))).toBe(c)
  })
})

describe("fuentesDelChat: la tipografía de la marca, sin arruinar la lectura", () => {
  it("sans y serif se usan tal cual, arriba y en el cuerpo", () => {
    expect(fuentesDelChat("sans").cuerpo).toContain("system-ui")
    expect(fuentesDelChat("serif").cuerpo).toContain("Georgia")
    expect(fuentesDelChat("serif").titulo).toContain("Georgia")
  })
  it("una manuscrita o de cartel va SOLO en el título: el cuerpo se tiene que poder leer", () => {
    for (const f of ["script", "display"] as const) {
      expect(fuentesDelChat(f).cuerpo, f).toContain("system-ui")
      expect(fuentesDelChat(f).cuerpo, f).not.toContain("cursive")
    }
    expect(fuentesDelChat("script").titulo).toContain("cursive")
  })
  it("si no hay nada configurado, la de siempre", () => {
    for (const nada of [undefined, null, "", "papiro", 7]) {
      expect(fuentesDelChat(nada).cuerpo, String(nada)).toContain("system-ui")
      expect(fuentesDelChat(nada).titulo, String(nada)).toContain("system-ui")
    }
  })
  it("ninguna fuente se descarga de internet: el chat no puede hacer más lento el sitio del cliente", () => {
    for (const f of ["sans", "serif", "script", "display"] as const) {
      const { titulo, cuerpo } = fuentesDelChat(f)
      for (const pila of [titulo, cuerpo]) {
        expect(pila).not.toMatch(/https?:|@import|url\(/i)
        // toda pila termina en una familia genérica, por si la máquina no tiene ninguna
        expect(pila).toMatch(/(sans-serif|serif|cursive|monospace)$/)
      }
    }
  })

})
