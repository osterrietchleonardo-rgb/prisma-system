// La clasificación secundaria que el director le pone al asesor en "Asesores", legible para
// el cliente. Vivía inline en app/ficha-acm/[token]/page.tsx; ahora la usan la ficha del ACM
// y los documentos para clientes, y si cada una tuviera su copia se desincronizarían.
export function etiquetaDeCategoria(
  clasificacion: string | null | undefined,
  role: string | null | undefined,
): string {
  if (role === "director") return "Director/a";
  if (clasificacion === "client_director") return "Client Director";
  if (clasificacion === "client_support") return "Client Support";
  return "Asesor/a";
}
