import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { urlDeDescarga } from "./url";

// Doble mínimo de supabase: solo lo que urlDeDescarga toca. getPublicUrl
// arma la URL como lo hace la librería real: mete `download` crudo y corre
// encodeURI() sobre el total — así el test agarra el mismo bug que en
// producción si alguien saca el saneo.
function supabaseFalso(): SupabaseClient {
  return {
    storage: {
      from: () => ({
        getPublicUrl: (path: string, opts?: { download?: string }) => {
          const base = `https://x.supabase.co/storage/v1/object/public/documents/${path}`;
          const url = opts?.download ? `${base}?download=${opts.download}` : base;
          return { data: { publicUrl: encodeURI(url) } };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

describe("urlDeDescarga — saneo del nombre de descarga", () => {
  it("sin nombre, arma la URL simple", async () => {
    const url = await urlDeDescarga(supabaseFalso(), "asesores/AG/AS/info/id1.pdf");
    expect(url).toBe("https://x.supabase.co/storage/v1/object/public/documents/asesores/AG/AS/info/id1.pdf");
  });

  it("el & no corta el nombre del archivo en un parámetro nuevo", async () => {
    const url = await urlDeDescarga(supabaseFalso(), "p", "Ventas & Alquileres.docx");
    expect(url).not.toContain("& ");
    expect(url).toContain("download=Ventas%20-%20Alquileres.docx");
  });

  it("el # no corta la URL", async () => {
    const url = await urlDeDescarga(supabaseFalso(), "p", "Contrato #2.docx");
    expect(url).not.toContain("#");
  });

  it("el + no se convierte en espacio", async () => {
    const url = await urlDeDescarga(supabaseFalso(), "p", "Anexo A+B.pdf");
    expect(url).not.toContain("+");
  });

  it("nombre sin caracteres problemáticos queda intacto", async () => {
    const url = await urlDeDescarga(supabaseFalso(), "p", "Manual.pdf");
    expect(url).toContain("download=Manual.pdf");
  });

  it("sin path no arma nada", async () => {
    const url = await urlDeDescarga(supabaseFalso(), "");
    expect(url).toBeNull();
  });
});
