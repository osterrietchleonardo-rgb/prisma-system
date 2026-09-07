// ─────────────────────────────────────────────────────────────────────────────
// ACM · Material institucional que carga cada agencia y que se imprime dentro de
// la ficha que recibe el propietario. Vive en agencies.marketing_ai_config.acm_material.
// Las cuatro secciones son FIJAS: si la IA pudiera inventar secciones, cada
// propietario recibiría una ficha con una forma distinta.
// ─────────────────────────────────────────────────────────────────────────────

export type ClaveSeccion =
  | "quienes_somos" | "como_comercializamos" | "como_preparar" | "roles_venta";

export interface SeccionMeta {
  clave: ClaveSeccion;
  titulo: string;
  tope: number;
  /** Qué archivo de su carpeta tiene que buscar el director. Sin esto la función queda vacía. */
  ayuda: string;
  /** Dónde va a salir en la ficha, para que entienda qué está armando. */
  donde: string;
}

export const SECCIONES: readonly SeccionMeta[] = [
  {
    clave: "quienes_somos",
    titulo: "Quiénes somos",
    tope: 1200,
    ayuda: "Qué subir: la carpeta de presentación, el «quiénes somos» de tu web, o el brochure que le das al cliente en la primera reunión.",
    donde: "Sale en la hoja 2, antes del precio.",
  },
  {
    clave: "como_comercializamos",
    titulo: "Cómo comercializamos su propiedad",
    tope: 1800,
    ayuda: "Qué subir: tu plan de marketing — en qué portales publicás, cómo trabajás con otras inmobiliarias, cada cuánto le informás al propietario.",
    donde: "Sale al final, después de las conclusiones.",
  },
  {
    clave: "como_preparar",
    titulo: "Cómo preparar su propiedad",
    tope: 1500,
    ayuda: "Qué subir: la guía de cómo preparar la casa para las muestras — orden, luz, limpieza, qué hacer el día de la visita.",
    donde: "Sale en la última hoja.",
  },
  {
    clave: "roles_venta",
    titulo: "El rol de cada uno en la venta",
    tope: 500,
    ayuda: "Qué subir: el cuadro de quién define qué — quién pone el precio de oferta, quién el estado de la propiedad, quién el plan de marketing y quién termina definiendo el precio final.",
    donde: "Sale al lado del gráfico del precio.",
  },
] as const;

export const TOPES = Object.fromEntries(
  SECCIONES.map((s) => [s.clave, s.tope]),
) as Record<ClaveSeccion, number>;

export interface AcmMaterialArchivo {
  id: string;
  nombre: string;
  /** Ruta dentro del bucket privado `acm-material`. No es una URL: nadie lo muestra. */
  path: string;
  subido_el: string;
}

export type AcmSecciones = Record<ClaveSeccion, string>;

export interface AcmMaterial {
  archivos: AcmMaterialArchivo[];
  secciones: AcmSecciones;
}

const esTexto = (v: unknown): v is string => typeof v === "string";

function seccionesVacias(): AcmSecciones {
  return { quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" };
}

function archivosDe(obj: Record<string, unknown>): AcmMaterialArchivo[] {
  return Array.isArray(obj.archivos)
    ? obj.archivos.flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const { id, nombre, path, subido_el } = a as Record<string, unknown>;
        if (!esTexto(id) || !esTexto(nombre) || !esTexto(path) || !esTexto(subido_el)) return [];
        return [{ id, nombre, path, subido_el }];
      })
    : [];
}

const comoObjeto = (raw: unknown) =>
  (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

const seccionesCrudas = (obj: Record<string, unknown>) =>
  (obj.secciones && typeof obj.secciones === "object" ? obj.secciones : {}) as Record<string, unknown>;

/**
 * La forma, sin tocar el contenido. Es la que usa el cuadro de texto MIENTRAS se escribe.
 *
 * No hace trim ni recorta: si limpiara en cada tecla, apretar la barra espaciadora borraría el
 * espacio reción escrito y nunca se podría empezar la segunda palabra. Pasó de verdad, y las
 * pruebas automáticas no lo veían porque pegan el texto entero de una sola vez.
 * La limpieza va cuando se guarda, en normalizarMaterial.
 */
export function formaDeMaterial(raw: unknown): AcmMaterial {
  const obj = comoObjeto(raw);
  const crudas = seccionesCrudas(obj);

  const secciones = seccionesVacias();
  for (const s of SECCIONES) {
    const v = crudas[s.clave];
    if (esTexto(v)) secciones[s.clave] = v;
  }

  return { archivos: archivosDe(obj), secciones };
}

/**
 * Limpia lo que venga de la base o de la IA: recorta al tope y descarta lo que no reconoce.
 * Es la de GUARDAR y la de LEER, nunca la de escribir: para eso está formaDeMaterial.
 */
export function normalizarMaterial(raw: unknown): AcmMaterial {
  const obj = comoObjeto(raw);
  const crudas = seccionesCrudas(obj);

  const secciones = seccionesVacias();
  for (const s of SECCIONES) {
    const v = crudas[s.clave];
    if (esTexto(v)) secciones[s.clave] = v.trim().slice(0, s.tope);
  }

  return { archivos: archivosDe(obj), secciones };
}

/**
 * ¿Esta ruta es un archivo de ESTA agencia?
 *
 * Las rutas llegan del navegador, así que hay que tratarlas como texto hostil. No alcanza con
 * pedir que empiece con el id de la agencia: `A/../B/ajeno.pdf` también empieza con `A/`, y si
 * el storage normalizara ese `..` se estaría leyendo (o borrando) el material de otra
 * inmobiliaria. Por eso no se prohíben caracteres sueltos: se exige la forma EXACTA que arma
 * el propio endpoint de subida, `<agencyId>/<uuid>.<pdf|docx>`, y nada más.
 */
export function esRutaDeLaAgencia(path: unknown, agencyId: string): path is string {
  if (typeof path !== "string" || !/^[0-9a-fA-F-]{36}$/.test(agencyId)) return false;
  return new RegExp(`^${agencyId}/[0-9a-fA-F-]{36}\\.(pdf|docx)$`).test(path);
}

/**
 * Lo único que viaja al snapshot de la ficha. La lista de archivos NO va: el propietario no
 * tiene por qué recibir los nombres de los archivos internos de la agencia.
 * Devuelve null si no hay ni una sección con texto — así la ficha sale igual que siempre.
 */
export function seccionesParaFicha(raw: unknown): AcmSecciones | null {
  const { secciones } = normalizarMaterial(raw);
  const hayAlgo = SECCIONES.some((s) => secciones[s.clave].trim().length > 0);
  return hayAlgo ? secciones : null;
}
