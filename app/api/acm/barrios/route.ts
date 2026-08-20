// ACM · Los barrios que ofrece el desplegable del campo "Barrio / Zona".
//
// Dos fuentes, las dos leídas en vivo — cuando el crawler carga un barrio nuevo aparece
// solo, sin tocar código:
//
//   · la vista acm_barrios_disponibles: los barrios de la red con 25+ avisos activos, más
//     el mapa de zonas del ACM. Hoy son 606.
//   · la cartera de SU agencia: hay 67 barrios de carteras reales (106 propiedades, como
//     el country "Los Bosquecitos" con 15) que no tienen ningún aviso en la red. Sin esto
//     el asesor no encontraría en la lista el barrio de su propia propiedad.
//
// Va con el cliente admin y no con el del usuario a propósito: la lista de barrios de la
// RED tiene que ser la misma para todos. Un asesor necesita poder buscar comparables fuera
// de su cartera — es justamente para lo que existe la red de colaboración. Lo único que
// depende de la agencia son los barrios propios, y esos se filtran por agency_id explícito.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { claveBarrio, type BarrioOpcion } from "@/lib/acm/barrios";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const admin = createAdminClient();

    const [red, cartera] = await Promise.all([
      admin.from("acm_barrios_disponibles").select("clave, nombre, avisos").order("avisos", { ascending: false }),
      admin.from("properties").select("city").eq("agency_id", agencyId).not("city", "is", null),
    ]);

    // Si la vista falla, el desplegable se queda sin catálogo y el asesor no puede cargar
    // NADA. Preferimos que se entere el que mira los logs y que la pantalla lo diga, antes
    // que devolver una lista vacía que parece "no hay barrios".
    if (red.error) throw red.error;
    if (cartera.error) console.error("ACM barrios · cartera de la agencia:", cartera.error);

    const barrios: BarrioOpcion[] = (red.data || []).map((b: any) => ({
      clave: b.clave,
      nombre: b.nombre,
      avisos: b.avisos ?? 0,
    }));

    // Los de la cartera propia que la red no conoce. Se marcan `propio` para que la UI no
    // les muestre "0 avisos" como si fueran un barrio muerto: son válidos, solo que los
    // comparables van a salir de la cartera y no de la red.
    const yaEstan = new Set(barrios.map((b) => b.clave));
    const vistos = new Set<string>();
    for (const p of cartera.data || []) {
      const nombre = String((p as any).city || "").trim();
      const clave = claveBarrio(nombre);
      if (!clave || yaEstan.has(clave) || vistos.has(clave)) continue;
      vistos.add(clave);
      barrios.push({ clave, nombre, avisos: 0, propio: true });
    }

    return NextResponse.json({ barrios });
  } catch (e: any) {
    console.error("ACM barrios:", e);
    return NextResponse.json({ error: e?.message || "No se pudo cargar el listado de barrios." }, { status: 500 });
  }
}
