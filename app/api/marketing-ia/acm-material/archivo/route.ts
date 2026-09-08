// ACM · Sube y borra los archivos institucionales que la agencia usa para armar las cuatro
// secciones del material. El bucket es privado: acá solo se guarda y se saca; leerlos es
// tarea del endpoint /leer, que corre en el servidor.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { MAX_ARCHIVO, extensionDe } from "@/lib/acm/material-extraer";
import { esRutaDeLaAgencia } from "@/lib/acm/material";

export const dynamic = "force-dynamic";

const BUCKET = "acm-material";

export async function POST(req: Request) {
  try {
    // requireTenant ya trae el rol: no hace falta una segunda consulta a profiles.
    const { agencyId, role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden cargar el material del ACM." },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No llegó ningún archivo." }, { status: 400 });

    if (file.size > MAX_ARCHIVO) {
      return NextResponse.json({ error: "El archivo pasa los 50 MB." }, { status: 400 });
    }

    const ext = extensionDe(file.name);
    if (!ext) {
      return NextResponse.json(
        { error: "Solo se pueden subir PDF o Word (.docx)." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    const path = `${agencyId}/${id}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });
    if (error) throw error;

    return NextResponse.json({
      id,
      nombre: file.name,
      path,
      subido_el: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material upload:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden borrar el material del ACM." },
        { status: 403 },
      );
    }

    const { path } = (await req.json()) as { path?: string };
    // La ruta llega del navegador, así que se exige la forma exacta que arma la subida.
    // Un startsWith no alcanza: `A/../B/ajeno.pdf` también empieza con el id propio, y con eso
    // se podría borrar el material de otra inmobiliaria.
    if (!esRutaDeLaAgencia(path, agencyId)) {
      return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).remove([path]);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material delete:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
