import { describe, it, expect } from "vitest";
import {
  normalizarEmail,
  emailValido,
  validarNuevoCodigo,
  emailCoincideConInvite,
  type DatosNuevoCodigo,
} from "./reglas";

const BASE: DatosNuevoCodigo = {
  nombre: "Juan Pérez",
  email: "juan@central.com",
  emailConfirm: "juan@central.com",
  phone: "11 2345-6789",
  phoneConfirm: "011 15 2345 6789",
  country: "AR",
};

describe("normalizarEmail", () => {
  it("saca espacios y pasa a minúsculas", () => {
    expect(normalizarEmail("  Juan@Central.COM ")).toBe("juan@central.com");
  });

  it("devuelve string vacío si no hay nada", () => {
    expect(normalizarEmail(null)).toBe("");
    expect(normalizarEmail(undefined)).toBe("");
  });
});

describe("emailValido", () => {
  it("acepta un email normal", () => {
    expect(emailValido("juan@central.com")).toBe(true);
  });

  it("rechaza uno sin dominio completo", () => {
    expect(emailValido("juan@central")).toBe(false);
  });

  it("rechaza uno con espacios adentro", () => {
    expect(emailValido("juan perez@central.com")).toBe(false);
  });

  it("rechaza vacío", () => {
    expect(emailValido("")).toBe(false);
  });
});

describe("validarNuevoCodigo", () => {
  it("acepta el caso feliz y devuelve el celular en E.164 sin +", () => {
    const r = validarNuevoCodigo(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombre).toBe("Juan Pérez");
      expect(r.datos.email).toBe("juan@central.com");
      expect(r.datos.phone).toBe("5491123456789");
    }
  });

  it("acepta que el celular se escriba distinto en los dos campos si es el mismo número", () => {
    // "11 2345-6789" y "011 15 2345 6789" son el mismo número argentino.
    const r = validarNuevoCodigo(BASE);
    expect(r.ok).toBe(true);
  });

  it("rechaza si falta el nombre", () => {
    const r = validarNuevoCodigo({ ...BASE, nombre: "   " });
    expect(r).toEqual({ ok: false, error: "Escribí el nombre de la persona que vas a invitar" });
  });

  it("rechaza un nombre de menos de 3 letras", () => {
    const r = validarNuevoCodigo({ ...BASE, nombre: "Jo" });
    expect(r.ok).toBe(false);
  });

  it("rechaza si el email no tiene formato válido", () => {
    const r = validarNuevoCodigo({ ...BASE, email: "juan@central", emailConfirm: "juan@central" });
    expect(r).toEqual({ ok: false, error: "El email no parece válido" });
  });

  it("rechaza si los dos emails no coinciden", () => {
    const r = validarNuevoCodigo({ ...BASE, emailConfirm: "juan@centrall.com" });
    expect(r).toEqual({ ok: false, error: "Los dos emails no coinciden" });
  });

  it("compara los emails sin importar mayúsculas ni espacios", () => {
    const r = validarNuevoCodigo({ ...BASE, emailConfirm: "  JUAN@Central.com  " });
    expect(r.ok).toBe(true);
  });

  it("rechaza un celular que no es un número real", () => {
    const r = validarNuevoCodigo({ ...BASE, phone: "123", phoneConfirm: "123" });
    expect(r).toEqual({ ok: false, error: "El celular no parece válido para el país elegido" });
  });

  it("rechaza si los dos celulares son números distintos", () => {
    const r = validarNuevoCodigo({ ...BASE, phoneConfirm: "11 2345-6780" });
    expect(r).toEqual({ ok: false, error: "Los dos celulares no coinciden" });
  });
});

describe("emailCoincideConInvite", () => {
  it("coincide ignorando mayúsculas y espacios", () => {
    expect(emailCoincideConInvite("juan@central.com", "  JUAN@Central.COM ")).toBe(true);
  });

  it("no coincide si es otro email", () => {
    expect(emailCoincideConInvite("juan@central.com", "pedro@central.com")).toBe(false);
  });

  it("los códigos viejos, sin email, dejan pasar a cualquiera", () => {
    // Regla del spec §5.5: la validación aplica solo cuando el invite trae email.
    expect(emailCoincideConInvite(null, "pedro@central.com")).toBe(true);
    expect(emailCoincideConInvite("", "pedro@central.com")).toBe(true);
    expect(emailCoincideConInvite("   ", "pedro@central.com")).toBe(true);
  });
});
