import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import PrintButton from "./PrintButton";
import type { AcmFichaSnapshot, FichaBrand, FichaComparable } from "@/lib/acm/ficha";

export const dynamic = "force-dynamic";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

// Paleta default "autoridad / lujo" si la agencia no configuró marca.
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

async function getReport(token: string): Promise<AcmFichaSnapshot | undefined> {
  const admin = createAdminClient();
  const { data } = await admin.from("shared_acm_reports").select("snapshot").eq("token", token).single();
  return data?.snapshot as AcmFichaSnapshot | undefined;
}

function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0c0c0c" : "#ffffff";
}

// Sirve las fotos redimensionadas/comprimidas por el optimizador de Next (dominios ya whitelisteados
// en next.config: tokkobroker/roomix/supabase). Baja el peso del PDF de decenas de MB a pocos MB.
// w debe ser un tamaño permitido por Next (deviceSizes/imageSizes): usamos 1080 (hero) y 384 (thumb).
const opt = (url: string | null | undefined, w: number, q = 65): string =>
  url && /^https?:\/\//.test(url) ? `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}` : url || "";

const fmtMoney = (v: number | null, currency = "USD") =>
  v != null && v > 0 ? `${currency === "ARS" ? "$" : "USD"} ${new Intl.NumberFormat("es-AR").format(Math.round(v))}` : "Consultar";
const fmtM2 = (v: number | null, currency = "USD") =>
  v != null && v > 0 ? `${currency === "ARS" ? "$" : "USD"} ${new Intl.NumberFormat("es-AR").format(Math.round(v))}/m²` : "—";
const letra = (i: number) => String.fromCharCode(65 + i);

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getReport(params.token);
  if (!snap) return { title: "Ficha no disponible" };
  const n = snap.comparables.length;
  return {
    title: `Análisis Comparativo de Mercado | ${snap.agency?.name || "PRISMA"}`,
    description: `${n} ${n === 1 ? "comparable" : "comparables"} · ${snap.subject.barrio || snap.subject.direccion || ""}`,
    robots: { index: false, follow: false },
  };
}

// Pie de marca de cada hoja (logo + aviso legal + rótulo). Va DENTRO de cada hoja (in-flow),
// no fijo, para que salga idéntico en pantalla y en PDF, sin artefactos de impresión.
function SheetFooter({ brand, agencyName, primary }: { brand: FichaBrand; agencyName: string; primary: string }) {
  return (
    <footer className="sheet-footer">
      <div className="sf-left">
        {brand?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo_url} alt="" className="sf-logo" />
        ) : (
          <strong style={{ color: primary }}>{agencyName || "PRISMA"}</strong>
        )}
      </div>
      {brand?.legal_notice ? <div className="sf-legal">{brand.legal_notice}</div> : <div />}
      <div className="sf-right">Análisis Comparativo de Mercado</div>
    </footer>
  );
}

