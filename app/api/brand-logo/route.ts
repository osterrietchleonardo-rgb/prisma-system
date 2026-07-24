// Logo de marca "normalizado" para los documentos públicos (ficha ACM, etc).
//
// Problema real: cada agencia sube el logo como quiere. Muchos vienen en un lienzo cuadrado
// (500x500) con la marca chiquita en el medio y todo el resto transparente/blanco. Si ese archivo
// se muestra tal cual, por más que le demos una caja grande el logo se ve MINÚSCULO, porque lo que
// ocupa la caja es el aire, no la marca.
//
// Solución: recortamos el borde vacío (transparente o del color de fondo) con sharp y devolvemos
// SOLO la marca, en su resolución original (no se reescala → no pierde calidad). Así una caja de
// alto fijo la llena la marca y no el aire, sea el logo cuadrado, apaisado o vertical.
//
// Seguridad: solo se aceptan URLs del storage de nuestro Supabase (evita usar esto de proxy).
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

function permitida(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    return !!base && u.host === new URL(base).host;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") || "";
  // Si no es una URL nuestra, no la procesamos: que el navegador vaya al original.
  if (!permitida(url)) {
    return url ? NextResponse.redirect(url, 302) : new NextResponse("Falta url", { status: 400 });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`origen ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());

    // trim() usa el pixel de la esquina como referencia: recorta el marco transparente de un PNG
    // o el marco blanco de un JPG. threshold tolera bordes con antialias / casi blancos.
    const out = await sharp(input).trim({ threshold: 12 }).png().toBuffer();

    return new NextResponse(new Uint8Array(out), {
      headers: { "Content-Type": "image/png", "Cache-Control": CACHE },
    });
  } catch (e) {
    // Cualquier problema (formato raro, logo que ya venía justo, sharp no disponible): el original.
    console.error("brand-logo: no se pudo recortar, se usa el original:", e);
    return NextResponse.redirect(url, 302);
  }
}
