import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function upload() {
  const filePath = "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/Prisma - MK/video-demo-maestro/Video VSL - Vakdor_Prisma/edit/v4-full/VSL - Vakdor - Prisma - EDIT-FINAL.mp4";
  const fileBuffer = fs.readFileSync(filePath);
  console.log("Probando subida de video 1080p Full HD original... Tamaño:", (fileBuffer.length / 1024 / 1024).toFixed(2), "MB");

  const { data, error } = await supabase.storage
    .from('videos')
    .upload('vsl/vsl-vakdor-prisma.mp4', fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (error) {
    console.error("Error subiendo video 1080p:", error);
  } else {
    console.log("¡Video 1080p Full HD subido con éxito!", data);
  }
}

upload();
