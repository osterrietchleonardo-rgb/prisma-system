// Las reglas de la imagen de header/footer y la guía al director. Sin dependencias: este
// archivo lo importa la pantalla (navegador). La validación con sharp vive en ./imagen.ts,
// que es solo del servidor.
export const MAX_IMAGEN = 2 * 1024 * 1024;
export const ANCHO_MINIMO = 1600;

export const GUIA_IMAGEN =
  "Cómo tiene que ser la imagen: una franja apaisada de ancho completo, PNG o JPG, de al menos " +
  `${ANCHO_MINIMO} px de ancho y hasta 2 MB. Los logos, el teléfono, la web y la dirección de la ` +
  "inmobiliaria van adentro de la imagen, como vos los diseñes. Lo que NO tiene que tener: los datos " +
  "del asesor. Nombre, categoría, mail y celular los pone PRISMA por cada persona, con lo que escribas " +
  "en «Bloque del asesor». Si los dibujás en la imagen, salen fijos con los datos de uno solo.";
