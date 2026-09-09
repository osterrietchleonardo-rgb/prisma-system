import { describe, it, expect } from "vitest";
import { armarSnapshot } from "./snapshot";
import { normalizarPlantilla } from "./plantilla";

const m = (id: string) => ({ type: "mention", attrs: { id, label: `@${id}` } });
const t = (text: string) => ({ type: "text", text });
const doc = (...c: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content: c }] });

const plantilla = normalizarPlantilla({
  id: "p-1", nombre: "Presentación", version: 4,
  cuerpo: doc(t("Hola, soy "), m("nombre")),
  bloque_asesor: { texto: doc(m("nombre"), t(" | Cel: "), m("celular")), posicion: "footer" },
});
const agent = { full_name: "Ana Pérez", email: "a@x.com", phone: "5491123456789", clasificacion: "client_support", role: "asesor", avatar_url: null };
const agency = { id: "ag", name: "Central" };
const brand = { colors: ["#111"], font: "sans", logo_url: null };

describe("armarSnapshot", () => {
  it("congela plantilla, asesor, agencia y marca, con las variables YA aplicadas", () => {
    const s = armarSnapshot({ plantilla, header_url: "https://cdn/h.png", footer_url: null, agent, agency, brand });
    expect(s.plantilla).toMatchObject({ id: "p-1", nombre: "Presentación", version: 4, header_url: "https://cdn/h.png", footer_url: null });
    expect(JSON.stringify(s.plantilla.cuerpo)).toContain("\"Hola, soy \"");
    expect(JSON.stringify(s.plantilla.cuerpo)).toContain("\"Ana Pérez\"");
    expect(JSON.stringify(s.plantilla.cuerpo)).not.toContain("mention");
    expect(JSON.stringify(s.plantilla.bloque_asesor.texto)).toContain("+54 9 11 2345 6789");
    expect(s.agent.full_name).toBe("Ana Pérez");
    expect(s.brand).toEqual(brand);
    expect(typeof s.created_at).toBe("string");
  });

  it("usa el nombre de la agencia para @agencia", () => {
    const p = normalizarPlantilla({ id: "p", nombre: "n", version: 1, cuerpo: doc(m("agencia")) });
    const s = armarSnapshot({ plantilla: p, header_url: null, footer_url: null, agent, agency, brand });
    expect(JSON.stringify(s.plantilla.cuerpo)).toContain("Central");
  });
});
