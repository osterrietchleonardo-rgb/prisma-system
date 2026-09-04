// Marketing IA · Los formatos de placa, en un solo lugar.
//
// POR QUE EXISTE ESTE ARCHIVO: hasta el 3-sep-2026 el tamano de cada formato estaba escrito a
// mano en cuatro lugares que no se hablaban entre si (los dos selectores de la pantalla, el
// prompt de Gemini y el insert a la base). El resultado: la base guardaba 1080x1920 mientras el
// archivo real media 768x1376. La causa era que el tamano nunca se le PEDIA al modelo: se le
// escribia adentro del texto del prompt ("hacela de 1080x1920") y se confiaba en que obedeciera.
//
// Ahora el formato se pide por parametro (imageConfig.aspectRatio) y ademas la placa se lleva a
// la medida exacta con sharp antes de guardarla. Las dos cosas hacen falta: los "buckets" de
// Gemini son aproximados, no exactos. Medido el 3-sep-2026 pidiendole cada ratio:
//   9:16 -> 768x1376 (0.5581, y 9:16 es 0.5625)
//   4:5  -> 928x1152 (0.8056, y 4:5 es 0.8000)
//   1:1  -> 1024x1024 (1.0000, este si da exacto)
// Sin el recorte final, Instagram recibe una placa que no es del formato que dice ser y la
// recorta el solo, comiendose los bordes.
//
// OJO con los ids: son los valores que viajan a la columna `format` de generated_images, que
// tiene un CHECK en produccion. Agregar un formato nuevo PIDE MIGRACION.

import type { ImageFormat } from "@/types/marketing-ia";

export interface FormatoImagen {
  /** Lo que ve el asesor en el boton. */
  etiqueta: string;
  /** Lo que se le pide a Gemini en imageConfig.aspectRatio. */
  ratio: "9:16" | "4:5" | "1:1";
  /** La medida exacta a la que se recorta la placa antes de guardarla. */
  ancho: number;
  alto: number;
  /** Para el prompt: donde se publica esto. */
  destino: string;
  /** Ayuda debajo del boton. */
  ayuda: string;
}

// El orden es el que se ve en pantalla. El 4:5 va primero porque es el que mas pantalla ocupa en
// el feed de Instagram, que es donde la inmobiliaria se juega el scroll.
export const FORMATOS: Record<Exclude<ImageFormat, "historia">, FormatoImagen> = {
  post_vertical: {
    etiqueta: "Post vertical",
    ratio: "4:5",
    ancho: 1080,
    alto: 1350,
    destino: "una publicacion vertical en el feed de Instagram",
    ayuda: "El que mas ocupa el feed",
  },
  reels: {
    // Un solo formato vertical largo: Reel e Historia son EXACTAMENTE el mismo tamano, y tener
    // dos botones identicos solo hacia dudar al asesor sobre cual apretar.
    etiqueta: "Reel / Historia",
    ratio: "9:16",
    ancho: 1080,
    alto: 1920,
    destino: "un Reel o una Historia de Instagram (pantalla completa)",
    ayuda: "Pantalla completa",
  },
  post: {
    etiqueta: "Post cuadrado",
    ratio: "1:1",
    ancho: 1080,
    alto: 1080,
    destino: "una publicacion cuadrada en el feed de Instagram",
    ayuda: "El clasico",
  },
};

// `historia` ya no se ofrece, pero sigue existiendo en la base y en las placas ya generadas, asi
// que todo lo que LEE tiene que saber resolverlo. Se comporta como el vertical largo.
const LEGADO: Record<"historia", FormatoImagen> = {
  historia: { ...FORMATOS.reels, etiqueta: "Historia" },
};

/** Nunca devuelve undefined: una placa vieja con un formato retirado igual tiene que poder leerse. */
export function formatoDe(id: ImageFormat): FormatoImagen {
  return (FORMATOS as Record<string, FormatoImagen>)[id] ?? LEGADO.historia;
}

/** Los que se ofrecen hoy en la pantalla, en orden. */
export const FORMATOS_OFRECIDOS = Object.entries(FORMATOS).map(([id, f]) => ({
  id: id as ImageFormat,
  ...f,
}));
