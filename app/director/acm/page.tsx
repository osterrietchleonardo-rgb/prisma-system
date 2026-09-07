"use client";

// El ACM del director usa el mismo módulo que el asesor (misma lógica de comparables).
// La diferencia es la solapa Configuración: el material institucional que sale dentro de la
// ficha lo define el director, no el asesor.
import { AcmModule } from "@/app/asesor/acm/components/acm-module";

export default function ACMDirectorPage() {
  return <AcmModule esDirector />;
}
