// ACM · Sumar (o quitar) un comparable pegando el link del aviso.
//
// POST { url, sujeto, operacion, search_id? }            → arma el comparable y lo devuelve.
// POST { accion: "quitar", id, search_id }                → lo saca del ACM guardado.
//
// Con `search_id`, lo sumado queda guardado dentro de la búsqueda (`resultados.agregados`), así
// "Mis ACM" lo muestra al reabrirla. Ver lib/acm/comparable-link.ts para cómo se arma.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { comparableDesdeLink } from "@/lib/acm/comparable-link";
import type { AcmComparable, Operacion, Sujeto } from "@/lib/tasacion/types";

export const dynamic = "force-dynamic";
// Leer un portal que bloquea puede llevar hasta ~40 s (el extractor con navegador).
export const maxDuration = 60;

/** Tope de comparables sumados a mano por ACM. La ficha lleva 12 como máximo. */
const MAX_AGREGADOS = 12;

export async function POST(req: Request) {
  try {
    const { userId, agencyId, role } = await requireTenant();
    const admin = createAdminClient();
    const body = await req.json();
    const searchId: string | null = typeof body.search_id === "string" && body.search_id ? body.search_id : null;

    // La búsqueda guardada: el asesor solo toca las propias, el director las de su agencia
    // (mismo criterio que /api/acm/searches/[id]).
    const leerBusqueda = async () => {
      if (!searchId) return null;
      let q = admin.from("acm_searches").select("id, resultados").eq("id", searchId).eq("agency_id", agencyId);
      if (role !== "director") q = q.eq("user_id", userId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as { id: string; resultados: any } | null;
    };

    if (body.accion === "quitar") {
      const id = typeof body.id === "string" ? body.id : "";
      const fila = await leerBusqueda();
      if (!fila) return NextResponse.json({ error: "No encontramos ese ACM." }, { status: 404 });
      const r = fila.resultados || {};
      const agregados = (Array.isArray(r.agregados) ? r.agregados : []).filter((c: AcmComparable) => c?.id !== id);
      const { error } = await admin.from("acm_searches").update({ resultados: { ...r, agregados } }).eq("id", fila.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) {
      return NextResponse.json({ error: "Pegá el link completo del aviso (empieza con https://)." }, { status: 400 });
    }
    const sujeto = (body.sujeto || {}) as Partial<Sujeto>;
    const operacion: Operacion = body.operacion === "alquiler" ? "alquiler" : "venta";
    const pesoSemantica = (sujeto.descripcion_ia || "").trim() ? 20 : 10;

    const fila = await leerBusqueda();
    if (searchId && !fila) return NextResponse.json({ error: "No encontramos ese ACM." }, { status: 404 });
    const previos: AcmComparable[] = Array.isArray(fila?.resultados?.agregados) ? fila!.resultados.agregados : [];
    if (previos.length >= MAX_AGREGADOS) {
      return NextResponse.json({ error: `Podés sumar hasta ${MAX_AGREGADOS} comparables por link en un ACM.` }, { status: 400 });
    }

    const res = await comparableDesdeLink({ admin, url, sujeto, operacion, pesoSemantica });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });

    // ¿La búsqueda ya lo había traído? Entonces no se suma: se dice dónde está. Lo decide el
    // servidor y no la pantalla, porque lo que cuenta es lo guardado: si se guardara igual, al
    // reabrir el ACM desde "Mis ACM" el mismo aviso aparecería dos veces (pasó al probarlo).
    const enLista = [
      ...(Array.isArray(fila?.resultados?.cartera) ? fila!.resultados.cartera : []),
      ...(Array.isArray(fila?.resultados?.roomix) ? fila!.resultados.roomix : []),
    ].find((c: AcmComparable) => c?.id === res.comparable.id);
    if (enLista) {
      return NextResponse.json({
        comparable: res.comparable,
        ya_en_lista: { source: enLista.source, match_pct: enLista.match_pct },
      });
    }

    if (fila) {
      // Si ya estaba (el mismo aviso pegado dos veces), se reemplaza: queda uno solo.
      const agregados = [...previos.filter((c) => c?.id !== res.comparable.id), res.comparable];
      const { error } = await admin
        .from("acm_searches")
        .update({ resultados: { ...(fila.resultados || {}), agregados } })
        .eq("id", fila.id);
      // Guardarlo en el historial no puede impedir usarlo ahora: se avisa en el log y sigue.
      if (error) console.error("ACM comparable por link: no se pudo guardar en el historial:", error);
    }

    return NextResponse.json({ comparable: res.comparable, aviso: res.aviso ?? null });
  } catch (e: any) {
    console.error("ACM comparable por link error:", e);
    return NextResponse.json(
      { error: e.message === "Unauthorized" ? "Tu sesión venció. Volvé a entrar." : "No pudimos sumar ese aviso. Probá de nuevo." },
      { status: e.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
