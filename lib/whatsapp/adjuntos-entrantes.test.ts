import { describe, it, expect, vi } from "vitest"
import { guardarAdjuntoEntrante, mimeBase, rutaAdjunto } from "./adjuntos-entrantes"

const BASE = { token: "TOK", mediaId: "1665553564971481", agencyId: "ag1", conversationId: "conv1" }

function storageMock(uploadError: null | { message: string } = null) {
  const subidas: Array<{ bucket: string; ruta: string; bytes: number; opts: unknown }> = []
  return {
    subidas,
    storage: {
      from: (bucket: string) => ({
        upload: vi.fn(async (ruta: string, buf: Buffer, opts: unknown) => {
          subidas.push({ bucket, ruta, bytes: buf.length, opts })
          return { error: uploadError }
        }),
        getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${ruta}` } }),
      }),
    },
  }
}

/** Meta: primero la info del media (con url de 5 min), después el archivo. */
function metaMock(opts: { infoStatus?: number; archivo?: Uint8Array; fileSize?: number; mime?: string } = {}) {
  const archivo = opts.archivo ?? new Uint8Array([79, 103, 103, 83, 1, 2])
  const llamadas: Array<{ url: string; auth: string | undefined }> = []
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization })
    if (url.startsWith("https://graph.facebook.com/")) {
      if (opts.infoStatus && opts.infoStatus !== 200) return new Response("{}", { status: opts.infoStatus })
      return Response.json({ url: "https://lookaside.fbsbx.com/x", mime_type: opts.mime ?? "audio/ogg", file_size: opts.fileSize ?? archivo.length })
    }
    return new Response(Buffer.from(archivo), { status: 200 })
  })
  return { fetcher, llamadas }
}

describe("mimeBase / rutaAdjunto", () => {
  it("saca los parámetros del mime y arma la ruta con la extensión", () => {
    expect(mimeBase("audio/ogg; codecs=opus")).toBe("audio/ogg")
    expect(rutaAdjunto("ag1", "conv1", "123", "audio/ogg; codecs=opus")).toBe("wa-inbound/ag1/conv1/123.ogg")
    expect(rutaAdjunto("ag1", "conv1", "123", "image/jpeg")).toBe("wa-inbound/ag1/conv1/123.jpg")
    expect(rutaAdjunto("ag1", "conv1", "123", "algo/raro")).toBe("wa-inbound/ag1/conv1/123.bin")
  })
})

describe("guardarAdjuntoEntrante", () => {
  it("baja el audio de Meta con el token y lo sube a Storage; devuelve el link", async () => {
    const db = storageMock()
    const { fetcher, llamadas } = metaMock()
    const r = await guardarAdjuntoEntrante(db as never, { ...BASE, mimeDeclarado: "audio/ogg; codecs=opus" }, fetcher as never)

    expect(llamadas.map(l => l.url)).toEqual(["https://graph.facebook.com/v21.0/1665553564971481", "https://lookaside.fbsbx.com/x"])
    expect(llamadas.every(l => l.auth === "Bearer TOK")).toBe(true)
    expect(db.subidas).toEqual([{ bucket: "documents", ruta: "wa-inbound/ag1/conv1/1665553564971481.ogg", bytes: 6, opts: { contentType: "audio/ogg", upsert: true } }])
    expect(r?.media_url).toBe("https://x.supabase.co/storage/v1/object/public/documents/wa-inbound/ag1/conv1/1665553564971481.ogg")
    expect(r?.media_mime).toBe("audio/ogg")
  })

  it("si Meta ya lo borró (más de 7 días) devuelve null y no sube nada", async () => {
    const db = storageMock()
    const { fetcher } = metaMock({ infoStatus: 404 })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await guardarAdjuntoEntrante(db as never, BASE, fetcher as never)).toBeNull()
    expect(db.subidas).toEqual([])
    spy.mockRestore()
  })

  it("no guarda una descarga incompleta", async () => {
    const db = storageMock()
    const { fetcher } = metaMock({ fileSize: 999 })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await guardarAdjuntoEntrante(db as never, BASE, fetcher as never)).toBeNull()
    expect(db.subidas).toEqual([])
    spy.mockRestore()
  })

  it("si Storage falla devuelve null sin tirar error (el mensaje ya entró igual)", async () => {
    const db = storageMock({ message: "bucket lleno" })
    const { fetcher } = metaMock()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(guardarAdjuntoEntrante(db as never, BASE, fetcher as never)).resolves.toBeNull()
    spy.mockRestore()
  })
})
