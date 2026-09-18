// Ficha pública de una prefactibilidad: snapshot congelado, leído SOLO por token con el cliente
// admin (molde: app/ficha-acm/[token]/page.tsx). Sin sesión, sin índice de buscadores.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logoParaDestino } from "@/lib/marketing-ia/logo-variante";
import { planoSvg } from "@/lib/prefactibilidad/plano-svg";
import { describirPlanta, describirUnidad, m2, usd } from "@/lib/prefactibilidad/criollo";
import { requiereEstudio } from "@/lib/prefactibilidad/avisos";
import { LEYENDA } from "@/lib/prefactibilidad/criollo"; // vive en lib: un export de un módulo "use client" llega al servidor como referencia, no como string
import type { Prefactibilidad } from "@/lib/prefactibilidad/tipos";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

async function cargar(token: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("prefactibilidades").select("resultado, agency_id, user_id, creado_en").eq("token", token).maybeSingle();
  if (!data) return null;
  const [{ data: agencia }, { data: autor }] = await Promise.all([
    admin.from("agencies").select("name, marketing_ai_config").eq("id", data.agency_id).single(),
    admin.from("profiles").select("full_name, email, phone").eq("id", data.user_id).single(),
  ]);
  const mk = (agencia?.marketing_ai_config as any) || {};
  return { p: data.resultado as Prefactibilidad, creado: data.creado_en as string, agencia: agencia?.name || "Inmobiliaria", autor, brand: { colors: Array.isArray(mk.brand_colors) && mk.brand_colors.length ? mk.brand_colors : DEFAULT_COLORS, logo: logoParaDestino(mk, "ficha_acm"), legal: typeof mk.legal_notice === "string" ? mk.legal_notice : "" } };
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await cargar(params.token);
  return { title: d ? `Prefactibilidad · ${d.p.direccion}` : "Prefactibilidad", robots: { index: false, follow: false } };
}

