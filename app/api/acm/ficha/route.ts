// ACM · Crea una ficha pública de comparables.
// El asesor/director selecciona comparables en la lista del ACM y genera un link de lujo compartible
// (una hoja por comparable + banner de pulso de mercado + comparación calculada de $/m² + marca de la
// agencia + su tarjeta de contacto). Guardamos un SNAPSHOT para que el link sobreviva a cambios.
// Mismo molde que app/api/ficha/share/route.ts.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import type { AcmComparable } from "@/lib/tasacion/types";
import {
  computeComparison,
  matchBarrioPulso,
  type AcmFichaSnapshot,
  type AmbienteStats,
  type FichaComparable,
  type MercadoBarrioLite,
} from "@/lib/acm/ficha";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Token corto y legible (base62, ~12 chars). No secreto: identifica una ficha pública.
function genToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(12);
  let t = "";
  for (const b of Array.from(bytes)) t += alphabet[b % 62];
  return t;
}

const MAX_IMAGES = 16;

// Normaliza el campo images (jsonb) a un array de URLs, sacando vacíos y duplicados.
function allImages(images: any): string[] {
  if (!Array.isArray(images)) return [];
  const urls = images
    .map((i) => (typeof i === "string" ? i : i?.url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  return Array.from(new Set(urls)).slice(0, MAX_IMAGES);
}

// Amenities del comparable de cartera desde tokko_data.tags.
function carteraAmenities(tokko_data: any): string[] {
  const tags = tokko_data?.tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((t: any) => t?.name).filter((n: any): n is string => typeof n === "string" && !!n).slice(0, 30);
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    const body = await req.json();
    const operacion: string = body.operacion === "alquiler" ? "alquiler" : "venta";
    const sujeto = (body.sujeto || {}) as any;
    const comparablesIn = (Array.isArray(body.comparables) ? body.comparables : []) as AcmComparable[];
    const searchId: string | null = typeof body.search_id === "string" ? body.search_id : null; // fila del historial "Mis ACM"

    if (comparablesIn.length === 0) {
      return NextResponse.json({ error: "Elegí al menos un comparable para armar la ficha." }, { status: 400 });
    }
    if (comparablesIn.length > 12) {
      return NextResponse.json({ error: "Máximo 12 comparables por ficha." }, { status: 400 });
    }

    // ── IDs por fuente (roomix llega con prefijo "roomix_") ──
    const carteraIds = comparablesIn.filter((c) => c.source === "cartera").map((c) => c.id);
    const roomixIds = comparablesIn
      .filter((c) => c.source === "roomix")
      .map((c) => c.id.replace(/^roomix_/, ""));

    // ── Enriquecer con fotos/amenities/descripción + marca + contacto + pulso, en paralelo ──
    const [carteraFullRes, roomixFullRes, profileRes, agencyRes, barriosRes, cabaStatRes, cierreRes] = await Promise.all([
      carteraIds.length
        ? supabase
            .from("properties")
            .select("id, description, images, tokko_data")
            .eq("agency_id", agencyId)
            .in("id", carteraIds)
        : Promise.resolve({ data: [] as any[] }),
      roomixIds.length
        ? supabase.from("roomix_properties").select("id, description, images, amenities").in("id", roomixIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("profiles").select("full_name, email, phone, avatar_url, role").eq("id", userId).single(),
      supabase.from("agencies").select("id, name, marketing_ai_config").eq("id", agencyId).single(),
      supabase.from("mercado_barrios").select("barrio, precio_m2_usd, precio_cierre_m2_usd, fuente"),
      supabase
        .from("mercado_stats")
        .select("id, valor")
        .in("id", ["monoambiente_cierre", "dos_ambientes_cierre", "tres_ambientes_cierre", "promedio_caba_cierre"]),
      supabase
        .from("mercado_cierre_mensual")
        .select("brecha_general_pct")
        .order("periodo", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const carteraById: Record<string, any> = {};
    for (const p of carteraFullRes.data || []) carteraById[p.id] = p;
    const roomixById: Record<string, any> = {};
    for (const r of roomixFullRes.data || []) roomixById[r.id] = r;

    const barrios: MercadoBarrioLite[] = (barriosRes.data || []).map((b: any) => ({
      barrio: b.barrio,
      precio_m2_usd: b.precio_m2_usd != null ? Number(b.precio_m2_usd) : null,
      precio_cierre_m2_usd: b.precio_cierre_m2_usd != null ? Number(b.precio_cierre_m2_usd) : null,
      fuente: b.fuente ?? null,
    }));
    const statById = (id: string): number | null => {
      const row = (cabaStatRes.data || []).find((s: any) => s.id === id);
      return row?.valor != null ? Number(row.valor) : null;
    };
    const brechaGeneral = cierreRes?.data?.brecha_general_pct != null ? Number(cierreRes.data.brecha_general_pct) : null;

    const ambStats: AmbienteStats = {
      monoambiente_cierre: statById("monoambiente_cierre"),
      dos_ambientes_cierre: statById("dos_ambientes_cierre"),
      tres_ambientes_cierre: statById("tres_ambientes_cierre"),
      promedio_caba_cierre: statById("promedio_caba_cierre"),
      brecha_general_pct: brechaGeneral,
    };

    // ── Armar los comparables de la ficha (respetando el orden de selección) ──
    const comparables: FichaComparable[] = comparablesIn.map((c) => {
      let images: string[] = c.imagen ? [c.imagen] : [];
      let amenities: string[] = [];
      let descripcion = "";

      if (c.source === "cartera") {
        const full = carteraById[c.id];
        if (full) {
          const imgs = allImages(full.images);
          if (imgs.length) images = imgs;
          amenities = carteraAmenities(full.tokko_data);
          descripcion = full.description || "";
        }
      } else {
        const full = roomixById[c.id.replace(/^roomix_/, "")];
        if (full) {
          const imgs = allImages(full.images);
          if (imgs.length) images = imgs;
          amenities = Array.isArray(full.amenities) ? full.amenities.filter((a: any) => typeof a === "string").slice(0, 30) : [];
          descripcion = full.description || "";
        }
      }

      return {
        id: c.id,
        source: c.source,
        match_pct: c.match_pct ?? 0,
        titulo: c.titulo || "",
        direccion: c.direccion || "",
        zona: c.zona || "",
        tipo: c.tipo || "",
        m2: c.m2 ?? null,
        ambientes: c.ambientes ?? null,
        dormitorios: c.dormitorios ?? null,
        banos: c.banos ?? null,
        precio: c.precio ?? null,
        moneda: c.moneda || "USD",
        precio_m2: c.precio_m2 ?? null,
        descripcion,
        amenities,
        images,
        responsable: c.responsable || "",
        pulso: matchBarrioPulso(c.zona || c.direccion || "", c.ambientes ?? null, barrios, ambStats),
      };
    });

    const comparison = computeComparison(comparables, ambStats);

    // ── Marca de la agencia (Marketing IA → Configuración IA), con aviso legal ──
    const mk = (agencyRes.data?.marketing_ai_config as any) || {};
    const brand = {
      colors: Array.isArray(mk.brand_colors) ? mk.brand_colors.filter((c: any) => typeof c === "string" && c) : [],
      font: typeof mk.brand_font === "string" ? mk.brand_font : "sans",
      logo_url: mk.logo_url || null,
      legal_notice: typeof mk.legal_notice === "string" ? mk.legal_notice : "",
    };

    const profile = profileRes.data;
    const snapshot: AcmFichaSnapshot = {
      subject: {
        direccion: sujeto.direccion || "",
        barrio: sujeto.barrio || "",
        tipo: sujeto.tipo_propiedad || "",
        m2: sujeto.m2_cubiertos ? Number(sujeto.m2_cubiertos) : null,
        dormitorios: sujeto.dormitorios ?? null,
        banos: sujeto.banos ?? null,
      },
      operacion,
      comparables,
      comparison,
      agent: {
        full_name: profile?.full_name || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        avatar_url: profile?.avatar_url || null,
        role: profile?.role || "asesor",
      },
      agency: { id: agencyRes.data?.id || agencyId, name: agencyRes.data?.name || "" },
      brand,
      created_at: new Date().toISOString(),
    };

    const token = genToken();
    const admin = createAdminClient();
    const { error: insErr } = await admin.from("shared_acm_reports").insert({
      token,
      snapshot,
      created_by: userId,
      agency_id: agencyId,
    });
    if (insErr) throw insErr;

    // Historial "Mis ACM": la primera ficha se pega a la fila de la búsqueda; si esa búsqueda YA tenía
    // ficha, duplicamos la fila (misma propiedad y mismos comparables) para que quede una por ficha.
    let historialId: string | null = searchId;
    if (searchId) {
      try {
        const { data: row } = await admin
          .from("acm_searches")
          .select("id, agency_id, user_id, operacion, sujeto, exclude_id, resultados, total_cartera, total_roomix, ficha_token")
          .eq("id", searchId)
          .eq("agency_id", agencyId)
          .maybeSingle();

        if (row && row.ficha_token) {
          const { id: _id, ficha_token: _ft, ...copia } = row as any;
          const { data: nueva } = await admin
            .from("acm_searches")
            .insert({ ...copia, user_id: userId, ficha_token: token })
            .select("id")
            .single();
          historialId = nueva?.id ?? searchId;
        } else if (row) {
          await admin.from("acm_searches").update({ ficha_token: token }).eq("id", searchId);
        }
      } catch (e) {
        console.error("ACM: no se pudo vincular la ficha al historial:", e);
      }
    }

    return NextResponse.json({ token, path: `/ficha-acm/${token}`, search_id: historialId });
  } catch (error: any) {
    console.error("Crear ficha ACM error:", error);
    return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 500 });
  }
}
