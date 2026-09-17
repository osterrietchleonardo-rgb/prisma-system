// Qué hay que decir además del número. "fuerte" = la leyenda "requiere estudio profesional"
// va ARRIBA del bloque (spec, "Modo rango" y adenda 17-sep).
import { UNIDADES, unidadDesdeAltura } from "./codigo";
import type { Aviso, CatastroParcela, Edificabilidad, FilaCur } from "./tipos";

const GRUPOS_ESPECIALES = ["AE", "U", "APH", "RUA", "UP", "Espacio Publico", "Area de Renovacion", "EE", "UF"];

export function armarAvisos(args: { cur: FilaCur | null; lote: CatastroParcela; manzanaTipo: "TIPICA" | "ATIPICA" | null; esEsquina: boolean; edificabilidad: Edificabilidad | null }): Aviso[] {
  const { cur, lote, manzanaTipo, esEsquina, edificabilidad } = args;
  const out: Aviso[] = [];
  if (esEsquina) out.push({ clave: "esquina", fuerte: true, texto: "Es un lote en esquina: la línea oficial de esquina y las alturas de las dos calles cambian la envolvente. Requiere estudio profesional." });
  if (manzanaTipo === "ATIPICA" || cur?.tipoMza === "ATIPICA") out.push({ clave: "atipica", fuerte: true, texto: "La manzana es atípica: la línea de frente interno la fija el organismo caso por caso. El dato oficial es orientativo." });
  if (cur?.distGrp && GRUPOS_ESPECIALES.some((g) => cur.distGrp!.startsWith(g))) out.push({ clave: "area_especial", fuerte: true, texto: `La parcela está en ${cur.distEsp || cur.distGrp} (normas propias del Anexo II del Código). Requiere estudio profesional.` });
  if (cur && cur.catalogado !== 0) out.push({ clave: "catalogado", fuerte: true, texto: "Inmueble con protección patrimonial (catalogado). Lo que se puede hacer lo define la Dirección de Interpretación Urbanística." });
  if (cur && cur.uniEdif.length >= 2) out.push({ clave: "dos_alturas", fuerte: true, texto: `La parcela tiene dos alturas distintas (${cur.uniEdif.join(" y ")} m): frente a dos calles o lindera a esquina.` });
  if (lote.propiedadHorizontal && (lote.unidadesFuncionales ?? 0) >= 3) out.push({ clave: "ph_consolidado", fuerte: false, texto: `Hoy hay un edificio consolidado en propiedad horizontal (${lote.unidadesFuncionales} unidades, ${lote.pisosSobreRasante ?? "?"} pisos). El cálculo es sobre el lote vacío.` });
  const hasDosAlturas = cur && cur.uniEdif.length >= 2;
  if (!hasDosAlturas && cur && cur.planoL && cur.uniEdif[0]) {
    const u = unidadDesdeAltura(cur.uniEdif[0]);
    if (u && Math.abs(UNIDADES[u].planoLimite - cur.planoL) > 0.05) out.push({ clave: "plano_limite_raro", fuerte: true, texto: `El plano límite oficial de la parcela (${cur.planoL} m) no es el de su unidad (${UNIDADES[u].planoLimite} m): puede haber completamiento de tejido u otra condición particular.` });
  }
  if (!edificabilidad) out.push({ clave: "sin_envolvente", fuerte: true, texto: "La capa oficial de Ciudad 3D no tiene envolvente para esta parcela: se muestra el rango por la regla del Código." });
  if (!cur) out.push({ clave: "sin_dato_codigo", fuerte: true, texto: "El Código Urbanístico por parcela del GCBA no tiene dato para esta parcela." });
  return out;
}

export function requiereEstudio(avisos: Aviso[]): boolean {
  return avisos.some((a) => a.fuerte);
}
