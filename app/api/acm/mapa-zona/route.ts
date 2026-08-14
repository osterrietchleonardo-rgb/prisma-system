// ACM · El mapa de la hoja del entorno: una IMAGEN FIJA, no un mapa interactivo.
//
// POR QUE FIJA: la ficha se imprime a PDF desde el navegador (ver PrintButton). Un mapa
// interactivo sale en blanco o a medio cargar en el PDF; un <img> ya cargado sale siempre.
//
// POR QUE NO MAPTILER: la NEXT_PUBLIC_MAPTILER_KEY del .env está restringida por dominio y
// devuelve "403 Key usage restricted" desde el servidor (medido).
//
// POR QUE EL ESTILO CLARO Y NO EL DE OPENSTREETMAP: son los mismos datos, dibujados distinto.
// El estilo estándar de OSM está pensado para navegar y viene lleno de iconitos (comercios,
// iglesias, bancos, cajeros): sobre ese fondo, los cinco marcadores que nos importan se pierden
// entre otros cincuenta dibujos. El estilo claro deja las calles con su nombre y poco más, que
// es exactamente lo que tiene que hacer el mapa de un informe. Se compararon los dos con la
// misma dirección antes de elegir.
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TILE = 256;
// Zoom 16 ≈ 2 m por píxel en la latitud de Buenos Aires: la imagen cubre unos 2 km de ancho por
// 1,5 km de alto, que es donde caen casi todos los puntos que muestra la hoja. En zoom 15
// entraba el doble de ciudad y los marcadores quedaban todos apelotonados en el centro.
const ZOOM = 16;
const ANCHO_TILES = 4;  // 1024 px
const ALTO_TILES = 3;   //  768 px
// A 82 mm de ancho impreso, 1024 px son ~317 dpi: nítido en el PDF.
const ANCHO = ANCHO_TILES * TILE;
const ALTO = ALTO_TILES * TILE;

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
const MAX_MARCADORES = 12;

/** lon/lat → coordenadas de tile fraccionarias (Web Mercator). */
function aTile(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

// Un círculo de color con borde blanco. NO se usan emoji: no se renderizan igual en todos los
// sistemas y en el servidor directamente no hay fuente que los tenga.
const COLOR: Record<string, string> = {
  subte: "#1d4ed8",
  espacio_verde: "#15803d",
  escuela: "#b45309",
  hospital: "#be123c",
  comisaria: "#4338ca",
  ciclovia: "#0891b2",
  farmacia: "#7c3aed",
  ecobici: "#0d9488",
  parada_colectivo: "#525252",
};

export async function GET(req: Request) {
  try {
    // Endpoint autenticado: no es un proxy abierto de tiles para cualquiera de internet.
    await requireTenant();

    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "Faltan las coordenadas." }, { status: 400 });
    }

    let pois: Array<{ categoria: string; lat: number; lon: number }> = [];
    try {
      const crudo = JSON.parse(url.searchParams.get("pois") || "[]");
      if (Array.isArray(crudo)) {
        pois = crudo
          .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
          .slice(0, MAX_MARCADORES); // son marcadores, no una capa de datos
      }
    } catch {
      // Sin marcadores extra: el mapa sale igual, con la propiedad sola.
    }

    const centro = aTile(lat, lon, ZOOM);
    const x0 = Math.floor(centro.x) - Math.floor(ANCHO_TILES / 2);
    const y0 = Math.floor(centro.y) - Math.floor(ALTO_TILES / 2);

    // Bajar las tiles. Una que falle deja un hueco del color de fondo, no rompe el mapa entero.
    const tiles: Array<{ input: Buffer; top: number; left: number }> = [];
    await Promise.all(
      Array.from({ length: ANCHO_TILES * ALTO_TILES }, async (_, i) => {
        const dx = i % ANCHO_TILES, dy = Math.floor(i / ANCHO_TILES);
        try {
          const r = await fetch(`https://basemaps.cartocdn.com/light_all/${ZOOM}/${x0 + dx}/${y0 + dy}.png`, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) return;
          tiles.push({ input: Buffer.from(await r.arrayBuffer()), top: dy * TILE, left: dx * TILE });
        } catch {
          // hueco
        }
      })
    );
    if (tiles.length === 0) {
      return NextResponse.json({ error: "No se pudo armar el mapa." }, { status: 502 });
    }

    /** Píxel dentro de la imagen para una coordenada. */
    const aPixel = (la: number, lo: number) => {
      const t = aTile(la, lo, ZOOM);
      return { x: (t.x - x0) * TILE, y: (t.y - y0) * TILE };
    };

    const marcas: string[] = [];
    for (const p of pois) {
      const { x, y } = aPixel(p.lat, p.lon);
      // Fuera de cuadro (un hospital puede estar a 3 km): no se dibuja, no se recorta contra el
      // borde. Un marcador mordido por el margen parece un error de impresión.
      if (x < 10 || y < 10 || x > ANCHO - 10 || y > ALTO - 10) continue;
      marcas.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${COLOR[p.categoria] || "#525252"}" stroke="#ffffff" stroke-width="3"/>`
      );
    }

    // La propiedad va ÚLTIMA para quedar arriba de todo, más grande y con un halo que la separa
    // del resto: es el punto que el cliente busca primero.
    const c = aPixel(lat, lon);
    marcas.push(`<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="22" fill="#0a1f33" fill-opacity="0.16"/>`);
    marcas.push(`<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="13" fill="#0a1f33" stroke="#ffffff" stroke-width="4"/>`);

    // El crédito es CONDICION DE LA LICENCIA para poder usar estas tiles, no una cita de fuente:
    // la ficha no nombra ninguna otra. Van los dos porque son dos licencias distintas — los
    // datos son de OpenStreetMap y el dibujo es de CARTO. Va chico, sobre una banda
    // semitransparente para que se lea sobre cualquier mapa.
    const credito =
      `<rect x="${ANCHO - 250}" y="${ALTO - 26}" width="250" height="26" fill="#ffffff" fill-opacity="0.7"/>` +
      `<text x="${ANCHO - 8}" y="${ALTO - 8}" text-anchor="end" font-family="sans-serif" font-size="13" fill="#4a4a4a">© OpenStreetMap © CARTO</text>`;

    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">${marcas.join("")}${credito}</svg>`
    );

    const png = await sharp({
      create: { width: ANCHO, height: ALTO, channels: 4, background: "#e8e6e1" },
    })
      .composite([...tiles, { input: svg, top: 0, left: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // El mapa de una coordenada no cambia nunca: que lo cachee el CDN y no le pidamos tiles
        // a OSM cada vez que alguien abre la ficha. Es lo que mantiene el uso dentro de lo que
        // permite su política.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e: any) {
    console.error("ACM mapa-zona error:", e);
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "No se pudo armar el mapa." }, { status: 500 });
  }
}
