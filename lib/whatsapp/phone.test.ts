import { describe, it, expect } from "vitest";
import { formatPhoneInternational } from "./phone";

// formatPhoneInternational es la función donde el defecto del país fijo apareció
// las CUATRO veces (siempre al mostrar el teléfono: configuración del asesor,
// panel del director, ficha pública del ACM y la tarjeta del pipeline). Ninguna
// tenía un test hasta ahora.
//
// El defecto: tomar un celular que YA está en E.164 sin "+" (ej. "525512345678",
// un número mexicano) y pasarlo de nuevo por esta función SIN anteponerle el "+".
// Sin el "+", formatPhoneInternational asume el país por defecto ("AR") en vez de
// dejar que libphonenumber-js lo deduzca del propio número — y para México,
// Colombia, Brasil o Uruguay eso da `null`. Con Argentina no se nota, porque el
// país por defecto Y el país real coinciden: por eso pasó desapercibido cuatro
// veces. El arreglo, las cuatro veces, fue anteponer "+" antes de llamar a esta
// función. Este test es la red: fija por escrito que sin "+" el resultado es
// `null` (el síntoma exacto del bug) y que con "+" cada país de LATAM formatea
// bien, para que revertir cualquiera de las cuatro correcciones rompa un test
// antes de llegar a producción.
describe("formatPhoneInternational", () => {
  it("México sin '+' antepuesto da null — es el síntoma exacto del defecto del país fijo", () => {
    expect(formatPhoneInternational("525512345678")).toBeNull();
  });

  it("México con '+' antepuesto formatea bien, dejando que se deduzca el país", () => {
    expect(formatPhoneInternational("+525512345678")).toBe("+52 55 1234 5678");
  });

  it("Colombia con '+' antepuesto formatea bien", () => {
    expect(formatPhoneInternational("+573001234567")).toBe("+57 300 1234567");
  });

  it("Brasil con '+' antepuesto formatea bien", () => {
    expect(formatPhoneInternational("+5511912345678")).toBe("+55 11 91234 5678");
  });

  it("Argentina funciona en los dos casos — por eso el defecto pasó desapercibido cuatro veces", () => {
    expect(formatPhoneInternational("5491123456789")).toBe("+54 9 11 2345 6789");
    expect(formatPhoneInternational("+5491123456789")).toBe("+54 9 11 2345 6789");
  });

  it("basura da null", () => {
    expect(formatPhoneInternational("no es un teléfono")).toBeNull();
    expect(formatPhoneInternational(null)).toBeNull();
  });
});
