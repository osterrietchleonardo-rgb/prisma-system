// Dirección (calle oficial + altura) → parcela por las puertas del GCBA → informe completo.
// No guarda nada: guardar es otro botón (POST /api/prefactibilidad).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarParcela, ParcelaNoEncontrada } from "@/lib/prefactibilidad/analizar";
import { dependenciasSupabase } from "@/lib/prefactibilidad/dependencias-supabase";
import { GcbaNoResponde } from "@/lib/prefactibilidad/gcba";
import { proyector } from "@/lib/prefactibilidad/geo";
import { calleClave } from "@/lib/prefactibilidad/normalizar-calle";
import type { Aviso } from "@/lib/prefactibilidad/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ calle: z.string().min(1), altura: z.number().int().positive(), direccion: z.string().min(1), lat: z.number().optional(), lng: z.number().optional() });

const AVISO_PUERTA_AMBIGUA: Aviso = { clave: "puerta_ambigua", fuerte: false, texto: "Hay más de una parcela con esta calle y número; se tomó la más probable. Verificá la dirección." };

export async function POST(req: Request) {
  try {
    await requireTenant();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Elegí una dirección de la lista." }, { status: 400 });
    const { calle, altura, direccion, lat, lng } = parsed.data;
    const admin = createAdminClient();
    const { data } = await admin.from("gcba_puertas").select("smp, es_esquina").eq("calle_clave", calleClave(calle)).eq("altura", altura).order("smp");
    const filas = data ?? [];
    if (filas.length === 0) return NextResponse.json({ error: "No encontramos ese número. Probá con otro número de la misma cuadra" }, { status: 404 });
    // Dos calles distintas pueden compartir clave (p. ej. "AV. SAN MARTIN" y "SAN MARTIN"): smp distintos.
    const candidatos = [...new Map(filas.map((f: any) => [f.smp, f])).values()].slice(0, 5) as { smp: string; es_esquina: boolean }[];
    const deps = dependenciasSupabase(admin);
    let puerta = candidatos[0];
    const avisosExtra: Aviso[] = [];
    if (candidatos.length > 1) {
      if (lat != null && lng != null) {
        const proy = proyector([lng, lat]);
        const conDistancia = await Promise.all(candidatos.map(async (c) => {
          // Un candidato que no resuelve (o que el catastro no responde) no puede tirar abajo
          // toda la consulta: pierde el desempate, no rompe la request.
          try {
            const parcela = await deps.gcba.parcela(c.smp);
            if (!parcela) return { c, d: Infinity };
            const [x, y] = proy.aMetros(parcela.centroide);
            return { c, d: Math.hypot(x, y) };
          } catch {
            return { c, d: Infinity };
          }
        }));
        conDistancia.sort((a, b) => a.d - b.d);
        puerta = conDistancia[0].c;
        // Si ni el ganador tiene distancia real, el desempate no desempató nada: es la misma
        // ambigüedad de siempre, aunque hayan venido lat/lng.
        if (conDistancia[0].d === Infinity) avisosExtra.push(AVISO_PUERTA_AMBIGUA);
      } else {
        avisosExtra.push(AVISO_PUERTA_AMBIGUA);
      }
    }
    const prefactibilidad = await analizarParcela(puerta.smp, direccion, deps);
    if (avisosExtra.length) prefactibilidad.avisos = [...prefactibilidad.avisos, ...avisosExtra];
    return NextResponse.json({ prefactibilidad });
  } catch (e: any) {
    if (e instanceof ParcelaNoEncontrada) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad analizar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