export default async function FichaPrefactibilidad({ params }: { params: { token: string } }) {
  const d = await cargar(params.token);
  if (!d) notFound();
  try { await createAdminClient().rpc("increment_prefactibilidad_view", { p_token: params.token }); } catch { /* noop */ }
  const { p, brand, agencia, autor } = d;
  const e = p.edificabilidad;
  const primary = brand.colors[0], accent = brand.colors[1] || brand.colors[0];
  const fuerte = requiereEstudio(p.avisos);
  const svg = planoSvg({ lote: p.geomLote, huella: e.huella, manzana: p.geomManzana, colorLote: accent, colorHuella: accent, ancho: 700, alto: 420 });
  return (
    <div className="pref-root" style={{ ["--primary" as any]: primary, ["--accent" as any]: accent }}>
      <style>{CSS}</style>
      <article className="hoja">
        <header className="cabecera">
          {brand.logo ? <img src={`/api/brand-logo?url=${encodeURIComponent(brand.logo)}`} alt={agencia} className="logo" /> : <strong>{agencia}</strong>}
          <div><h1>Prefactibilidad</h1><p className="dir">{p.direccion}</p><p className="sub">Parcela {p.smp.toUpperCase()} · {p.cur?.barrio ?? ""}</p></div>
        </header>
        {fuerte && <p className="aviso"><strong>Requiere estudio profesional.</strong> {p.avisos.filter((a) => a.fuerte).map((a) => a.texto).join(" ")}</p>}
        <div className="plano" dangerouslySetInnerHTML={{ __html: svg }} />
        <section><h2>El lote</h2><dl>
          <div><dt>Superficie</dt><dd>{p.lote.superficieTotal != null ? m2(p.lote.superficieTotal) : "sin dato"}</dd></div>
          <div><dt>Frente × fondo</dt><dd>{p.lote.frente != null && p.lote.fondo != null ? `${p.lote.frente} × ${p.lote.fondo} m` : "sin dato"}</dd></div>
          <div><dt>Construido hoy</dt><dd>{p.lote.pisosSobreRasante ?? "?"} pisos{p.lote.propiedadHorizontal ? " · PH" : ""}</dd></div>
        </dl></section>
        <section><h2>Qué se puede construir</h2>
          {e.unidades.map((u) => <p key={u}>{describirUnidad(u)}</p>)}
          {e.modo === "oficial" ? (<><ul>{e.plantas.map((pl, i) => <li key={i}>{describirPlanta(pl)}</li>)}</ul>
            <dl><div><dt>m² construibles</dt><dd>{m2(e.m2Construibles)}</dd></div><div><dt>m² vendibles (80 %)</dt><dd>{m2(e.m2Vendibles)}</dd></div><div><dt>Altura máxima / plano límite</dt><dd>{e.alturaMaxima} m / {e.planoLimite} m</dd></div></dl></>)
            : (<dl><div><dt>m² construibles (rango)</dt><dd>{e.rango ? `${m2(e.rango.piso)} a ${m2(e.rango.techo)}` : "sin dato"}</dd></div></dl>)}
        </section>
        <section><h2>Cuánto vale la tierra</h2>
          {p.tierra ? (<><dl><div><dt>Valor del lote</dt><dd>{usd(p.tierra.valorLote.desde)} a {usd(p.tierra.valorLote.hasta)} (mediana {usd(p.tierra.valorLote.mediana)})</dd></div><div><dt>USD por m² de tierra</dt><dd>{p.tierra.usdM2Mediana.toLocaleString("es-AR")}</dd></div></dl>
            <p className="chico">{p.tierra.comparables.length} terrenos en venta a menos de 800 m, publicados hoy en la red.</p></>) : <p>Sin comparables suficientes en la zona.</p>}
        </section>
        <footer>
          <p className="contacto">{autor?.full_name}{autor?.phone ? ` · ${autor.phone}` : ""}{autor?.email ? ` · ${autor.email}` : ""} · {agencia}</p>
          <p className="leyenda">{LEYENDA}{p.fuentes.curPublicado ? ` Código Urbanístico por parcela publicado por el GCBA el ${new Date(p.fuentes.curPublicado).toLocaleDateString("es-AR")}.` : ""} {brand.legal}</p>
        </footer>
      </article>
      <PrintButton accent={accent} onAccent="#111111" fileName={`Prefactibilidad - ${p.direccion}`} />
    </div>
  );
}

const CSS = `
.pref-root { min-height: 100vh; background: #f4f4f5; padding: 24px 8px; font-family: ui-sans-serif, system-ui, sans-serif; color: #18181b; }
.hoja { width: 210mm; max-width: 100%; margin: 0 auto; background: #fff; padding: 18mm 16mm; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
.cabecera { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid var(--accent); padding-bottom: 12px; margin-bottom: 16px; }
.logo { height: 48px; width: auto; }
h1 { margin: 0; font-size: 22px; color: var(--primary); } .dir { margin: 2px 0 0; font-size: 18px; font-weight: 600; } .sub { margin: 0; font-size: 12px; color: #52525b; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--primary); margin: 18px 0 8px; }
dl { margin: 0; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #f4f4f5; font-size: 14px; } dt { color: #52525b; } dd { margin: 0; font-weight: 600; }
.plano { margin: 8px 0 4px; } .plano svg { width: 100%; height: auto; display: block; }
.aviso { background: #fffbeb; border: 1px solid #f59e0b; color: #78350f; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
.chico { font-size: 12px; color: #52525b; } .contacto { font-size: 13px; font-weight: 600; margin-top: 20px; } .leyenda { font-size: 11px; color: #52525b; line-height: 1.5; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #ffffff !important; }
  body > *:not(.pref-root) { display: none !important; }
  #nprogress, [data-sonner-toaster], next-route-announcer { display: none !important; }
  .pref-root { background: #ffffff !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
  .hoja { width: 210mm; min-height: 297mm; margin: 0; box-shadow: none !important; page-break-after: auto; }
}
`;
