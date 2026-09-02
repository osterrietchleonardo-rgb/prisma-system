import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validarArchivo,
  rutaDeArchivo,
  nombreVisible,
  escaparComodinesIlike,
  camposDelReemplazo,
  archivoQueSeBaja,
  nombreDelGenerado,
  MAX_BYTES,
  carpetaDeVersionesNuevas,
  rutaDeVersionNueva,
  validarRutaDeVersionNueva,
  rutaDelDocumentoGenerado,
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
    for (const columna of ["version_id", "form_data", "estado", "observacion", "docx_path"] as const) {
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
  it("escribe estas nueve columnas y ninguna otra", () => {
    expect(Object.keys(camposDelReemplazo(REEMPLAZO)).sort()).toEqual([
      "archivo_original_path",
      "docx_path",
      "estado",
      "form_data",
      "nombre_archivo",
      "observacion",
      "size_bytes",
      "updated_at",
      "version_id",
    ]);
  });

  /**
   * `docx_path` se sumó tarde, y este test es el que lo va a defender.
   *
   * Lo encontró Leonardo usando la app: aplicó la versión nueva, el flujo dijo
   * que estaba todo bien, y los documentos de los asesores seguían siendo los
   * viejos. El generado se guardaba y **la pantalla mostraba el original**. Al
   * arreglar eso, `docx_path` pasó a decidir qué contrato se baja — y una
   * columna que decide eso NO puede sobrevivir a un reemplazo.
   */
  it("el generado no sobrevive a un reemplazo: si no, se bajaría el contrato viejo", () => {
    expect(camposDelReemplazo(REEMPLAZO).docx_path).toBeNull();
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
  /**
   * La premisa de la que cuelga el guard de la novena vía.
   *
   * `confirmar-plantilla` cierra la carrera "el director reemplaza el .docx
   * mientras se confirma" acotando su UPDATE por `archivo_original_path`: si el
   * archivo cambió en el medio, el UPDATE no encuentra la fila y ese asesor va
   * a rojo en vez de a verde.
   *
   * Eso funciona SOLO porque cada subida va a una ruta nueva —un
   * `crypto.randomUUID()` por archivo, con `upsert: false`—. El día que alguien
   * la haga pisar el mismo path "para no dejar basura en Storage", el path deja
   * de cambiar, el UPDATE vuelve a encontrar la fila, y la novena vía reabre
   * con toda la suite en verde. No había un solo test sobre esto.
   *
   * Se CUENTAN las dos subidas (plantilla e información) en vez de mirar si el
   * patrón aparece "alguna vez": la primera versión de este test usaba un
   * `toMatch` con dos alternativas y era vacuo — romper una de las dos subidas
   * lo dejaba en verde porque la otra seguía matcheando. Medido con mutación.
   */
  it("cada subida va a una ruta NUEVA: es lo que hace detectable el reemplazo", () => {
    const subidas = FUENTE.match(/\.upload\(/g) ?? [];
    const ids = FUENTE.match(/const nuevoId = crypto\.randomUUID\(\);/g) ?? [];
    expect(subidas.length, "cambió la cantidad de subidas a Storage").toBeGreaterThan(0);
    expect(
      ids,
      "hay una subida que NO genera un id nuevo: si reusa el path, el reemplazo deja de ser detectable",
    ).toHaveLength(subidas.length);

    expect(FUENTE, "apareció un upsert: pisar el mismo path reabre la novena vía").not.toMatch(
      /upsert:\s*true/,
    );
    expect(FUENTE.match(/upsert:\s*false/g) ?? []).toHaveLength(subidas.length);
  });

  /**
   * ═══ Que la pantalla BAJE el generado, no solo que exista la regla ═══
   *
   * Este es el test que faltaba, y su ausencia costó la única falla que
   * encontró Leonardo usando la app: la regla podía estar perfecta en `lib` y
   * la pantalla seguir bajando `archivo_original_path`. Nadie lo miraba.
   *
   * Se lee el archivo como texto porque el botón vive adentro de un
   * componente que no se puede dibujar en un test, y porque lo que hay que
   * fijar no es el aspecto: es **qué archivo recibe una persona**.
   */
  it("el botón de descargar pasa por archivoQueSeBaja, no por el original a secas", () => {
    expect(FUENTE, "la regla dejó de usarse").toContain("archivoQueSeBaja(doc)");
    /**
     * Y que no quede el camino viejo al lado: un `descargar(doc.archivo_original_path`
     * suelto sería exactamente el defecto de origen.
     */
    expect(FUENTE, "volvió el camino que bajaba el archivo viejo").not.toContain(
      "descargar(doc.archivo_original_path",
    );
  });

  it("y al borrar el documento también se borra el generado", () => {
    expect(FUENTE, "el contrato generado quedaría huérfano en un bucket público").toContain(
      "if (doc.docx_path) await borrarDeStorage(doc.docx_path);",
    );
  });

  it("el INSERT de la primera subida no escribe ninguna de las cuatro", () => {
    const desde = FUENTE.indexOf('from("advisor_documents").insert(');
    expect(desde, "cambió la forma del INSERT de advisor_documents").toBeGreaterThan(-1);
    const bloque = FUENTE.slice(desde, FUENTE.indexOf("});", desde));
    for (const columna of ["version_id", "form_data", "estado", "observacion"]) {
      expect(bloque).not.toContain(columna);
    }
  });
});

// ---------------------------------------------------------------------------
// LA GUARDA DE LA RUTA DE UNA VERSIÓN NUEVA
// ---------------------------------------------------------------------------

/**
 * Lo que esta guarda evita, dicho de una vez: el bucket `documents` es PÚBLICO
 * y acá la ruta la manda el cliente —a diferencia del resto de la Etapa C, que
 * baja rutas salidas de la base—. Sin guarda, una ruta de otra inmobiliaria se
 * baja igual y el contrato ajeno sale en texto plano adentro de la vista previa.
 */
describe("validarRutaDeVersionNueva", () => {
  const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const rechaza = (ruta: unknown) => {
    const r = validarRutaDeVersionNueva(ruta, AGENCIA);
    expect(r.ok, `debería rechazar ${JSON.stringify(ruta)}`).toBe(false);
    return r;
  };

  it("acepta la ruta que arma rutaDeVersionNueva para esa misma agencia", () => {
    const ruta = rutaDeVersionNueva(AGENCIA, "abc-123");
    expect(validarRutaDeVersionNueva(ruta, AGENCIA)).toEqual({ ok: true, path: ruta });
  });

  it("la carpeta es propia de las versiones nuevas, no cualquiera de la agencia", () => {
    expect(carpetaDeVersionesNuevas(AGENCIA)).toBe(`asesores/${AGENCIA}/_versiones-nuevas/`);
  });

  it("rechaza la ruta de OTRA inmobiliaria, y lo dice en castellano", () => {
    const r = rechaza(rutaDeVersionNueva(OTRA, "abc"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no es de tu inmobiliaria");
  });

  it("rechaza una agencia que solo EMPIEZA igual", () => {
    // Sin la barra final del prefijo, `asesores/{AGENCIA}-otra/` pasaría.
    rechaza(`asesores/${AGENCIA}-otra/_versiones-nuevas/abc.docx`);
  });

  it("rechaza subir de carpeta con ..", () => {
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/../../${OTRA}/x.docx`);
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/..docx`);
  });

  it("rechaza una ruta absoluta", () => {
    rechaza(`/asesores/${AGENCIA}/_versiones-nuevas/abc.docx`);
  });

  it("rechaza barras invertidas, escapado de URL y caracteres invisibles", () => {
    rechaza("asesores/" + AGENCIA + "/_versiones-nuevas/ab" + String.fromCharCode(92) + "c.docx");
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/%2e%2e/x.docx`);
    rechaza("asesores/" + AGENCIA + "/_versiones-nuevas/ab" + String.fromCharCode(10) + "c.docx");
  });

  it("rechaza una carpeta de más adentro: el nombre no lleva barras", () => {
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/sub/abc.docx`);
  });

  it("rechaza otra carpeta de la misma agencia, incluido el documento de un asesor", () => {
    rechaza(`asesores/${AGENCIA}/11111111-1111-4111-8111-111111111111/plantillas/ana.docx`);
    rechaza(`asesores/${AGENCIA}/_plantillas/abc/v1.docx`);
  });

  it("rechaza lo que no es un .docx", () => {
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/abc.pdf`);
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/abc`);
  });

  it("acepta el .DOCX en mayúsculas, que es lo que a veces guarda Word", () => {
    const ruta = `asesores/${AGENCIA}/_versiones-nuevas/abc.DOCX`;
    expect(validarRutaDeVersionNueva(ruta, AGENCIA).ok).toBe(true);
  });

  it("rechaza lo que no es un texto, y lo que está vacío", () => {
    rechaza(null);
    rechaza(undefined);
    rechaza(42);
    rechaza("");
    rechaza("   ");
  });

  it("rechaza una ruta absurdamente larga", () => {
    rechaza(`asesores/${AGENCIA}/_versiones-nuevas/${"a".repeat(600)}.docx`);
  });

  it("devuelve la ruta EXACTA que se validó, sin recortarla", () => {
    // Validar una y bajar otra es la forma clásica de que la guarda no sirva.
    const ruta = rutaDeVersionNueva(AGENCIA, "abc");
    const r = validarRutaDeVersionNueva(ruta, AGENCIA);
    expect(r.ok && r.path).toBe(ruta);
  });

  /**
   * ═══ El supuesto del que cuelgan tres mutaciones "equivalentes" ═══
   *
   * En la revisión, tres mutaciones de esta guarda sobrevivieron y eran
   * equivalentes DE VERDAD: el alfabeto del nombre ya las subsumía. Pero
   * dejan de serlo apenas alguien ensanche ese alfabeto —para permitir un
   * espacio, un acento, un `%`— y **no había un solo test que se pusiera en
   * rojo** cuando eso pasara.
   *
   * Es la regla que esta etapa ya pagó dos veces: un veredicto de equivalencia
   * no es una propiedad del código, es "no lo distingo con las pruebas Y el
   * código de HOY", y las dos cosas se mueven. Así que el supuesto se fija acá,
   * en vez de heredarse.
   *
   * Si mañana el alfabeto tiene que ser más ancho, este test se cambia a
   * propósito y en el mismo commit — que es exactamente lo que se busca.
   */
  it("el nombre solo admite letras, números, punto, guion y guion bajo", () => {
    const bueno = (nombre: string) =>
      validarRutaDeVersionNueva(`asesores/${AGENCIA}/_versiones-nuevas/${nombre}`, AGENCIA).ok;

    // El alfabeto que hoy se permite, arrancando siempre con letra o número.
    expect(bueno("v2.docx")).toBe(true);
    expect(bueno("Contrato_v2.docx")).toBe(true);
    expect(bueno("contrato-2027.docx")).toBe(true);
    expect(bueno("9.docx")).toBe(true);

    // Y todo lo que queda afuera. Cada uno de estos, admitido, revive alguna de
    // las tres mutaciones que hoy son equivalentes.
    for (const nombre of [
      "con espacio.docx",
      "acentuado_ñ.docx",
      "100%.docx",
      "con/barra.docx",
      "con\\contrabarra.docx",
      "..docx",
      "-arranca-con-guion.docx",
      "_arranca-con-guion-bajo.docx",
      ".arranca-con-punto.docx",
      "sin-extension",
      "doble.docx.pdf",
      "MAYUS.DOC",
    ]) {
      expect(bueno(nombre), `"${nombre}" no tendría que pasar`).toBe(false);
    }
  });
});

/**
 * ═══ LA RUTA QUE NO PUEDE PISAR AL ORIGINAL ═══
 *
 * `archivo_original_path` es el .docx que subió el director, y es la única
 * fuente de verdad contra la que compara toda la verificación de esta etapa. Si
 * el documento GENERADO lo pisara, la próxima comprobación compararía la
 * plantilla contra un archivo que salió de la plantilla misma: daría verde
 * siempre, contra cualquier error.
 *
 * Este test lo mide en vez de confiar en el nombre de la carpeta: se piden las
 * dos rutas con los MISMOS argumentos y tienen que dar distinto.
 */
describe("rutaDelDocumentoGenerado", () => {
  const AG = "ag-1";
  const AD = "ad-1";
  const DOC = "doc-1";

  it("nunca coincide con la ruta del archivo original, ni con los mismos ids", () => {
    for (const version of [1, 2, 99]) {
      expect(rutaDelDocumentoGenerado(AG, AD, DOC, version)).not.toBe(
        rutaDeArchivo(AG, AD, "plantilla", DOC, "docx")
      );
    }
  });

  it("vive adentro de la carpeta del asesor, en su propio subnivel", () => {
    expect(rutaDelDocumentoGenerado(AG, AD, DOC, 2)).toBe(
      `asesores/${AG}/${AD}/plantillas/generados/${DOC}-v2.docx`
    );
  });

  /** Una versión anterior no se borra nunca (spec §7.4), así que su documento tampoco. */
  it("cada versión tiene su propio archivo", () => {
    expect(rutaDelDocumentoGenerado(AG, AD, DOC, 1)).not.toBe(rutaDelDocumentoGenerado(AG, AD, DOC, 2));
  });

  /** Y reintentar la MISMA aplicación escribe encima, en vez de dejar un huérfano por intento. */
  it("dos veces la misma versión dan la misma ruta", () => {
    expect(rutaDelDocumentoGenerado(AG, AD, DOC, 2)).toBe(rutaDelDocumentoGenerado(AG, AD, DOC, 2));
  });
});

// ---------------------------------------------------------------------------
// QUÉ ARCHIVO SE BAJA
// ---------------------------------------------------------------------------

/**
 * El agujero que Leonardo encontró USANDO LA APP, y que ningún test vio.
 *
 * Subió la versión nueva, siguió los pasos, el sistema dijo que estaba todo
 * bien —y estaba: los tres .docx generados eran correctos, con la cláusula
 * nueva, el encabezado, el pie y el nombre de cada persona— y los documentos
 * que mostraba la pantalla seguían siendo los viejos.
 *
 * La etapa entera generaba el documento, lo verificaba con cinco
 * comprobaciones y lo guardaba, y después NO LO MOSTRABA: toda la
 * verificación miró el camino de escritura y nadie miró el de lectura.
 */
describe("archivoQueSeBaja", () => {
  const SIN_GENERAR = {
    archivo_original_path: "asesores/ag/as/plantillas/id.docx",
    docx_path: null,
    nombre_archivo: "Acuerdo de Confidencialidad.docx",
  };

  it("sin versión aplicada, se baja el que subió el director", () => {
    const r = archivoQueSeBaja(SIN_GENERAR);
    expect(r.path).toBe("asesores/ag/as/plantillas/id.docx");
    expect(r.nombre).toBe("Acuerdo de Confidencialidad.docx");
    expect(r.esGenerado).toBe(false);
  });

  it("con una versión aplicada, se baja el GENERADO", () => {
    const r = archivoQueSeBaja({ ...SIN_GENERAR, docx_path: "asesores/ag/as/plantillas/generados/id-v2.docx" });
    expect(r.path, "seguía bajando el original: es el agujero que se cerró").toBe(
      "asesores/ag/as/plantillas/generados/id-v2.docx",
    );
    expect(r.esGenerado).toBe(true);
  });

  /**
   * El asesor baja los dos a la misma carpeta de Descargas. Si se llaman igual,
   * el navegador le pone "(1)" y no tiene forma de saber cuál es cuál.
   */
  it("el generado se distingue por el nombre, y la extensión queda al final", () => {
    const r = archivoQueSeBaja({ ...SIN_GENERAR, docx_path: "x.docx" });
    expect(r.nombre).toBe("Acuerdo de Confidencialidad - actualizado.docx");
    expect(r.nombre.endsWith(".docx"), "Word no abre un archivo sin la extensión al final").toBe(true);
  });

  it("y sin extensión no se rompe", () => {
    expect(nombreDelGenerado("Acuerdo")).toBe("Acuerdo - actualizado");
  });

  /**
   * "Actualizado" y no "generado" ni "v2": el asesor no sabe qué es una versión
   * ni tiene por qué (spec §8.7). Lo único que necesita saber es cuál vale.
   */
  it("no le habla de versiones al asesor", () => {
    const nombre = nombreDelGenerado("Contrato.docx");
    expect(nombre.toLowerCase()).not.toContain("versi");
    expect(nombre.toLowerCase()).not.toContain("generad");
  });
});
