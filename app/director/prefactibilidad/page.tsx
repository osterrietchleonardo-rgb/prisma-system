"use client";

// La misma pantalla que el asesor: el director ve todas las prefactibilidades de su agencia.
import { PrefactibilidadModule } from "@/app/asesor/prefactibilidad/components/prefactibilidad-module";

export default function PrefactibilidadDirectorPage() {
  return <PrefactibilidadModule esDirector />;
}
