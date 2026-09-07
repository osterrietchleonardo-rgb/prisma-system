// Crea el bucket donde se guardan los PDF/Word institucionales que sube cada agencia
// para que salgan dentro de la ficha del ACM. Se corre UNA sola vez.
//
//   node scripts/crear-bucket-acm-material.mjs
//
// El bucket es PRIVADO: esos archivos no los muestra nadie, ni la ficha ni la pantalla de
// configuración. El único que los abre es el servidor, con el cliente admin, cuando el
// director toca "Volver a leer". Por eso se guarda la ruta interna y no una URL pública.
//
// Es idempotente: si el bucket ya existe, avisa y no toca nada.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Carga mínima de .env / .env.local, sin pisar lo que ya venga del entorno.
for (const archivo of [".env", ".env.local"]) {
  try {
    for (const linea of readFileSync(archivo, "utf8").split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // El archivo puede no existir (por ejemplo en CI). No es un error.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase.storage.createBucket("acm-material", {
  public: false,
  fileSizeLimit: 25 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
});

if (error) {
  if (/already exists/i.test(error.message)) {
    console.log("El bucket acm-material ya existía. No se tocó nada.");
    process.exit(0);
  }
  console.error("No se pudo crear el bucket:", error.message);
  process.exit(1);
}

console.log("Bucket acm-material creado (privado, 25 MB por archivo).", data ?? "");
