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
//
// POR QUE SE PIDE CON EL TOKEN DE LA FICHA Y NO CON COORDENADAS SUELTAS
// La ficha pública la abre el CLIENTE, que no tiene sesión en PRISMA. La primera versión de
// esto exigía sesión y el mapa salía vacío para todo el mundo menos para el asesor — el error
// se vio recién al mirar la hoja renderizada sin cookies. Pedirlo por token arregla las dos
// cosas a la vez: funciona sin sesión y sigue sin ser un proxy abierto de tiles, porque solo
// dibuja mapas de fichas que existen y con las coordenadas que guardó su propio snapshot (el
// que llama no elige qué se dibuja).
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AcmFichaSnapshot } from "@/lib/acm/ficha";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TILE = 256;
// Zoom 16 ≈ 2 m por píxel en la latitud de Buenos Aires: la imagen cubre unos 2 km de ancho por
// 1,5 km de alto, que es donde caen casi todos los puntos que muestra la hoja. En zoom 15
// entraba el doble de ciudad y los marcadores quedaban todos apelotonados en el centro.
const ZOOM = 16;
// VERTICAL, no apaisado: en la hoja el mapa vive en una columna de 82 mm de ancho por 110 mm de
// alto (proporción 0,75). Con una imagen apaisada, el `object-fit: cover` del CSS recortaba los
// costados y se comía justo los marcadores que están a los lados de la propiedad.
// 3 × 4 tiles = 768 × 1024 px, proporción 0,75: entra sin recortar casi nada.
const ANCHO_TILES = 3;  //  768 px
const ALTO_TILES = 4;   // 1024 px
// A 82 mm de ancho impreso, 768 px son ~238 dpi: nítido en el PDF.
const ANCHO = ANCHO_TILES * TILE;
const ALTO = ALTO_TILES * TILE;

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
const MAX_MARCADORES = 12;

// TAMAÑO DE LOS MARCADORES: se dibujan sobre una imagen de 768 px de ancho que en la hoja se
// muestra a ~310 px, o sea que TODO se ve al 40%. Con radio 9 (que en la imagen suelta parece
// correcto) el marcador terminaba midiendo 3,6 px en el papel: prácticamente invisible. Los
// radios de acá están calculados para verse bien YA REDUCIDOS, no en la imagen original.
const R_POI = 22;   // ~9 px en la hoja
const R_CASA = 34;  // ~14 px en la hoja

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
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!token) return NextResponse.json({ error: "Falta el token." }, { status: 400 });

    const admin = createAdminClient();
    const { data } = await admin.from("shared_acm_reports").select("snapshot").eq("token", token).single();
    const zona = (data?.snapshot as AcmFichaSnapshot | undefined)?.zona;
    if (!zona?.centro) {
      return NextResponse.json({ error: "Esta ficha no tiene mapa." }, { status: 404 });
    }

    const { lat, lon } = zona.centro;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
    }

    // Solo los que tienen punto propio: los conteos (farmacias, escuelas) no se dibujan.
    const pois = zona.pois
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .slice(0, MAX_MARCADORES)
      .map((p) => ({ categoria: p.categoria as string, lat: p.lat as number, lon: p.lon as number }));

    const centro = aTile(lat, lon, ZOOM);
    const x0 = Math.floor(centro.x) - Math.floor(ANCHO_TILES / 2);
    const y0 = Math.floor(centro.y) - Math.floor(ALTO_TILES / 2);

    // Bajar las tiles. Una que falle deja un hueco del color de fondo, no rompe el mapa entero.
    const tiles: Array<{ input: Buffer; top: number; left: number }> = [];
    await Promise.all(
      Array.from({ length: ANCHO_TILES * ALTO_TILES }, async (_, i) => {
        const dx = i % ANCHO_TILES, dy = Math.floor(i / ANCHO_TILES);
        try {
          // "voyager" y no "light_all": el segundo es tan claro que en el papel se ve lavado y
          // no se distinguen las manzanas. Voyager mantiene la limpieza pero deja los parques
          // en verde y las avenidas marcadas, que es lo que le da contexto al lector.
          const r = await fetch(`https://basemaps.cartocdn.com/rastertiles/voyager/${ZOOM}/${x0 + dx}/${y0 + dy}.png`, {
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
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R_POI}" fill="${COLOR[p.categoria] || "#525252"}" stroke="#ffffff" stroke-width="${R_POI / 3}"/>`
      );
    }

    // La propiedad va ÚLTIMA para quedar arriba de todo, más grande y con un halo que la separa
    // del resto: es el punto que el cliente busca primero.
    const c = aPixel(lat, lon);
    marcas.push(`<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${R_CASA * 1.8}" fill="#0a1f33" fill-opacity="0.15"/>`);
    marcas.push(`<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${R_CASA}" fill="#0a1f33" stroke="#ffffff" stroke-width="${R_CASA / 3}"/>`);

    // El crédito es CONDICION DE LA LICENCIA para poder usar estas tiles, no una cita de fuente:
    // la ficha no nombra ninguna otra. Van los dos porque son dos licencias distintas — los
    // datos son de OpenStreetMap y el dibujo es de CARTO. Va chico, sobre una banda
    // semitransparente para que se lea sobre cualquier mapa.
    const credito =
      `<rect x="${ANCHO - 300}" y="${ALTO - 34}" width="300" height="34" fill="#ffffff" fill-opacity="0.72"/>` +
      `<text x="${ANCHO - 10}" y="${ALTO - 11}" text-anchor="end" font-family="sans-serif" font-size="17" fill="#4a4a4a">© OpenStreetMap © CARTO</text>`;

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
    return NextResponse.json({ error: "No se pudo armar el mapa." }, { status: 500 });
  }
}
