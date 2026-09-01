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
import { anchoDelTexto, comoPaths, contornosDeTexto } from "@/lib/tipografia/contornos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AcmFichaSnapshot } from "@/lib/acm/ficha";
// Zoom, recorte, colores y el cálculo de qué punto entra en cuadro viven en lib/acm/zona-mapa.ts
// porque la hoja los necesita para escribir las referencias del mapa con los mismos colores y sin
// nombrar ningún punto que no se llegue a ver. Ver el comentario de ese archivo.
import {
  TILE, ZOOM, ANCHO_TILES, ALTO_TILES, ANCHO, ALTO, R_POI, R_CASA,
  COLOR_ZONA, COLOR_PROPIEDAD, aTile, origenDelRecorte, marcadoresDibujados,
} from "@/lib/acm/zona-mapa";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";

// CARTO regalo estos mapas durante años y desde 2026 pide una clave para saber quien los usa:
// a quien no la manda le estampa "API KEY REQUIRED" en diagonal sobre CADA pieza del mapa. Salio
// asi en todas las fichas hasta el 1-sep-2026. La clave es gratis hasta 5 millones de piezas por
// mes (nosotros gastamos 12 por ficha abierta) y la condicion es que el credito de CARTO y
// OpenStreetMap se vea en el mapa — se dibuja mas abajo.
//
// La piden nuestros servidores y no el navegador, asi que la clave NUNCA llega al cliente: por
// eso va sin NEXT_PUBLIC_. Vive en las variables de entorno de Vercel; si falta, el mapa igual
// se arma pero vuelve la marca de agua, y por eso se avisa en el log.
const CARTO_KEY = process.env.CARTO_API_KEY;

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

    // Qué marcadores entran: fuera los conteos (una "farmacia a 300 m" es un radio, no un lugar)
    // y fuera los que caen afuera del recorte. Lo decide el helper compartido, así la hoja puede
    // escribir las referencias sabiendo exactamente qué se dibujó.
    const marcadores = marcadoresDibujados(zona.centro, zona.pois);
    const { x0, y0 } = origenDelRecorte(zona.centro);

    if (!CARTO_KEY) {
      console.error("[ERROR] Falta CARTO_API_KEY: el mapa va a salir con la marca de agua 'API KEY REQUIRED'.");
    }

    // Bajar las tiles. Una que falle deja un hueco del color de fondo, no rompe el mapa entero.
    const tiles: Array<{ input: Buffer; top: number; left: number }> = [];
    await Promise.all(
      Array.from({ length: ANCHO_TILES * ALTO_TILES }, async (_, i) => {
        const dx = i % ANCHO_TILES, dy = Math.floor(i / ANCHO_TILES);
        try {
          // "voyager" y no "light_all": el segundo es tan claro que en el papel se ve lavado y
          // no se distinguen las manzanas. Voyager mantiene la limpieza pero deja los parques
          // en verde y las avenidas marcadas, que es lo que le da contexto al lector.
          const url =
            `https://basemaps.cartocdn.com/rastertiles/voyager/${ZOOM}/${x0 + dx}/${y0 + dy}.png` +
            (CARTO_KEY ? `?key=${CARTO_KEY}` : "");
          const r = await fetch(url, {
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

    const marcas = marcadores.map(
      (m) =>
        `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${R_POI}" fill="${COLOR_ZONA[m.categoria] || "#525252"}" stroke="#ffffff" stroke-width="${R_POI / 3}"/>`
    );

    // La propiedad va ÚLTIMA para quedar arriba de todo, más grande y con un halo que la separa
    // del resto: es el punto que el cliente busca primero.
    const t = aTile(lat, lon, ZOOM);
    const cx = ((t.x - x0) * TILE).toFixed(1);
    const cy = ((t.y - y0) * TILE).toFixed(1);
    marcas.push(`<circle cx="${cx}" cy="${cy}" r="${R_CASA * 1.8}" fill="${COLOR_PROPIEDAD}" fill-opacity="0.15"/>`);
    marcas.push(`<circle cx="${cx}" cy="${cy}" r="${R_CASA}" fill="${COLOR_PROPIEDAD}" stroke="#ffffff" stroke-width="${R_CASA / 3}"/>`);

    // El crédito es CONDICION DE LA LICENCIA para poder usar estas tiles, no una cita de fuente:
    // la ficha no nombra ninguna otra. Van los dos porque son dos licencias distintas — los
    // datos son de OpenStreetMap y el dibujo es de CARTO. Va chico, sobre una banda
    // semitransparente para que se lea sobre cualquier mapa.
    //
    // POR QUE EL TEXTO SE DIBUJA COMO FORMAS Y NO CON <text>: en el runtime de Vercel no hay
    // ninguna fuente instalada, asi que un <text> sale como una fila de cuadraditos vacios.
    // Estuvo saliendo asi en TODAS las fichas hasta el 1-sep-2026 — o sea, sin el credito que la
    // licencia exige — y no se veia en local, donde Windows si tiene fuentes. Ver
    // lib/tipografia/contornos.ts. La banda se dimensiona con el ancho REAL del texto, que ahora
    // lo sabemos porque lo medimos nosotros.
    const CUERPO_CREDITO = 17;
    const PAD = 10;
    const TEXTO_CREDITO = "© OpenStreetMap © CARTO";
    const anchoBanda = Math.ceil(anchoDelTexto(TEXTO_CREDITO, CUERPO_CREDITO)) + PAD * 2;
    const letras = contornosDeTexto(
      TEXTO_CREDITO,
      ANCHO - anchoBanda + PAD,
      ALTO - 11,
      CUERPO_CREDITO
    );
    if (letras.letrasRotas > 0) {
      // Nunca deberia pasar. Si pasa, el mapa sale sin el credito que exige la licencia.
      console.error(`[ERROR] Credito del mapa: ${letras.letrasRotas} letras no se pudieron dibujar`);
    }
    const credito =
      `<rect x="${ANCHO - anchoBanda}" y="${ALTO - 34}" width="${anchoBanda}" height="34" fill="#ffffff" fill-opacity="0.72"/>` +
      comoPaths(letras.paths, "#4a4a4a");

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
        // El grueso del cacheo lo hace el CDN (`s-maxage`), que es lo que evita pedirle piezas a
        // CARTO cada vez que alguien abre una ficha y mantiene el uso dentro de lo que permite el
        // plan libre. Vercel lo limpia solo en cada deploy, asi que un arreglo del mapa entra de
        // una.
        //
        // POR QUE EL NAVEGADOR CACHEA SOLO UNA HORA, Y POR QUE YA NO DICE `immutable`: esto decia
        // "el mapa de una coordenada no cambia nunca" y guardaba un año con `immutable`, que le
        // pide al navegador que NI SIQUIERA PREGUNTE — ni con F5. La premisa resulto falsa dos
        // veces el mismo dia (1-sep-2026): se arreglo el credito de OpenStreetMap, que salia como
        // cuadraditos vacios, y se le saco la marca de agua "API KEY REQUIRED" de CARTO. Las dos
        // veces el cliente siguio viendo la version vieja y solo se arreglaba con Ctrl+Shift+R,
        // que no se le puede pedir a nadie. Una hora es corto para que cualquier arreglo llegue
        // y largo para no volver a bajar la imagen mientras alguien lee la ficha.
        "Cache-Control": "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400",
      },
    });
  } catch (e: any) {
    console.error("ACM mapa-zona error:", e);
    return NextResponse.json({ error: "No se pudo armar el mapa." }, { status: 500 });
  }
}
