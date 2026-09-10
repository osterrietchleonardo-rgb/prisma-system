// La copia congelada de un documento compartido. Lleva las variables YA reemplazadas: si
// mañana cambia el teléfono del asesor, el link que ya mandó no cambia.
import type { MarcaAgencia } from "@/lib/ficha/snapshot";
import type { Plantilla, DocTiptap, PosicionBloque } from "./plantilla";
import { valoresDeVariables, aplicarVariables } from "./variables";

export interface AgenteSnapshot {
  full_name: string;
  email: string;
  phone: string;
  clasificacion: string | null;
  role: string;
  avatar_url: string | null;
}

export interface SnapshotDocumento {
  plantilla: {
    id: string;
    nombre: string;
    version: number;
    cuerpo: DocTiptap;
    header_url: string | null;
    footer_url: string | null;
    bloque_asesor: { texto: DocTiptap; posicion: PosicionBloque; solape: number };
  };
  agent: AgenteSnapshot;
  agency: { id: string; name: string };
  brand: MarcaAgencia;
  created_at: string;
}

export function armarSnapshot(args: {
  plantilla: Plantilla;
  header_url: string | null;
  footer_url: string | null;
  agent: AgenteSnapshot;
  agency: { id: string; name: string };
  brand: MarcaAgencia;
}): SnapshotDocumento {
  const { plantilla, agent, agency } = args;
  const valores = valoresDeVariables({ ...agent, agencia: agency.name });
  return {
    plantilla: {
      id: plantilla.id,
      nombre: plantilla.nombre,
      version: plantilla.version,
      cuerpo: aplicarVariables(plantilla.cuerpo, valores),
      header_url: args.header_url,
      footer_url: args.footer_url,
      bloque_asesor: {
        texto: aplicarVariables(plantilla.bloque_asesor.texto, valores),
        posicion: plantilla.bloque_asesor.posicion,
        solape: plantilla.bloque_asesor.solape ?? 0,
      },
    },
    agent,
    agency,
    brand: args.brand,
    created_at: new Date().toISOString(),
  };
}
