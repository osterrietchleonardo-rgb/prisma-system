import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function upload() {
  const filePath = "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/Prisma - MK/video-demo-maestro/Video VSL - Vakdor_Prisma/edit/v4-full/vsl-web-42mb-faststart.mp4";
  const fileBuffer = fs.readFileSync(filePath);
  console.log("Subiendo vsl-web-42mb-faststart.mp4 a Supabase... Tamaño:", (fileBuffer.length / 1024 / 1024).toFixed(2), "MB");

  const { data, error } = await supabase.storage
    .from('videos')
    .upload('vsl/vsl-vakdor-prisma.mp4', fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (error) {
    console.error("Error subiendo video:", error);
  } else {
    console.log("¡Video ultra-optimizado con +faststart subido con éxito!", data);
  }
}

upload();
