import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validarArchivo,
  rutaDeArchivo,
  nombreVisible,
  escaparComodinesIlike,
  camposDelReemplazo,
  MAX_BYTES,
} from "./reglas";

const UN_MB = 1024 * 1024;

describe("validarArchivo — sección plantillas (solo .docx)", () => {
  it("acepta un .docx", () => {
    expect(validarArchivo("Contrato.docx", UN_MB, "plantilla")).toEqual({ ok: true, extension: "docx" });
  });

  it("acepta sin importar mayúsculas en la extensión", () => {
    expect(validarArchivo("Contrato.DOCX", UN_MB, "plantilla")).toEqual({ ok: true, extension: "docx" });
  });

  it("rechaza un .doc viejo, y explica por qué", () => {
    const r = validarArchivo("Contrato.doc", UN_MB, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // El mensaje tiene que decirle qué hacer, no solo que no se puede.
      expect(r.error).toContain(".doc");
      expect(r.error.toLowerCase()).toContain("guardar como");
    }
  });

  it("rechaza un PDF en la sección de plantillas", () => {
    const r = validarArchivo("Contrato.pdf", UN_MB, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("word");
  });

  it("rechaza un archivo sin extensión", () => {
    expect(validarArchivo("Contrato", UN_MB, "plantilla").ok).toBe(false);
  });
});

describe("validarArchivo — sección información (.docx o .pdf)", () => {
  it("acepta un .docx", () => {
    expect(validarArchivo("Manual.docx", UN_MB, "info")).toEqual({ ok: true, extension: "docx" });
  });

  it("acepta un .pdf", () => {
    expect(validarArchivo("Manual.pdf", UN_MB, "info")).toEqual({ ok: true, extension: "pdf" });
  });

  it("acepta un .doc viejo, porque acá no se rellena nada", () => {
    expect(validarArchivo("Manual.doc", UN_MB, "info")).toEqual({ ok: true, extension: "doc" });
  });

  it("rechaza una imagen", () => {
    const r = validarArchivo("foto.jpg", UN_MB, "info");
    expect(r.ok).toBe(false);
  });
});

describe("validarArchivo — tamaño", () => {
  it("rechaza un archivo que pasa el tope, en las dos secciones", () => {
    const grande = MAX_BYTES + 1;
    for (const seccion of ["plantilla", "info"] as const) {
      const r = validarArchivo("Contrato.docx", grande, seccion);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.toLowerCase()).toContain("pesa");
    }
  });

  it("acepta un archivo justo en el tope", () => {
    expect(validarArchivo("Contrato.docx", MAX_BYTES, "plantilla").ok).toBe(true);
  });

  it("rechaza un archivo vacío", () => {
    const r = validarArchivo("Contrato.docx", 0, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("vacío");
  });
});

describe("rutaDeArchivo", () => {
  it("separa por agencia, asesor y sección", () => {
    expect(rutaDeArchivo("AG", "AS", "plantilla", "ID1", "docx")).toBe("asesores/AG/AS/plantillas/ID1.docx");
    expect(rutaDeArchivo("AG", "AS", "info", "ID2", "pdf")).toBe("asesores/AG/AS/info/ID2.pdf");
  });

  it("no usa el nombre del archivo original en la ruta", () => {
    // El nombre lo pone el usuario: puede traer acentos, espacios, barras o
    // repetirse. La ruta se arma con el id, que es único y siempre seguro.
    const ruta = rutaDeArchivo("AG", "AS", "info", "ID3", "pdf");
    expect(ruta).not.toContain(" ");
    expect(ruta.split("/").length).toBe(5);
  });
});

describe("nombreVisible", () => {
  it("saca la extensión", () => {
    expect(nombreVisible("Contrato de Asesor.docx")).toBe("Contrato de Asesor");
  });

  it("deja el nombre tal cual si no tiene extensión", () => {
    expect(nombreVisible("Contrato")).toBe("Contrato");
  });

  it("solo saca la última extensión", () => {
    expect(nombreVisible("acuerdo.v2.docx")).toBe("acuerdo.v2");
  });

  it("recorta espacios", () => {
    expect(nombreVisible("  Manual.pdf  ")).toBe("Manual");
  });
});

describe("escaparComodinesIlike", () => {
  it("escapa el guion bajo, comodín de un carácter", () => {
    expect(escaparComodinesIlike("Contrato_2026")).toBe("Contrato\\_2026");
  });

  it("escapa el porcentaje, comodín de cualquier cadena", () => {
    expect(escaparComodinesIlike("100%")).toBe("100\\%");
  });

  it("escapa la barra invertida antes que los comodines, para no doble-escapar", () => {
    expect(escaparComodinesIlike("a\\_b")).toBe("a\\\\\\_b");
  });

  it("un nombre sin comodines queda igual", () => {
    expect(escaparComodinesIlike("Contrato de Asesor")).toBe("Contrato de Asesor");
  });

  it("no deja que un nombre con guion bajo matchee otro con cualquier caracter ahí", () => {
    // Es la prueba de la falla real: "Contrato_2026" NO tiene que encontrar
    // "ContratoX2026" en una búsqueda ilike.
    const patron = escaparComodinesIlike("Contrato_2026");
    expect(patron).not.toBe("Contrato_2026");
  });
});

// ---------------------------------------------------------------------------
// EL REEMPLAZO DEL .docx DE UN ASESOR
// ---------------------------------------------------------------------------

/**
 * La vía por la que una plantilla `activa` se quedaba con una constancia
 * FALSA, y que la Etapa B había dejado anotada por escrito.
 *
 * El director reemplaza el .docx de un asesor en una plantilla ya activa. Si el
 * UPDATE no limpia las cuatro columnas de la comprobación, la fila queda con
 * `estado='ok'` y `version_id` = la versión vigente —que es como la solapa lee
 * "comprobado contra lo que está en uso"— con los datos del archivo VIEJO
 * adentro. Nadie miró el archivo nuevo y la pantalla dice que está todo bien.
 */
const REEMPLAZO = {
  nombreArchivo: "Contrato Ana 2026.docx",
  path: "asesores/ag-1/as-1/plantillas/nuevo-id.docx",
  sizeBytes: 34567,
  ahora: "2026-08-31T12:00:00.000Z",
};

describe("camposDelReemplazo", () => {
  it("borra la constancia de la comprobación: las cuatro columnas vuelven a null", () => {
    const campos = camposDelReemplazo(REEMPLAZO);
    // `toBeNull` y no `toBeUndefined`: tienen que VIAJAR en el UPDATE. Una
    // columna que no se manda es una columna que queda como estaba, que es
    // justo el problema.
    for (const columna of ["version_id", "form_data", "estado", "observacion"] as const) {
      expect(columna in campos, `${columna} no viaja en el UPDATE`).toBe(true);
      expect(campos[columna], `${columna} tendría que volver a null`).toBeNull();
    }
  });

  it("guarda los datos del archivo nuevo", () => {
    const campos = camposDelReemplazo(REEMPLAZO);
    expect(campos.nombre_archivo).toBe("Contrato Ana 2026.docx");
    expect(campos.archivo_original_path).toBe("asesores/ag-1/as-1/plantillas/nuevo-id.docx");
    expect(campos.size_bytes).toBe(34567);
    expect(campos.updated_at).toBe("2026-08-31T12:00:00.000Z");
  });

  /**
   * No cuida de una columna NUEVA en la base —eso no se puede ver desde acá—,
   * pero sí de que alguien agregue o saque un campo de este UPDATE sin pasar
   * por el comentario que explica por qué están las cuatro.
   */
  it("escribe estas ocho columnas y ninguna otra", () => {
    expect(Object.keys(camposDelReemplazo(REEMPLAZO)).sort()).toEqual([
      "archivo_original_path",
      "estado",
      "form_data",
      "nombre_archivo",
      "observacion",
      "size_bytes",
      "updated_at",
      "version_id",
    ]);
  });
});

/**
 * La función de arriba no sirve de nada si la pantalla no la usa, y ningún test
 * del repo mira los `.tsx`: la ronda pasada una promesa falsa se reescribió a
 * mano treinta líneas más arriba y ningún test la vio. Se lee el archivo como
 * texto, igual que hace `lib/acm/ficha-css.test.ts` con la ficha pública.
 */
describe("la pantalla del director usa camposDelReemplazo y no un objeto escrito a mano", () => {
  const FUENTE = readFileSync(
    path.resolve(__dirname, "../../components/asesor-docs/DocumentosDelAsesor.tsx"),
    "utf8",
  );

  it("hay un solo UPDATE en la pantalla y sale de camposDelReemplazo", () => {
    const updates = FUENTE.match(/\.update\(/g) ?? [];
    expect(updates, "apareció otro UPDATE: fijate si también tiene que limpiar la comprobación").toHaveLength(1);
    expect(FUENTE).toMatch(/\.update\(\s*camposDelReemplazo\(/);
  });

  /**
   * El INSERT de la primera subida no necesita limpiar nada: no nombra esas
   * columnas y la tabla las crea en null (`20260826120000_documentos_por_
   * asesor.sql` las declara sin DEFAULT). Este test es lo que sostiene esa
   * afirmación: si mañana el INSERT empieza a escribir alguna, salta.
   */
  it("el INSERT de la primera subida no escribe ninguna de las cuatro", () => {
    const desde = FUENTE.indexOf('from("advisor_documents").insert(');
    expect(desde, "cambió la forma del INSERT de advisor_documents").toBeGreaterThan(-1);
    const bloque = FUENTE.slice(desde, FUENTE.indexOf("});", desde));
    for (const columna of ["version_id", "form_data", "estado", "observacion"]) {
      expect(bloque).not.toContain(columna);
    }
  });
});
