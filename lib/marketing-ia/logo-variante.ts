// Marketing IA · Cual de los dos logos de la agencia va en cada pieza.
//
// POR QUE EXISTE: una inmobiliaria no se presenta igual en un departamento de dos ambientes que
// en una casa de country. El 8-sep-2026 el director pidio poder cargar DOS logos —"estandar" y
// "lujo"— y decidir cual sale en cada cosa.
//
// COMO SE GUARDA, Y POR QUE ASI. En agencies.marketing_ai_config:
//
//   logo_url        el logo estandar. Es la clave que YA existia: la agencia que hoy tiene un
//                   logo cargado no pierde nada ni hay que migrar ninguna fila.
//   logo_url_lujo   el segundo logo. Vacio hasta que el director lo suba.
//   logo_destinos   { ficha_acm: "estandar" | "lujo", ficha_cliente: ... }
//
// El destino guarda UNA variante, no dos interruptores sueltos. Con dos booleanos por ficha se
// podria llegar a "la ficha del ACM sale con los dos logos" o "con ninguno", que no significan
// nada; asi ese estado invalido no se puede ni escribir. Sin dato guardado, estandar.
//
// LA REGLA QUE NO SE NEGOCIA: si se pide el logo de lujo y la agencia no lo cargo (o lo borro),
// sale el estandar. Ninguna pieza se queda sin logo por culpa de esta eleccion.

export type VarianteLogo = "estandar" | "lujo";

/** Las piezas cuyo logo elige el director una sola vez, no pieza por pieza. */
export type DestinoLogo = "ficha_acm" | "ficha_cliente";

/** Cualquier cosa que venga del navegador o del jsonb se reduce a una variante real. */
export function varianteValida(valor: unknown): VarianteLogo {
  return valor === "lujo" ? "lujo" : "estandar";
}

/** En que clave de marketing_ai_config vive cada logo. */
export function campoDeLogo(variante: VarianteLogo): "logo_url" | "logo_url_lujo" {
  return variante === "lujo" ? "logo_url_lujo" : "logo_url";
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

/** Que logos tiene cargados la agencia. La pantalla lo usa para saber si hay algo que elegir. */
export function logosCargados(config: unknown): { estandar: boolean; lujo: boolean } {
  const mk = (config ?? {}) as Record<string, unknown>;
  return { estandar: Boolean(texto(mk.logo_url)), lujo: Boolean(texto(mk.logo_url_lujo)) };
}

/**
 * La URL del logo de la variante pedida. Si esa ranura esta vacia, sale el otro logo.
 * Devuelve null solo si la agencia no cargo ninguno de los dos.
 *
 * La caida vale para los dos lados a proposito: una agencia que subio solo el de lujo tambien
 * tiene que ver su marca en las piezas, y quedarse sin logo es peor que salir con el otro.
 */
export function urlDelLogo(config: unknown, variante: unknown): string | null {
  const mk = (config ?? {}) as Record<string, unknown>;
  const estandar = texto(mk.logo_url);
  const lujo = texto(mk.logo_url_lujo);
  return varianteValida(variante) === "lujo" ? (lujo ?? estandar) : (estandar ?? lujo);
}

/** Con que variante decidio el director que sale una ficha. Sin dato, estandar. */
export function varianteDeDestino(config: unknown, destino: DestinoLogo): VarianteLogo {
  const destinos = ((config ?? {}) as Record<string, unknown>).logo_destinos;
  const elegida = (destinos ?? {}) as Record<string, unknown>;
  return varianteValida(elegida[destino]);
}

/** El logo de una ficha, ya resuelto: destino → variante → URL. */
export function logoParaDestino(config: unknown, destino: DestinoLogo): string | null {
  return urlDelLogo(config, varianteDeDestino(config, destino));
}
