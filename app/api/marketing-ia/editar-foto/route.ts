/**
 * Retoque de fotos de propiedades.
 *
 * Se llama UNA VEZ POR PASO, no una vez por foto. Cada paso tarda entre 45 y 90
 * segundos según cuántos reintentos necesite, así que hacer los tres en una sola
 * llamada se pasaría del límite. El navegador encadena: manda "mejorar", recibe
 * una URL, y esa URL es la entrada del paso siguiente. De paso el asesor ve el
 * avance en lugar de mirar un spinner tres minutos.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant, consumeAiCredits, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateImageCost } from "@/utils/aiCostCalculator";
import sharp from "sharp";
import {
  relevar,
  generarOptimo,
  PEDIDOS,
  ESTILOS,
  type Relevamiento,
  type EstiloId,
  type Modo,
} from "@/lib/marketing-ia/fotos-ia";
import {
  reversionar,
  detectarTextos,
  protegerZonas,
  cajaAPixeles,
  type Cambio,
} from "@/lib/marketing-ia/fotos-marcado";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CREDITOS_POR_PASO = 3; // cubre hasta 3 generaciones si el control rechaza

/** Trae una foto (de Tokko o del bucket) y la normaliza a JPEG. */
async function traerFoto(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la foto (${res.status})`);
  const bruto = Buffer.from(await res.arrayBuffer());
  return sharp(bruto).jpeg({ quality: 95 }).toBuffer();
}

/**
 * Guarda la foto y la deja en la galería.
 *
 * Cada paso es una fila de `property_photos`, y `sesion_id` agrupa todo lo que
 * se le hizo a una misma foto: así la galería muestra una sola tarjeta con sus
 * pasos adentro en vez de una por paso.
 */
async function guardar(opciones: {
  foto: Buffer;
  userId: string;
  agencyId: string | null;
  tokkoId: number | string;
  etiqueta: string;
  datos: Record<string, any>;
}) {
  const { foto, userId, agencyId, tokkoId, etiqueta, datos } = opciones;
  const admin = createAdminClient();
  const supabase = await createClient();

  const nombre = `fotos-ia/${userId}/${tokkoId}/${Date.now()}-${etiqueta}.jpg`;
  const { error } = await admin.storage
    .from("marketing-images")
    .upload(nombre, foto, { contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("marketing-images").getPublicUrl(nombre);

  const meta = await sharp(foto).metadata();
  const { error: dbError } = await admin.from("property_photos").insert({
    user_id: userId,
    agency_id: agencyId,
    modo: etiqueta,
    storage_path: nombre,
    public_url: publicUrl,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    ...datos,
  });
  // Que no se pierda la foto si falla el registro: ya está en el bucket.
  if (dbError) console.error("[EDITAR_FOTO] no se pudo registrar en la galería:", dbError.message);

  return publicUrl;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, agencyId } = await requireTenant();
    const tokkoId = body.tokko_id ?? "sueltas";

    // ── Paso 0 · solo relevar (para saber qué tiene el ambiente) ──────
    if (body.accion === "relevar") {
      const foto = await traerFoto(body.foto_url);
      const rel = await relevar(foto);
      return NextResponse.json({ relevamiento: rel });
    }

    const txId = await consumeAiCredits(
      "marketing_ia",
      CREDITOS_POR_PASO,
      `Retoque de foto: ${body.accion || body.modo}`
    );

    let salida: Buffer;
    let relevamiento: Relevamiento;
    let aprobado: boolean;
    let intentos: number;
    let generaciones: number;
    let veredicto: any;
    let etiqueta: string;

    // ── Re-versión: varios cambios marcados sobre una foto ya hecha ──
    if (body.accion === "reversion") {
      const foto = await traerFoto(body.foto_url);
      const referencia = body.referencia_url ? await traerFoto(body.referencia_url) : foto;
      relevamiento = body.relevamiento || (await relevar(referencia));

      // Las zonas llegan en proporción 0-1 desde el navegador: no depende del
      // tamaño con que se muestre la foto en pantalla.
      const meta = await sharp(foto).metadata();
      const W = meta.width!;
      const H = meta.height!;
      const cambios: Cambio[] = (body.cambios || []).map((c: any) => ({
        pedido: c.pedido,
        zona: {
          left: Math.round(c.zona.x * W),
          top: Math.round(c.zona.y * H),
          width: Math.round(c.zona.w * W),
          height: Math.round(c.zona.h * H),
        },
      }));

      const r = await reversionar({
        foto,
        cambios,
        pedidoSuelto: body.pedido_suelto || "",
        rel: relevamiento,
        referencia,
      });
      salida = r.foto;
      aprobado = r.aprobado;
      intentos = r.intentos;
      generaciones = r.generaciones;
      veredicto = r.veredicto;
      etiqueta = "retoque";
    } else {
      // ── Un modo: mejorar, limpiar o ambientar ──────────────────────
      const modo = body.modo as Modo;
      if (!["mejorar", "limpiar", "ambientar"].includes(modo)) {
        return NextResponse.json({ error: "Modo desconocido" }, { status: 400 });
      }
      const foto = await traerFoto(body.foto_url);
      const referencia = body.referencia_url ? await traerFoto(body.referencia_url) : foto;

      // El relevamiento se toma de la referencia, que es la foto ya corregida
      // cuando "mejorar" corrió antes. Sobre una foto oscura lee mal.
      relevamiento = body.relevamiento || (await relevar(referencia));

      const estilo = ESTILOS[(body.estilo as EstiloId) || "moderno"] || ESTILOS.moderno;
      const pedidoBase = modo === "ambientar" ? PEDIDOS.ambientar(estilo) : PEDIDOS[modo];
      const pedido = body.pedido_extra ? `${pedidoBase}\n${body.pedido_extra}` : pedidoBase;

      const r = await generarOptimo({ pedido, foto, rel: relevamiento, referencia });
      salida = r.foto;
      aprobado = r.aprobado;
      intentos = r.intentos;
      generaciones = r.generaciones;
      veredicto = r.veredicto;
      etiqueta = modo;
    }

    // ── Los textos vuelven intactos, sin que nadie los marque ────────
    let textosProtegidos = 0;
    if (body.proteger_textos !== false) {
      try {
        const original = await traerFoto(body.referencia_url || body.foto_url);
        const meta = await sharp(original).metadata();
        const textos = await detectarTextos(original);
        const zonas = textos
          .filter((t) => t.importa !== "baja")
          .map((t) => cajaAPixeles(t.caja, meta.width!, meta.height!));
        if (zonas.length) {
          salida = await protegerZonas({ original, editada: salida, zonas });
          textosProtegidos = zonas.length;
        }
      } catch {
        // si falla la protección, la foto igual se entrega
      }
    }

    const { totalCostUSD } = calculateImageCost({
      model: "gemini-3-pro-image",
      imageCount: generaciones,
      resolution: "2k",
    });
    updateAiTransactionCost(txId, 0, 0, totalCostUSD);

    const url = await guardar({
      foto: salida,
      userId,
      agencyId,
      tokkoId,
      etiqueta,
      datos: {
        // Agrupa todos los pasos que se le hicieron a una misma foto.
        sesion_id: body.sesion_id,
        foto_original: body.foto_original || body.foto_url,
        tokko_id: Number(tokkoId) || null,
        propiedad: body.propiedad_titulo || null,
        estilo: body.estilo || null,
        // Lo que hace falta para poder seguir retocándola desde la galería.
        referencia_url: body.referencia_url || body.foto_url,
        relevamiento,
        aprobado,
        costo_usd: +totalCostUSD.toFixed(4),
      },
    });

    return NextResponse.json({
      url,
      relevamiento,
      aprobado,
      intentos,
      generaciones,
      textos_protegidos: textosProtegidos,
      costo_usd: +totalCostUSD.toFixed(3),
      // Solo para el panel del director; el asesor no lo ve.
      veredicto,
    });
  } catch (error: any) {
    console.error("[EDITAR_FOTO]", error);
    const msg = error?.message || "Error al retocar la foto";
    const status = /crédit|credit/i.test(msg) ? 402 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
