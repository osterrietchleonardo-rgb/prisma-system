import { describe, it, expect } from "vitest"
import { validarFotoSubida, TOPE_BYTES, nombreDeArchivo } from "./subida-foto"

describe("qué archivo se acepta como foto para retocar", () => {
  const ok = { tipo: "image/jpeg", bytes: 500_000 }

  it("acepta los tres formatos que sharp lee sin ayuda", () => {
    for (const tipo of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validarFotoSubida({ ...ok, tipo })).toBeNull()
    }
  })

  it("acepta el tipo con parámetros pegados, como lo manda el navegador", () => {
    // Safari manda 'image/jpeg; charset=binary' en algunos casos.
    expect(validarFotoSubida({ ...ok, tipo: "image/jpeg; charset=binary" })).toBeNull()
    expect(validarFotoSubida({ ...ok, tipo: "IMAGE/JPEG" })).toBeNull()
  })

  it("rechaza HEIC diciendo qué hacer, porque sharp no lo lee", () => {
    // El iPhone saca en HEIC. El navegador lo pasa a JPEG antes de subir, pero si
    // alguien llega igual con un HEIC crudo tiene que entender por qué no anda.
    const error = validarFotoSubida({ ...ok, tipo: "image/heic" })
    expect(error).toMatch(/HEIC/i)
    expect(error).toMatch(/JPG|JPEG/i)
  })

  it("rechaza lo que no es una imagen", () => {
    expect(validarFotoSubida({ ...ok, tipo: "application/pdf" })).toBeTruthy()
    expect(validarFotoSubida({ ...ok, tipo: "video/mp4" })).toBeTruthy()
    expect(validarFotoSubida({ ...ok, tipo: "" })).toBeTruthy()
  })

  it("no se deja engañar por un tipo que solo contiene uno permitido", () => {
    expect(validarFotoSubida({ ...ok, tipo: "text/html+image/jpeg" })).toBeTruthy()
    expect(validarFotoSubida({ ...ok, tipo: "image/jpeg-evil" })).toBeTruthy()
  })

  it("rechaza el archivo vacío", () => {
    expect(validarFotoSubida({ ...ok, bytes: 0 })).toBeTruthy()
  })

  it("acepta justo en el tope y rechaza un byte más", () => {
    expect(validarFotoSubida({ ...ok, bytes: TOPE_BYTES })).toBeNull()
    const error = validarFotoSubida({ ...ok, bytes: TOPE_BYTES + 1 })
    // El mensaje tiene que decir el tope en MB: "muy pesada" sin número no ayuda.
    expect(error).toMatch(/\d+\s*MB/i)
  })
})

describe("dónde se guarda la foto subida", () => {
  const userId = "11111111-2222-3333-4444-555555555555"

  it("la cuelga de la carpeta del usuario, separada de las que salen de una ficha", () => {
    const nombre = nombreDeArchivo(userId)
    expect(nombre.startsWith(`fotos-ia/${userId}/subidas/`)).toBe(true)
  })

  it("siempre termina en .jpg: se normaliza a JPEG antes de guardar", () => {
    expect(nombreDeArchivo(userId).endsWith(".jpg")).toBe(true)
  })

  it("dos subidas seguidas no se pisan", () => {
    const nombres = new Set(Array.from({ length: 50 }, () => nombreDeArchivo(userId)))
    expect(nombres.size).toBe(50)
  })
})
