// Crea (o pone al día) el bucket donde se guardan los PDF/Word institucionales que sube cada
// agencia para que salgan dentro de la ficha del ACM.
//
//   node scripts/crear-bucket-acm-material.mjs
//
// El bucket es PRIVADO: esos archivos no los muestra nadie, ni la ficha ni la pantalla de
// configuración. El único que los abre es el servidor, con el cliente admin, cuando el
// director toca "Volver a leer". Por eso se guarda la ruta interna y no una URL pública.
//
// El tope es de 50 MB. Arrancó en 25 y no alcanzaba: el carpetón "Our Company" de Central pesa
// 25,45 MB y quedaba afuera por 0,45 MB. Un contrato es texto, pero un documento institucional
// es todo imágenes.
//
// Es idempotente: si el bucket ya existe, le pone al día el tope y sigue.
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

const BUCKET = "acm-material";
const OPCIONES = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

const supabase = createClient(url, key);

const { error } = await supabase.storage.createBucket(BUCKET, OPCIONES);

if (error && !/already exists/i.test(error.message)) {
  console.error("No se pudo crear el bucket:", error.message);
  process.exit(1);
}

if (error) {
  // Ya existía: se le pone al día el tope, por si quedó de una versión anterior.
  const { error: upErr } = await supabase.storage.updateBucket(BUCKET, OPCIONES);
  if (upErr) {
    console.error("El bucket existía pero no se pudo actualizar:", upErr.message);
    process.exit(1);
  }
  console.log(`El bucket ${BUCKET} ya existía. Tope actualizado a 50 MB.`);
} else {
  console.log(`Bucket ${BUCKET} creado (privado, 50 MB por archivo).`);
}

// Verificación: se relee lo que quedó, no se confía en la respuesta de la escritura.
const { data: buckets } = await supabase.storage.listBuckets();
const b = buckets?.find((x) => x.name === BUCKET);
console.log(
  `Verificado -> ${b?.name}: ${b?.public ? "PUBLICO" : "privado"}, ` +
  `tope ${b?.file_size_limit ? (b.file_size_limit / 1024 / 1024).toFixed(0) + " MB" : "global"}`,
);
