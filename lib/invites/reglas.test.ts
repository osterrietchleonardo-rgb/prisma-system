import { describe, it, expect } from "vitest";
import {
  normalizarEmail,
  emailValido,
  validarNuevoCodigo,
  validarCelularGuardado,
  emailCoincideConInvite,
  type DatosNuevoCodigo,
} from "./reglas";
import { normalizePhoneE164, formatPhoneInternational } from "@/lib/whatsapp/phone";

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

describe("validarNuevoCodigo — otros países de LATAM (el defecto del país fijo)", () => {
  // El defecto del país fijo apareció cuatro veces y las cuatro se verificaron a
  // mano, solo con Argentina. Estos tests cubren México y Colombia, para que
  // validarNuevoCodigo no vuelva a asumir un país que no es el que eligió el director.
  it("acepta un celular de México (MX) y devuelve el E.164 correcto sin +", () => {
    const r = validarNuevoCodigo({
      ...BASE,
      phone: "55 1234 5678",
      phoneConfirm: "55 1234 5678",
      country: "MX",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.phone).toBe("525512345678");
    }
  });

  it("acepta un celular de Colombia (CO) y devuelve el E.164 correcto sin +", () => {
    const r = validarNuevoCodigo({
      ...BASE,
      phone: "300 1234567",
      phoneConfirm: "300 1234567",
      country: "CO",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.phone).toBe("573001234567");
    }
  });
});

describe("validarCelularGuardado — la función real que usan generateAgencyInvite y actualizarDatosAsesor", () => {
  // Esta es la red que protege el arreglo, no una imitación. Antes, el test acá
  // le anteponía el "+" él mismo y llamaba a normalizePhoneE164 directo — eso NO
  // ejercita el código del producto: si alguien revertía el arreglo real (volver
  // a fijar un país en generateAgencyInvite o en actualizarDatosAsesor), el test
  // seguía en verde. validarCelularGuardado() es la función que esos dos lugares
  // llaman de verdad, así que probarla a ELLA es lo que impide que el defecto
  // del país fijo reaparezca por quinta vez sin que ningún test se entere.
  it("Argentina: devuelve el mismo E.164 de entrada", () => {
    const original = normalizePhoneE164("11 2345-6789", "AR");
    expect(original).toBe("5491123456789");
    expect(validarCelularGuardado(original!)).toBe(original);
  });

  it("México: devuelve el mismo E.164 de entrada", () => {
    const original = normalizePhoneE164("55 1234 5678", "MX");
    expect(original).toBe("525512345678");
    expect(validarCelularGuardado(original!)).toBe(original);
  });

  it("Colombia: devuelve el mismo E.164 de entrada", () => {
    const original = normalizePhoneE164("300 1234567", "CO");
    expect(original).toBe("573001234567");
    expect(validarCelularGuardado(original!)).toBe(original);
  });

  it("Brasil: devuelve el mismo E.164 de entrada", () => {
    const original = normalizePhoneE164("11 91234-5678", "BR");
    expect(original).toBe("5511912345678");
    expect(validarCelularGuardado(original!)).toBe(original);
  });

  it("basura da null", () => {
    expect(validarCelularGuardado("123")).toBeNull();
    expect(validarCelularGuardado("")).toBeNull();
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
