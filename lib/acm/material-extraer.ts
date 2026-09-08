// ─────────────────────────────────────────────────────────────────────────────
// ACM · Saca el texto de los archivos que sube la agencia. Mismo camino que usa
// Contratos (app/api/contratos/convert-template/route.ts): pdf-parse-fork para PDF,
// mammoth para Word. Del archivo se copia SOLO el texto: los gráficos, las fotos y
// los logos no pasan a la ficha.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 50 MB.
 *
 * Arrancó en 25 MB, copiado de Contratos, y no alcanzaba: un contrato es texto, pero un
 * carpetón institucional es todo imágenes. El "Our Company" de Central pesa 25,45 MB y quedaba
 * afuera por 0,45 MB — medido, no estimado. Del archivo solo se extrae el texto, así que el
 * peso no cuesta nada más que la subida.
 */
export const MAX_ARCHIVO = 50 * 1024 * 1024;

export const EXTENSIONES_OK = ["pdf", "docx"] as const;
export type ExtensionOk = (typeof EXTENSIONES_OK)[number];

export function extensionDe(nombre: string): ExtensionOk | null {
  const punto = nombre.lastIndexOf(".");
  if (punto < 0) return null;
  const ext = nombre.slice(punto + 1).toLowerCase();
  return (EXTENSIONES_OK as readonly string[]).includes(ext) ? (ext as ExtensionOk) : null;
}

export async function extraerTexto(buffer: Buffer, ext: ExtensionOk): Promise<string> {
  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  // pdf-parse-fork es CommonJS: import dinámico, igual que en Contratos.
  const pdfParse = (await import("pdf-parse-fork")).default;
  const { text } = await pdfParse(buffer);
  return text;
}
