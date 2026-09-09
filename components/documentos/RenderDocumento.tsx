// Dibuja un documento a partir de su snapshot. Lo usan la página pública (con los datos
// congelados) y la vista previa del director (con un asesor real y la plantilla sin guardar).
// No es "use client": no tiene estado. El HTML sale de generarHtml, con la lista fija de
// extensiones, y por eso se puede poner con dangerouslySetInnerHTML sin sanitizar.
import { generarHtml } from "@/lib/documentos/tiptap";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";

export function RenderDocumento({ snap }: { snap: SnapshotDocumento }) {
  const { plantilla } = snap;
  const bloque = plantilla.bloque_asesor;
  const bloqueHtml = generarHtml(bloque.texto);
  const arriba = bloque.posicion === "header" || bloque.posicion === "ambos";
  const abajo = bloque.posicion === "footer" || bloque.posicion === "ambos";

  return (
    <article className="documento">
      {(plantilla.header_url || arriba) && (
        <header className="documento-header">
          {plantilla.header_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plantilla.header_url} alt="" className="documento-franja" />
          )}
          {arriba && bloqueHtml && (
            <div className="documento-bloque" dangerouslySetInnerHTML={{ __html: bloqueHtml }} />
          )}
        </header>
      )}

      <main className="documento-cuerpo" dangerouslySetInnerHTML={{ __html: generarHtml(plantilla.cuerpo) }} />

      {(plantilla.footer_url || abajo) && (
        <footer className="documento-footer">
          {abajo && bloqueHtml && (
            <div className="documento-bloque" dangerouslySetInnerHTML={{ __html: bloqueHtml }} />
          )}
          {plantilla.footer_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plantilla.footer_url} alt="" className="documento-franja" />
          )}
        </footer>
      )}
    </article>
  );
}
