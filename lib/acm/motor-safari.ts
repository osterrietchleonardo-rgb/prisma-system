// ACM · ¿El navegador imprime con el motor de Safari?
//
// Safari no respeta el "sin márgenes" que la ficha le pide a la impresora: suma los suyos, y la
// hoja A4 fija de la ficha no entra. Se cortaba a la derecha y cada hoja se partía en dos
// páginas (queja de Ramiro Villegas, 18-sep-2026: 9 hojas → PDF de 18 páginas).
//
// Entran en la cuenta Safari de Mac y TODOS los navegadores del iPhone/iPad (Chrome, Firefox y
// Edge de iOS usan el motor de Safari por regla de Apple). Chrome, Edge, Opera y Samsung en
// Android/Windows/Mac también dicen "AppleWebKit" en su identificación, pero traen "Chrome/":
// esos respetan los márgenes y quedan afuera.
export function esMotorSafari(userAgent: string): boolean {
  if (!/AppleWebKit\//.test(userAgent)) return false;
  return !/(Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(userAgent);
}
