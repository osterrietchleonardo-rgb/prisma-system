// Las imágenes de header/footer van al bucket PÚBLICO marketing-images, que ya sirve las de
// marca. Ruta: <agencyId>/documentos/<plantillaId>/<header|footer>-<uuid>.<ext>
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET_IMAGENES = "marketing-images";

export function rutaDeImagen(agencyId: string, plantillaId: string, cual: "header" | "footer", ext: string) {
  return `${agencyId}/documentos/${plantillaId}/${cual}-${crypto.randomUUID()}.${ext}`;
}

export function urlPublica(path: string | null): string | null {
  if (!path) return null;
  return createAdminClient().storage.from(BUCKET_IMAGENES).getPublicUrl(path).data.publicUrl;
}
