import brand from "../brand.json";

// Fuente unica de la marca para el motor de video.
// Estos valores SALEN de brand.json (que la skill copia desde assets/brand.json).
export const BRAND = {
  background: brand.colors.background, // #0A0F1A azul oscuro Vakdor
  title: brand.colors.title, //          #FFFFFF blanco
  text: brand.colors.text, //            #B4BAC5 gris claro
  accent: brand.colors.accent, //        #C07C41 cobre Vakdor
};

export const FONT_FAMILY = "Inter";
