// El documento que el asesor le mandó a su cliente. Público (el middleware solo protege
// /director y /asesor), igual que /ficha-acm/[token] y /seleccion/[token]. Se lee con
// service-role: shared_documentos no tiene políticas.
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import PrintButton from "@/app/ficha-acm/[token]/PrintButton";
import { RenderDocumento } from "@/components/documentos/RenderDocumento";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";
import AltoDeFranjas from "./AltoDeFranjas";
import "./documento.css";

export const dynamic = "force-dynamic";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0c0c0c" : "#ffffff";
}

async function getDocumento(token: string): Promise<SnapshotDocumento | undefined> {
  const { data } = await createAdminClient().from("shared_documentos").select("snapshot").eq("token", token).single();
  return data?.snapshot as SnapshotDocumento | undefined;
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getDocumento(params.token);
  if (!snap) return { title: "Documento no disponible" };
  return { title: `${snap.plantilla.nombre} | ${snap.agency?.name || "PRISMA"}` };
}

export default async function DocumentoPage({ params }: { params: { token: string } }) {
  const snap = await getDocumento(params.token);
  if (!snap) notFound();

  try {
    await createAdminClient().rpc("increment_shared_documento_view", { p_token: params.token });
  } catch {
    /* contar vistas es lo de menos: si falla, el documento se muestra igual */
  }

  const colors = snap.brand?.colors?.length ? snap.brand.colors : DEFAULT_COLORS;
  const accent = colors[1] || colors[0] || DEFAULT_COLORS[1];
  const nombreArchivo = `${snap.plantilla.nombre} - ${snap.agency?.name || "PRISMA"}`.replace(/[\\/:*?"<>|]+/g, " ");

  return (
    <div className={`${playfair.variable} ${inter.variable} documento-root`}>
      <AltoDeFranjas />
      <PrintButton accent={accent} onAccent={readableOn(accent)} fileName={nombreArchivo} />
      <RenderDocumento snap={snap} />
    </div>
  );
}