export default async function FichaAcmPage({ params }: { params: { token: string } }) {
  const snap = await getReport(params.token);
  if (!snap) notFound();

  try {
    const admin = createAdminClient();
    await admin.rpc("increment_shared_acm_view", { p_token: params.token });
  } catch { /* noop */ }

  const { subject, operacion, comparables, comparison, agent, agency, brand } = snap;
  const colors = brand?.colors?.length ? brand.colors : DEFAULT_COLORS;
  const primary = colors[0] || DEFAULT_COLORS[0];
  const accent = colors[1] || colors[0] || DEFAULT_COLORS[1];
  const onPrimary = readableOn(primary);
  const onAccent = readableOn(accent);
  const agencyName = agency?.name || "Inmobiliaria";

  const fecha = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(snap.created_at));
  const opLabel = operacion === "alquiler" ? "Alquiler" : "Venta";
  const roleLabel = agent?.role === "director" ? "Director/a" : "Asesor/a Inmobiliario/a";
  const initials = (agent?.full_name || "A").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const phoneDigits = (agent?.phone || "").replace(/[^\d]/g, "");
  const waLink = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent("Hola, vi el análisis comparativo que me compartiste y quería consultarte.")}`
    : null;

  return (
    <div className={`${playfair.variable} ${inter.variable} acm-root`}>
      <style>{CSS}</style>
      <PrintButton accent={accent} onAccent={onAccent} />

      {/* ══════════ PORTADA ══════════ */}
      <section className="sheet">
        <div className="cover-topbar" style={{ backgroundColor: primary, color: onPrimary }}>
          <div className="cover-brand">
            {brand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={agencyName} className="cover-logo" />
            ) : (
              <span style={{ fontFamily: "var(--font-display)" }}>{agencyName}</span>
            )}
          </div>
          <span className="cover-topbar-tag">Documento Confidencial</span>
        </div>

        <div className="sheet-body cover-body">
          <p className="eyebrow" style={{ color: accent }}>Market Valuation &amp; Positioning</p>
          <h1 className="cover-title" style={{ fontFamily: "var(--font-display)", color: primary }}>
            Análisis Comparativo de Mercado
          </h1>
          <p className="cover-sub">Estudio de valorización y posicionamiento sobre comparables reales de mercado.</p>
          <div className="cover-rule" style={{ backgroundColor: accent }} />

          <div className="cover-meta">
            <div className="cover-meta-block">
              <span className="label">Propiedad de referencia</span>
              <strong style={{ color: primary }}>{subject.direccion || "Propiedad analizada"}</strong>
              <span className="muted">{[subject.tipo, subject.barrio, subject.m2 ? `${subject.m2} m²` : null, opLabel].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="cover-meta-block">
              <span className="label">Preparado por</span>
              <strong style={{ color: primary }}>{agent?.full_name || "Su asesor"}</strong>
              <span className="muted">{roleLabel} · {agencyName}</span>
            </div>
            <div className="cover-meta-block">
              <span className="label">Fecha de análisis</span>
              <strong style={{ color: primary }}>{fecha}</strong>
              <span className="muted">{comparables.length} {comparables.length === 1 ? "comparable analizado" : "comparables analizados"}</span>
            </div>
          </div>
        </div>

        <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
      </section>

      {/* ══════════ UNA HOJA POR COMPARABLE ══════════ */}
      {comparables.map((c, i) => (
        <ComparableSheet
          key={c.id} c={c} index={i} primary={primary} accent={accent} onPrimary={onPrimary} onAccent={onAccent}
          brand={brand} agencyName={agencyName}
        />
      ))}

      {/* ══════════ PÁGINA FINAL: MATRIZ + CONCLUSIONES + CONTACTO ══════════ */}
      <section className="sheet">
        <div className="pulso" style={{ backgroundColor: primary, color: onPrimary }}>
          <div>
            <span className="pulso-eyebrow" style={{ color: accent }}>ANÁLISIS CONSOLIDADO</span>
            <div className="pulso-barrio">Matriz Comparativa de Mercado</div>
          </div>
          <div className="pulso-right">
            <span className="pulso-label">Valor promedio de la muestra</span>
            <strong style={{ color: accent }}>{fmtM2(comparison.promedio_m2)}</strong>
            <span className="pulso-sub">
              {comparison.desvio_prom_pct != null ? `${comparison.desvio_prom_pct > 0 ? "+" : ""}${comparison.desvio_prom_pct}% vs. cierre de zona` : "—"}
            </span>
          </div>
        </div>

        <div className="sheet-body">
          <table className="matrix">
            <thead>
              <tr style={{ color: primary }}>
                <th>Comparable</th><th>Sup.</th><th>Precio</th><th>$/m²</th><th>Cierre zona</th><th>Desvío</th><th>Posición</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((r, i) => (
                <tr key={r.id}>
                  <td><strong>{letra(i)}.</strong> {r.titulo}</td>
                  <td>{r.m2 ? `${r.m2} m²` : "—"}</td>
                  <td>{fmtMoney(r.precio, r.moneda)}</td>
                  <td>{fmtM2(r.precio_m2, r.moneda)}</td>
                  <td>{fmtM2(r.ref_m2)}<span className="ref-label">{r.ref_label}</span></td>
                  <td>{r.desvio_pct != null ? `${r.desvio_pct > 0 ? "+" : ""}${r.desvio_pct}%` : "—"}</td>
                  <td className="muted-cell">{r.calificacion}</td>
                </tr>
              ))}
              <tr className="matrix-avg">
                <td><strong>Promedio de la muestra</strong></td><td>—</td><td>—</td>
                <td><strong>{fmtM2(comparison.promedio_m2)}</strong></td>
                <td className="muted-cell">cada uno vs. su zona</td>
                <td><strong>{comparison.desvio_prom_pct != null ? `${comparison.desvio_prom_pct > 0 ? "+" : ""}${comparison.desvio_prom_pct}%` : "—"}</strong></td>
                <td className="muted-cell">—</td>
              </tr>
            </tbody>
          </table>

          {comparison.conclusiones.length > 0 && (
            <div className="conclusiones">
              <h3 style={{ fontFamily: "var(--font-display)", color: primary }}>Conclusiones del estudio</h3>
              <ul>
                {comparison.conclusiones.map((t, i) => (
                  <li key={i}><span className="bullet" style={{ backgroundColor: accent }} />{t}</li>
                ))}
              </ul>
              <p className="disclaimer">
                Valores de oferta relevados de publicaciones de mercado; los precios de cierre provienen de reportes inmobiliarios
                (por barrio y por segmento de ambientes en CABA) y son orientativos. Este documento no constituye una tasación oficial.
              </p>
            </div>
          )}

          <div className="contact-card">
            <div className="contact-strip" style={{ backgroundColor: primary }} />
            <div className="contact-inner">
              <div className="contact-id">
                {agent?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agent.avatar_url} alt={agent.full_name} className="contact-avatar" />
                ) : (
                  <div className="contact-avatar contact-avatar-initials" style={{ backgroundColor: primary, color: onPrimary, fontFamily: "var(--font-display)" }}>{initials}</div>
                )}
                <div>
                  <div className="contact-role">{roleLabel}</div>
                  <div className="contact-name" style={{ fontFamily: "var(--font-display)" }}>{agent?.full_name || "Su asesor"}</div>
                  <div className="muted">{agencyName}</div>
                </div>
              </div>
              <div className="contact-links">
                {agent?.phone && <span className="contact-line">📱 {agent.phone}</span>}
                {agent?.email && <span className="contact-line">✉️ {agent.email}</span>}
                <div className="contact-btns no-print">
                  {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className="contact-btn" style={{ backgroundColor: "#25D366", color: "#fff" }}>WhatsApp</a>}
                  {agent?.email && <a href={`mailto:${agent.email}`} className="contact-btn" style={{ backgroundColor: primary, color: onPrimary }}>Email</a>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
      </section>
    </div>
  );
}

// ── Hoja de un comparable ────────────────────────────────────────────────────
function ComparableSheet({
  c, index, primary, accent, onPrimary, onAccent, brand, agencyName,
}: {
  c: FichaComparable; index: number; primary: string; accent: string; onPrimary: string; onAccent: string; brand: FichaBrand; agencyName: string;
}) {
  const hero = c.images[0] || null;
  const rest = c.images.slice(1, 7);
  const specs = [
    { label: "Tipo", value: c.tipo || "—" },
    { label: "Superficie", value: c.m2 ? `${c.m2} m²` : "—" },
    { label: "Ambientes", value: c.ambientes ?? "—" },
    { label: "Dormitorios", value: c.dormitorios ?? "—" },
    { label: "Baños", value: c.banos ?? "—" },
    { label: "Valor / m²", value: fmtM2(c.precio_m2, c.moneda) },
  ];
  const barrioTipoLabel = c.pulso.barrio_m2_tipo === "cierre" ? "cierre" : "oferta";

  return (
    <section className="sheet">
      <div className="pulso" style={{ backgroundColor: primary, color: onPrimary }}>
        <div>
          <span className="pulso-eyebrow" style={{ color: accent }}>PULSO DE MERCADO · {c.pulso.barrio}</span>
          <div className="pulso-barrio">{c.pulso.ambiente_label}</div>
          {c.pulso.barrio_m2 != null && <span className="pulso-note">{c.pulso.barrio}: {fmtM2(c.pulso.barrio_m2)} ({barrioTipoLabel})</span>}
        </div>
        <div className="pulso-right">
          <span className="pulso-label">Cierre CABA · {c.pulso.ambiente_label}</span>
          <strong style={{ color: accent }}>{fmtM2(c.pulso.caba_amb_m2)}</strong>
          <span className="pulso-sub">Reporte inmobiliario</span>
        </div>
      </div>

      <div className="sheet-body">
        <div className="comp-head">
          <div className="comp-head-l">
            <span className="comp-index" style={{ color: accent }}>Comparable {letra(index)}</span>
            <h2 className="comp-title" style={{ fontFamily: "var(--font-display)", color: primary }}>{c.titulo || c.direccion || "Comparable"}</h2>
            <p className="muted">{[c.direccion, c.zona].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="comp-price">
            <div className="comp-price-val" style={{ color: primary }}>{fmtMoney(c.precio, c.moneda)}</div>
            {c.match_pct ? <div className="comp-match" style={{ backgroundColor: accent, color: onAccent }}>{c.match_pct}% comparable</div> : null}
          </div>
        </div>

        <div className="specs">
          {specs.map((s, i) => (
            <div key={i} className="spec">
              <div className="spec-val" style={{ color: primary }}>{s.value}</div>
              <div className="spec-label">{s.label}</div>
            </div>
          ))}
        </div>

        {hero ? (
          <div className="gallery">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={opt(hero, 1080, 68)} alt={c.titulo} className="gallery-hero" loading="eager" />
            {rest.length > 0 && (
              <div className="gallery-grid">
                {rest.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={opt(src, 384, 60)} alt={`${c.titulo} ${i + 2}`} className="gallery-thumb" loading="eager" />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="gallery-empty">Sin fotos disponibles para esta propiedad.</div>
        )}

        {c.amenities.length > 0 && (
          <div className="comp-amen">
            <h3 style={{ fontFamily: "var(--font-display)", color: primary }}>Características</h3>
            <div className="chips">
              {c.amenities.slice(0, 20).map((a, i) => <span key={i} className="chip">{a}</span>)}
            </div>
          </div>
        )}
      </div>

      <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
    </section>
  );
}

const CSS = `
.acm-root { --w: 210mm; --h: 297mm; --pad: 13mm; background: #d9d7d1; min-height: 100vh; padding: 24px 0 96px; font-family: var(--font-body); color: #1a1a1a; }
.acm-root *, .acm-root *::before, .acm-root *::after { box-sizing: border-box; }
.muted { color: #7b7b7b; font-size: 12px; }

/* Cada hoja = un A4 exacto (edge-to-edge). En pantalla se ve como una hoja; en impresión ES la hoja. */
.sheet {
  width: var(--w); min-height: var(--h); background: #ffffff; margin: 0 auto 22px;
  display: flex; flex-direction: column; overflow: hidden; position: relative;
  box-shadow: 0 8px 34px rgba(0,0,0,.16);
}
.sheet-body { flex: 1 1 auto; padding: 12px var(--pad) 8px; display: flex; flex-direction: column; min-height: 0; }

/* Pie de marca — mismo en cada hoja (in-flow, abajo de todo). */
.sheet-footer { flex: 0 0 auto; display: grid; grid-template-columns: 1fr 2.2fr 1fr; align-items: center; gap: 12px; padding: 8px var(--pad); border-top: 1px solid #ece8df; background: #faf9f6; }
.sf-logo { height: 20px; width: auto; object-fit: contain; }
.sf-left strong { font-size: 13px; }
.sf-legal { text-align: center; font-size: 9px; color: #8a8a8a; line-height: 1.35; }
.sf-right { text-align: right; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #a2a2a2; }

/* Portada */
.cover-topbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 16px var(--pad); }
.cover-brand { display: flex; align-items: center; gap: 12px; font-weight: 600; letter-spacing: .02em; font-size: 17px; }
.cover-logo { height: 40px; width: auto; object-fit: contain; }
.cover-topbar-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .22em; opacity: .85; }
.cover-body { padding-top: 46px; }
.eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .28em; }
.cover-title { font-size: 40px; line-height: 1.08; font-weight: 700; margin: 14px 0 10px; }
.cover-sub { font-size: 16px; color: #5c5c5c; max-width: 78%; }
.cover-rule { width: 90px; height: 3px; margin: 30px 0; }
.cover-meta { display: grid; gap: 26px; margin-top: 6px; }
.cover-meta-block { display: flex; flex-direction: column; gap: 3px; }
.cover-meta-block .label { font-size: 11px; text-transform: uppercase; letter-spacing: .2em; color: #8a8a8a; }
.cover-meta-block strong { font-size: 18px; }

/* Banner de pulso / consolidado (informativo, no llamativo) */
.pulso { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 10px var(--pad); gap: 16px; }
.pulso-eyebrow { font-size: 9.5px; font-weight: 800; letter-spacing: .16em; }
.pulso-barrio { font-size: 13px; font-weight: 600; margin-top: 2px; }
.pulso-note { display: block; font-size: 10px; opacity: .82; margin-top: 3px; }
.pulso-right { text-align: right; display: flex; flex-direction: column; }
.pulso-right strong { font-size: 16px; line-height: 1.15; }
.pulso-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: .12em; opacity: .82; }
.pulso-sub { font-size: 9.5px; opacity: .72; margin-top: 2px; }

/* Encabezado del comparable */
.comp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.comp-head-l { min-width: 0; }
.comp-index { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .2em; }
.comp-title { font-size: 19px; font-weight: 600; margin: 2px 0 4px; line-height: 1.15; }
.comp-price { text-align: right; flex-shrink: 0; }
.comp-price-val { font-size: 18px; font-weight: 800; }
.comp-match { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }

/* Ficha técnica */
.specs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; margin: 11px 0; }
.spec { border: 1px solid #ece8df; border-radius: 10px; padding: 7px 4px; text-align: center; background: #fcfbf8; }
.spec-val { font-size: 13.5px; font-weight: 800; }
.spec-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #8a8a8a; margin-top: 3px; }

/* Galería — protagonista: la foto principal LLENA el alto disponible de la hoja (look profesional). */
.gallery { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; margin: 6px 0 12px; }
.gallery-hero { flex: 1 1 auto; width: 100%; min-height: 200px; object-fit: cover; border-radius: 12px; background: #f0efe9; display: block; }
.gallery-grid { flex: 0 0 auto; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 8px; }
.gallery-thumb { width: 100%; height: 94px; object-fit: cover; border-radius: 8px; background: #f0efe9; display: block; }
.gallery-empty { flex: 1 1 auto; margin: 6px 0 12px; padding: 40px; border: 1px dashed #d9d4c8; border-radius: 12px; text-align: center; color: #9a9a9a; font-size: 13px; background: #fbfaf7; display: flex; align-items: center; justify-content: center; }

/* Características (chips) */
.comp-amen { flex: 0 0 auto; margin-top: 2px; }
.comp-amen h3, .conclusiones h3 { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 11px; padding: 4px 11px; border: 1px solid #e6e1d6; border-radius: 999px; color: #555; background: #fff; }

/* Matriz */
.matrix { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 18px; }
.matrix thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 8px 7px; border-bottom: 2px solid #ece8df; }
.matrix tbody td { padding: 8px 7px; border-bottom: 1px solid #f0ede5; vertical-align: top; }
.matrix .muted-cell { color: #7b7b7b; }
.matrix-avg td { border-top: 2px solid #ece8df; background: #f7f4ee; }
.ref-label { display: block; font-size: 9px; color: #9a9a9a; margin-top: 1px; }

/* Conclusiones */
.conclusiones ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.conclusiones li { position: relative; padding-left: 18px; font-size: 12.5px; line-height: 1.5; color: #3d3d3d; }
.conclusiones .bullet { position: absolute; left: 0; top: 6px; width: 7px; height: 7px; border-radius: 2px; }
.disclaimer { margin-top: 12px; font-size: 10px; color: #9a9a9a; line-height: 1.5; }

/* Contacto */
.contact-card { margin-top: auto; border: 1px solid #e6e1d6; border-radius: 16px; overflow: hidden; background: #fff; }
.contact-strip { height: 6px; width: 100%; }
.contact-inner { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 16px 20px; flex-wrap: wrap; }
.contact-id { display: flex; align-items: center; gap: 14px; }
.contact-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; font-size: 20px; font-weight: 700; }
.contact-avatar-initials { display: flex; align-items: center; justify-content: center; }
.contact-role { font-size: 10px; text-transform: uppercase; letter-spacing: .18em; color: #9a9a9a; }
.contact-name { font-size: 18px; font-weight: 600; }
.contact-links { display: flex; flex-direction: column; gap: 4px; text-align: right; }
.contact-line { font-size: 12.5px; color: #444; }
.contact-btns { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
.contact-btn { padding: 9px 18px; border-radius: 10px; font-weight: 600; font-size: 13px; text-decoration: none; }

@media print {
  /* Sin márgenes de página → la hoja va edge-to-edge y NO se ve el fondo del tema de la app. */
  @page { size: A4; margin: 0; }
  html, body { background: #ffffff !important; }
  /* Ocultar TODO lo que no sea la ficha a nivel body (barra de carga, toaster, y cualquier
     widget flotante inyectado por extensiones del navegador, que si no aparece en el PDF). */
  body > *:not(.acm-root) { display: none !important; }
  #nprogress, [data-sonner-toaster], next-route-announcer { display: none !important; }
  .acm-root { background: #ffffff !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
  .sheet {
    width: 210mm; height: 297mm; min-height: 297mm; margin: 0; box-shadow: none !important;
    page-break-after: always; break-after: page; overflow: hidden;
  }
  .sheet:last-of-type { page-break-after: auto; break-after: auto; }
}
`;
