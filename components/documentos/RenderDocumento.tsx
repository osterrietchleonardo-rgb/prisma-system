// Dibuja un documento a partir de su snapshot. Lo usan la página pública (con los datos
// congelados) y la vista previa del director (con un asesor real y la plantilla sin guardar).
// No es "use client": no tiene estado. El HTML sale de generarHtml, con la lista fija de
// extensiones, y por eso se puede poner con dangerouslySetInnerHTML sin sanitizar.
//
// La marca de la agencia entra por variables CSS puestas en línea sobre .documento: los dos
// colores (barra de color arriba y abajo, títulos, bloque del asesor) y la marca de agua.
import { generarHtml } from "@/lib/documentos/tiptap";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";

const COLORES_POR_DEFECTO = ["#0a1f33", "#c8a061"];

/** Un trazo sutil de casas y edificios, en el color de la marca, para el fondo de cada hoja. */
export function marcaDeAgua(color: string): string {
  // El color va crudo adentro del SVG: el encodeURIComponent de abajo ya escapa el "#".
  // Codificarlo acá también lo dejaba doble ("%2523…") y el trazo salía invisible.
  const c = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#0a1f33";
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 794 1000'>` +
    `<g fill='none' stroke='${c}' stroke-width='3.5' stroke-linejoin='round' stroke-linecap='round' opacity='0.11' transform='translate(197 300)'>` +
    // edificio alto
    `<rect x='40' y='80' width='120' height='300'/>` +
    `<path d='M70 110h20M110 110h20M70 150h20M110 150h20M70 190h20M110 190h20M70 230h20M110 230h20M70 270h20M110 270h20M70 310h20M110 310h20'/>` +
    `<path d='M85 380v-40h30v40'/>` +
    // casa con techo a dos aguas
    `<path d='M180 380V220l90-80 90 80v160'/>` +
    `<path d='M160 230l110-100 110 100'/>` +
    `<rect x='205' y='260' width='34' height='34'/><rect x='300' y='260' width='34' height='34'/>` +
    `<path d='M250 380v-60h40v60'/>` +
    // torre a la derecha
    `<path d='M380 380V140h100v240'/>` +
    `<path d='M405 170h20M445 170h20M405 210h20M445 210h20M405 250h20M445 250h20M405 290h20M445 290h20M405 330h20M445 330h20'/>` +
    // piso
    `<path d='M0 380h500'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function RenderDocumento({ snap }: { snap: SnapshotDocumento }) {
  const { plantilla } = snap;
  const bloque = plantilla.bloque_asesor;
  const bloqueHtml = generarHtml(bloque.texto);
  const arriba = bloque.posicion === "header" || bloque.posicion === "ambos";
  const abajo = bloque.posicion === "footer" || bloque.posicion === "ambos";

  const colores = snap.brand?.colors?.filter(Boolean) ?? [];
  const marca1 = colores[0] || COLORES_POR_DEFECTO[0];
  const marca2 = colores[1] || colores[0] || COLORES_POR_DEFECTO[1];
  const estilo = {
    "--marca1": marca1,
    "--marca2": marca2,
    "--marca-agua": marcaDeAgua(marca1),
  } as React.CSSProperties;

  return (
    <article className="documento" style={estilo}>
      {/* El header lleva siempre la barra de color de la marca; la imagen y el bloque, si los hay. */}
      <header className="documento-header">
        <div className="documento-barra" />
        {plantilla.header_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plantilla.header_url} alt="" className="documento-franja" />
        )}
        {arriba && bloqueHtml && (
          <div className="documento-bloque" dangerouslySetInnerHTML={{ __html: bloqueHtml }} />
        )}
      </header>

      <main className="documento-cuerpo" dangerouslySetInnerHTML={{ __html: generarHtml(plantilla.cuerpo) }} />

      <footer className="documento-footer">
        {abajo && bloqueHtml && (
          <div className="documento-bloque" dangerouslySetInnerHTML={{ __html: bloqueHtml }} />
        )}
        {plantilla.footer_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plantilla.footer_url} alt="" className="documento-franja" />
        )}
        <div className="documento-barra" />
      </footer>
    </article>
  );
}
