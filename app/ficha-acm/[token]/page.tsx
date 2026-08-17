import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import PrintButton from "./PrintButton";
import AjusteAncho from "./AjusteAncho";
import type { AcmFichaSnapshot, FichaBrand, FichaComparable, FichaZona } from "@/lib/acm/ficha";
import { condensarDescripcion } from "@/lib/acm/descripcion";
import { metrosLegible } from "@/lib/acm/zona-formato";
import { COLOR_ZONA, COLOR_PROPIEDAD, categoriasEnElMapa } from "@/lib/acm/zona-mapa";

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

// Logo de marca recortado (sin el aire transparente/blanco alrededor) para que llene su caja
// sea cual sea la estructura del archivo que subió la agencia. Ver app/api/brand-logo/route.ts.
const brandLogo = (url: string | null | undefined): string =>
  url && /^https?:\/\//.test(url) ? `/api/brand-logo?url=${encodeURIComponent(url)}` : url || "";

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
          // Chip del MISMO color del banner superior: garantiza que el logo (venga claro u oscuro)
          // se vea igual que en la carátula, sin desaparecer contra el fondo crema del pie.
          <span className="sf-logo-chip" style={{ backgroundColor: primary }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogo(brand.logo_url)} alt="" className="sf-logo" />
          </span>
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

  // Nombre del PDF al "Descargar PDF": "Ficha ACM - Direccion - Mes Año" (el navegador toma el document.title).
  const periodoArchivo = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(snap.created_at));
  const periodoCap = periodoArchivo.charAt(0).toUpperCase() + periodoArchivo.slice(1);
  const dirArchivo = (subject.direccion || "").replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  const nombreArchivo = dirArchivo ? `Ficha ACM - ${dirArchivo} - ${periodoCap}` : `Ficha ACM - ${periodoCap}`;
  const opLabel = operacion === "alquiler" ? "Alquiler" : "Venta";
  // Bajada arriba del nombre en la tarjeta de contacto. Para asesores usa la clasificación secundaria
  // que pone el director en "Asesores" (Client Director / Client Support); sin clasificar → "Asesor/a".
  const roleLabel =
    agent?.role === "director"
      ? "Director/a"
      : agent?.clasificacion === "client_director"
      ? "Client Director"
      : agent?.clasificacion === "client_support"
      ? "Client Support"
      : "Asesor/a";
  const initials = (agent?.full_name || "A").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const phoneDigits = (agent?.phone || "").replace(/[^\d]/g, "");
  const waLink = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent("Hola, vi el análisis comparativo que me compartiste y quería consultarte.")}`
    : null;

  return (
    <div className={`${playfair.variable} ${inter.variable} acm-root`}>
      {/* El CSS va por dangerouslySetInnerHTML (no como hijo de texto): con `{CSS}` React escapa el
          `>` del selector `body > *` a `&gt;` en el HTML del servidor y NO en el del cliente, lo que
          rompía la hidratación de la hoja ("Text content does not match server-rendered HTML").
          Seguro: `CSS` es una constante de este mismo archivo, no entra nada del usuario. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <AjusteAncho />
      <PrintButton accent={accent} onAccent={onAccent} fileName={nombreArchivo} />

      {/* ══════════ PORTADA ══════════ */}
      <section className="sheet">
        <div className="cover-topbar" style={{ backgroundColor: primary, color: onPrimary }}>
          <div className="cover-brand">
            {brand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo(brand.logo_url)} alt={agencyName} className="cover-logo" />
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
              <span className="label">Fecha de análisis</span>
              <strong style={{ color: primary }}>{fecha}</strong>
              <span className="muted">{comparables.length} {comparables.length === 1 ? "comparable analizado" : "comparables analizados"}</span>
            </div>
          </div>

          {/* La descripción de la propiedad ya NO va acá: se mudó a la hoja del entorno, para
              que la portada quede limpia. En una ficha vieja (sin `zona`) tampoco se muestra;
              es el precio de tener una sola portada y no dos. */}
        </div>

        <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
      </section>

      {/* ══════════ LA PROPIEDAD Y SU ENTORNO ══════════ */}
      {/* Ausente en las fichas anteriores a ago-2026 y cuando el asesor destildó la hoja. */}
      {snap.zona && (
        <EntornoSheet
          zona={snap.zona} descripcion={subject.descripcion || ""} primary={primary} accent={accent}
          onPrimary={onPrimary} brand={brand} agencyName={agencyName}
        />
      )}

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
                <td><strong>Promedio de la muestra</strong></td>
                <td><strong>{comparison.promedio_sup ? `${comparison.promedio_sup} m²` : "—"}</strong></td>
                <td><strong>{comparison.promedio_precio ? fmtMoney(comparison.promedio_precio) : "—"}</strong></td>
                <td><strong>{fmtM2(comparison.promedio_m2)}</strong></td>
                <td className="muted-cell">cada uno vs. su zona</td>
                <td><strong>{comparison.desvio_prom_pct != null ? `${comparison.desvio_prom_pct > 0 ? "+" : ""}${comparison.desvio_prom_pct}%` : "—"}</strong></td>
                <td className="muted-cell">—</td>
              </tr>
            </tbody>
          </table>

          <PiramidePrecios primary={primary} accent={accent} desvio={comparison.desvio_prom_pct} />

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

// ── Pirámide de Precios ──────────────────────────────────────────────────────
// Gráfico conceptual: cuanto más se aleja el precio de publicación del valor competitivo, menos
// respuesta genera el aviso. Los umbrales (+20 / +15 / +10 / mercado) son los del método clásico.
// El escalón que corresponde al desvío promedio de la muestra queda resaltado.
const PIRAMIDE_NIVELES = [
  { color: "#e03131", umbral: 20, titulo: "Más de 20% sobre el valor competitivo", efecto: "No llama nadie." },
  { color: "#f76707", umbral: 15, titulo: "Entre 15% y 20% sobre el valor competitivo", efecto: "Llaman, pero no visitan." },
  { color: "#f2b705", umbral: 10, titulo: "Entre 10% y 15% sobre el valor competitivo", efecto: "Llaman y visitan, pero no hacen ofertas." },
  { color: "#2f9e44", umbral: -Infinity, titulo: "En valor de mercado", efecto: "Se logra un acuerdo y se vende." },
];

// Trapecios de cada escalón (viewBox 0 0 100 100, preserveAspectRatio none → escala con la fila).
const PIRAMIDE_FORMAS = [
  "50,4 68,100 32,100",
  "32,0 68,0 80,100 20,100",
  "20,0 80,0 90,100 10,100",
  "10,0 90,0 100,100 0,100",
];

function PiramidePrecios({ primary, accent, desvio }: { primary: string; accent: string; desvio: number | null }) {
  const activo = desvio == null ? -1 : PIRAMIDE_NIVELES.findIndex((n) => desvio > n.umbral);

  return (
    <div className="piramide">
      <div className="piramide-head">
        <h3 style={{ fontFamily: "var(--font-display)", color: primary }}>La Pirámide del Precio</h3>
        <p className="piramide-sub">
          Si al mes de publicado no hay consultas, el precio es incorrecto: cada escalón por encima del valor
          competitivo apaga una parte de la demanda.
        </p>
      </div>

      <div className="piramide-body">
        <div className="piramide-shape">
          {PIRAMIDE_FORMAS.map((puntos, i) => (
            <div key={i} className="piramide-row">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="piramide-svg">
                <polygon
                  points={puntos}
                  fill={PIRAMIDE_NIVELES[i].color}
                  opacity={activo === -1 || activo === i ? 1 : 0.28}
                />
              </svg>
            </div>
          ))}
        </div>

        <div className="piramide-legend">
          {PIRAMIDE_NIVELES.map((n, i) => (
            <div key={i} className={`piramide-item${activo === i ? " is-active" : ""}`}>
              <span className="piramide-dot" style={{ backgroundColor: n.color }} />
              <div>
                <div className="piramide-item-title">{n.titulo}</div>
                <div className="piramide-item-efecto" style={{ color: n.color }}>{n.efecto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {desvio != null && (
        <p className="piramide-foot">
          <span className="piramide-chip" style={{ backgroundColor: accent, color: readableOn(accent) }}>
            {desvio > 0 ? "+" : ""}{desvio}%
          </span>
          Desvío promedio de la muestra respecto del precio de cierre de su zona: ahí se ubica hoy este conjunto de
          propiedades dentro de la pirámide.
        </p>
      )}
    </div>
  );
}

// ── Hoja "La propiedad y su entorno" ─────────────────────────────────────────
// Dos columnas: a la izquierda lo que se LEE (la descripción de la propiedad y el relato del
// barrio), a la derecha lo que se CONSULTA (el mapa y los datos con sus distancias).
// La hoja NO nombra ninguna fuente de datos. El único crédito está dibujado adentro del PNG del
// mapa, y está ahí por licencia, no como cita.
const ICONO_ZONA: Record<string, string> = {
  subte: "🚇", espacio_verde: "🌳", escuela: "🎓", hospital: "🏥",
  farmacia: "💊", parada_colectivo: "🚌", comisaria: "🚓", ecobici: "🚲", ciclovia: "🚴",
};

function EntornoSheet({
  zona, descripcion, primary, accent, onPrimary, brand, agencyName,
}: {
  zona: FichaZona; descripcion: string; primary: string; accent: string; onPrimary: string;
  brand: FichaBrand; agencyName: string;
}) {
  // Contexto del banner. Fuera de CABA no hay comuna ni superficie: la línea sale vacía y el
  // banner queda solo con el nombre del barrio, sin ningún hueco que delate que falta algo.
  const contexto = [
    zona.comuna != null ? `Comuna ${zona.comuna}` : null,
    zona.area_km2 != null ? `${zona.area_km2.toLocaleString("es-AR")} km²` : null,
    zona.espacios_verdes_barrio ? `${zona.espacios_verdes_barrio} espacios verdes` : null,
  ].filter(Boolean).join("  ·  ");

  // Qué categorías quedaron efectivamente pintadas en el mapa. Se calcula con el MISMO helper que
  // usa /api/acm/mapa-zona para dibujarlas, así la referencia nunca nombra un punto que no está.
  const enElMapa = categoriasEnElMapa(zona);

  return (
    <section className="sheet">
      <div className="pulso" style={{ backgroundColor: primary, color: onPrimary }}>
        <div className="pulso-left">
          <span className="pulso-eyebrow" style={{ color: accent }}>LA PROPIEDAD Y SU ENTORNO</span>
          <div className="entorno-barrio">{zona.barrio}</div>
        </div>
        {contexto && (
          <div className="pulso-right">
            <span className="pulso-sub">{contexto}</span>
          </div>
        )}
      </div>

      <div className="sheet-body entorno-body">
        <div className="entorno-col">
          {descripcion && (
            <>
              <h3 className="entorno-h" style={{ color: accent }}>La propiedad</h3>
              <p className="entorno-texto entorno-texto-prop">{descripcion}</p>
            </>
          )}
          {zona.relato && (
            <>
              <h3 className="entorno-h" style={{ color: accent }}>El barrio</h3>
              {/* El relato viene en párrafos separados por línea en blanco. */}
              {zona.relato.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="entorno-texto">{p.trim()}</p>
              ))}
            </>
          )}
        </div>

        <div className="entorno-col">
          {zona.mapa_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zona.mapa_url} alt={`Mapa de ${zona.barrio}`} className="entorno-mapa" loading="eager" />
          )}
          {/* Referencias del mapa. Sin esto el cliente ve nueve puntos de colores y no sabe cuál
              es cuál — ni siquiera cuál es la propiedad. El punto de cada renglón usa EXACTAMENTE
              el color de su marcador, y solo se dibuja en los renglones que de verdad están en el
              mapa: los conteos ("8 farmacias a menos de cinco cuadras") no son un lugar y no
              tienen punto, y un hospital que quedó fuera del recorte tampoco. */}
          {zona.mapa_url && enElMapa.size > 0 && (
            <div className="entorno-ref">
              <span className="entorno-ref-punto" style={{ backgroundColor: COLOR_PROPIEDAD }} />
              <span>Esta propiedad. Cada punto de color señala el lugar de su renglón.</span>
            </div>
          )}
          <div className="entorno-pois">
            {zona.pois.map((p) => (
              <div key={p.categoria} className="entorno-poi">
                <span className="entorno-poi-ico">{ICONO_ZONA[p.categoria] || "📍"}</span>
                <div className="entorno-poi-txt">
                  <div className="entorno-poi-tit" style={{ color: primary }}>
                    {enElMapa.has(p.categoria) && (
                      <span className="entorno-poi-punto" style={{ backgroundColor: COLOR_ZONA[p.categoria] }} />
                    )}
                    {p.titulo}
                  </div>
                  {(p.detalle || p.metros != null) && (
                    <div className="entorno-poi-sub">
                      {[p.detalle, p.metros != null ? metrosLegible(p.metros) : null].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
    </section>
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
  // Descripción condensada acá (no en el snapshot) para que las fichas YA creadas —que guardaron
  // el texto crudo del aviso, con letra chica y contacto de la inmobiliaria publicante— también
  // salgan prolijas. Determinista: sin IA y sin costo.
  const descripcion = condensarDescripcion(c.descripcion || "");
  const specs = [
    { label: "Tipo", value: c.tipo || "—" },
    { label: "Superficie", value: c.m2 ? `${c.m2} m²` : "—" },
    { label: "Ambientes", value: c.ambientes ?? "—" },
    { label: "Dormitorios", value: c.dormitorios ?? "—" },
    { label: "Baños", value: c.banos ?? "—" },
    { label: "Valor / m²", value: fmtM2(c.precio_m2, c.moneda) },
  ];

  return (
    <section className="sheet">
      <div className="pulso" style={{ backgroundColor: primary, color: onPrimary }}>
        <div className="pulso-left">
          <span className="pulso-eyebrow" style={{ color: accent }}>REFERENCIA BARRIO · {c.pulso.barrio}</span>
          <div className="pulso-barrio-vals">
            {c.pulso.barrio_m2 != null && (
              <span className="pulso-val-item">
                <span className="pulso-val-lbl">Lista:</span> {fmtM2(c.pulso.barrio_m2)}
              </span>
            )}
            {c.pulso.barrio_cierre_est_m2 != null && (
              <span className="pulso-val-item highlight">
                <span className="pulso-val-lbl">Cierre est.:</span> {fmtM2(c.pulso.barrio_cierre_est_m2)}
              </span>
            )}
          </div>
        </div>
        <div className="pulso-right">
          <span className="pulso-label" style={{ color: accent }}>CIERRE REAL CABA · {c.pulso.ambiente_label}</span>
          <strong style={{ color: accent }}>{fmtM2(c.pulso.caba_amb_m2)}</strong>
          <span className="pulso-sub">Índice REMAX + UCEMA</span>
        </div>
      </div>

      <div className="sheet-body">
        <div className="comp-head">
          <div className="comp-head-l">
            <span className="comp-index" style={{ color: accent }}>Comparable {letra(index)}</span>
            <h2 className="comp-title" style={{ fontFamily: "var(--font-display)", color: primary }}>{c.titulo || c.direccion || "Comparable"}</h2>
            <p className="muted">{[c.direccion, c.zona].filter(Boolean).join(" · ")}{c.zona_score === 50 && <span className="comp-lindero">Barrio lindero</span>}</p>
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

        {descripcion && <p className="comp-desc">{descripcion}</p>}

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
.sf-logo-chip { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 8px; }
.sf-logo { height: 26px; max-height: 26px; max-width: 40mm; width: auto; object-fit: contain; object-position: left center; display: block; }
.sf-left strong { font-size: 13px; }
.sf-legal { text-align: center; font-size: 9px; color: #8a8a8a; line-height: 1.35; }
.sf-right { text-align: right; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #a2a2a2; }

/* Portada */
.cover-topbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 16px var(--pad); }
.cover-brand { display: flex; align-items: center; gap: 12px; font-weight: 600; letter-spacing: .02em; font-size: 17px; min-width: 0; }
/* Caja del logo: como el logo llega recortado (/api/brand-logo saca el aire alrededor), un alto
   generoso (72px) lo muestra grande sin importar la estructura del archivo. El tope de ancho (60mm)
   contiene los logos apaisados; object-fit:contain conserva la proporción. */
.cover-logo { height: 72px; max-height: 72px; max-width: 60mm; width: auto; object-fit: contain; object-position: left center; display: block; }
.cover-topbar-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .22em; opacity: .85; }
.cover-body { padding-top: 46px; }
.eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .28em; }
.cover-title { font-size: 40px; line-height: 1.08; font-weight: 700; margin: 14px 0 10px; }
.cover-sub { font-size: 16px; color: #5c5c5c; max-width: 78%; }
.cover-rule { width: 90px; height: 3px; margin: 30px 0; }
/* Los datos de la ficha van abajo de todo, no pegados al título: al mudar la descripción a la
   hoja del entorno quedaba un hueco blanco enorme en el medio de la portada. El margin-top auto
   dentro del flex de .sheet-body empuja el bloque al pie y convierte ese hueco en aire
   deliberado — la portada de un informe serio se lee así: título arriba, datos abajo.
   No se toca el alto de la hoja, así que la impresión sale igual. */
.cover-meta { display: grid; gap: 26px; margin-top: auto; padding-bottom: 8mm; }
.cover-meta-block { display: flex; flex-direction: column; gap: 3px; }
.cover-meta-block .label { font-size: 11px; text-transform: uppercase; letter-spacing: .2em; color: #8a8a8a; }
.cover-meta-block strong { font-size: 18px; }

/* Hoja del entorno — dos columnas: la izquierda se lee, la derecha se consulta.
   Los textos tienen clamp SI O SI: la hoja es un A4 exacto y acá no hay ninguna foto que
   absorba el sobrante (a diferencia de la hoja del comparable, donde .gallery hace de esponja).
   Sin clamp, una descripción de 700 caracteres más un relato de 900 empujan el pie fuera de la
   página impresa. Los dos bloques juntos entran en la columna con margen. */
/* La hoja es un A4 exacto y el texto no llega a llenarla: medido con un caso real, el contenido
   terminaba a 662 px de los 1.081 disponibles y quedaban 420 px de blanco al pie. El mapa es el
   elemento flexible que absorbe ese sobrante — el mismo papel que cumple .gallery en la hoja del
   comparable. Por eso el cuerpo ocupa todo el alto y la columna derecha es un flex. */
.entorno-body { display: grid; grid-template-columns: 1fr 82mm; gap: 9mm; align-items: stretch; padding-top: 10px; }
.entorno-col { min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.entorno-barrio { font-size: 19px; font-weight: 700; line-height: 1.15; margin-top: 2px; }
.entorno-h { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .2em; margin: 0 0 7px; }
.entorno-texto + .entorno-h { margin-top: 16px; }
/* LOS CLAMPS ESTAN CALCULADOS, NO ELEGIDOS A OJO.
   Renglón = 12,5px × 1,68 ≈ 21px. La columna tiene 981px libres hasta el pie.
   Peor caso posible: descripción en su tope de 700 caracteres (13 renglones = 273px) + relato
   en su tope de 900 repartido en 3 párrafos (3 × 8 renglones = 504px) + los dos títulos y sus
   márgenes (~90px) = 867px. Entra con 114px de sobra.
   Con 9 renglones para todo —lo primero que puse— una descripción real de 607 caracteres ya
   salía cortada a mitad de frase. */
.entorno-texto {
  flex: 0 0 auto;
  font-size: 12.5px; line-height: 1.68; color: #4a4a4a; margin: 0 0 9px;
  max-height: 168px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical;
}
/* La descripción es UN solo párrafo y es el texto que habla de lo que se está vendiendo:
   se lleva la parte grande del presupuesto de renglones. */
.entorno-texto-prop { max-height: 273px; -webkit-line-clamp: 13; }
/* Alto FIJO y proporción atada a la imagen que genera /api/acm/mapa-zona (768 × 1024 = 0,75).
   82 mm / 130 mm = 0,63 contra 0,75 de la imagen: object-fit cover recorta un poco arriba y
   abajo, que es donde no hay marcadores (todos caen alrededor del centro). Si se cambia uno de
   los dos, hay que revisar el otro.
   OJO: esto es una plantilla de texto de JavaScript — nada de comillas invertidas acá adentro,
   cortan la cadena y la pagina entera tira 500. */
.entorno-mapa {
  flex: 0 0 auto; width: 100%; height: 130mm; object-fit: cover; border-radius: 12px;
  background: #e8e6e1; display: block; margin-bottom: 13px;
}
/* Gap fijo y NO space-between: repartiendo el sobrante, los nueve renglones quedaban a 60 px
   uno del otro y el bloque se leia como poco contenido estirado para llenar la hoja. Juntos y
   con el mapa mas grande queda un bloque de datos denso, que es como se lee un informe. */
/* Referencias del mapa: una sola línea arriba de la lista. El punto de la propiedad se dibuja
   más grande que los de los renglones porque en el mapa también es más grande. */
.entorno-ref { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; font-size: 9px; color: #7b7b7b; line-height: 1.35; margin: 0 0 9px; }
.entorno-ref-punto { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 0 1px rgba(0,0,0,.18); }
.entorno-pois { flex: 0 0 auto; display: flex; flex-direction: column; gap: 9px; }
.entorno-poi { display: flex; align-items: flex-start; gap: 8px; }
.entorno-poi-ico { font-size: 14px; line-height: 1.25; flex-shrink: 0; width: 19px; }
.entorno-poi-txt { min-width: 0; }
.entorno-poi-tit { font-size: 11.5px; font-weight: 700; line-height: 1.3; }
/* El punto que ata el renglón con su marcador en el mapa. Va dentro del título para que arranque
   sobre el mismo renglón aunque el nombre del lugar ocupe dos líneas. */
.entorno-poi-punto { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: middle; position: relative; top: -1px; box-shadow: 0 0 0 1px rgba(0,0,0,.14); }
.entorno-poi-sub { font-size: 9.5px; color: #8a8a8a; line-height: 1.3; margin-top: 1px; }

/* Banner de pulso / consolidado (informativo, no llamativo) */
.pulso { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 10px var(--pad); gap: 16px; }
.pulso-left { display: flex; flex-direction: column; }
.pulso-eyebrow { font-size: 9.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.pulso-barrio-vals { display: flex; align-items: center; gap: 10px; margin-top: 3px; font-size: 11.5px; }
.pulso-val-item { opacity: .9; }
.pulso-val-item.highlight { font-weight: 700; opacity: 1; }
.pulso-val-lbl { opacity: .7; font-weight: 400; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.pulso-right { text-align: right; display: flex; flex-direction: column; }
.pulso-right strong { font-size: 15px; line-height: 1.15; }
.pulso-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; }
.pulso-sub { font-size: 9px; opacity: .72; margin-top: 2px; }

/* Encabezado del comparable */
.comp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.comp-head-l { min-width: 0; }
.comp-index { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .2em; }
.comp-title { font-size: 19px; font-weight: 600; margin: 2px 0 4px; line-height: 1.15; }
.comp-price { text-align: right; flex-shrink: 0; }
.comp-price-val { font-size: 18px; font-weight: 800; }
.comp-match { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.comp-lindero { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: #f5ead6; color: #8a6320; vertical-align: middle; }

/* Ficha técnica */
.specs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; margin: 11px 0; }
.spec { border: 1px solid #ece8df; border-radius: 10px; padding: 7px 4px; text-align: center; background: #fcfbf8; }
.spec-val { font-size: 13.5px; font-weight: 800; }
.spec-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #8a8a8a; margin-top: 3px; }

/* Galería — protagonista: la foto principal LLENA el alto disponible de la hoja (look profesional). */
/* Descripción del comparable: sutil y de alto ACOTADO (3 líneas, ~47px). La hoja es un A4 exacto
   y la galería es el único elemento flexible, así que este bloque le come alto a la foto y NUNCA
   desborda la hoja. El clamp es la red de seguridad para fichas viejas con el texto crudo largo. */
.comp-desc {
  flex: 0 0 auto; margin: 0 0 2px; font-size: 10.5px; line-height: 1.5; color: #6f6f6f;
  max-height: 47px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
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

/* Pirámide del precio */
.piramide { margin-bottom: 18px; }
.piramide-head h3 { font-size: 14px; font-weight: 600; margin: 0 0 3px; }
.piramide-sub { font-size: 11px; color: #7b7b7b; line-height: 1.45; margin: 0 0 10px; max-width: 92%; }
.piramide-body { display: grid; grid-template-columns: 88mm 1fr; align-items: stretch; gap: 14px; }
.piramide-shape { display: flex; flex-direction: column; gap: 3px; }
.piramide-row { flex: 1 1 0; min-height: 26px; }
.piramide-svg { width: 100%; height: 100%; display: block; }
.piramide-legend { display: flex; flex-direction: column; gap: 3px; }
.piramide-item { flex: 1 1 0; display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 8px; }
.piramide-item.is-active { background: #f7f4ee; box-shadow: inset 0 0 0 1px #e6e1d6; }
.piramide-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.piramide-item-title { font-size: 10.5px; color: #3d3d3d; line-height: 1.3; }
.piramide-item-efecto { font-size: 11.5px; font-weight: 700; line-height: 1.3; margin-top: 1px; }
.piramide-foot { display: flex; align-items: center; gap: 8px; margin-top: 9px; font-size: 10.5px; color: #7b7b7b; line-height: 1.45; }
.piramide-chip { flex-shrink: 0; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; }

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

/* ── CELULAR ──────────────────────────────────────────────────────────────────
   La hoja mide 794px fijos porque tiene que ser un A4 exacto al imprimir. En una pantalla más
   angosta que eso, se achica la hoja ENTERA con un scale: es el mismo documento, más chico.
   No se reordena ni se apila nada, así que no hay una segunda maqueta que mantener y el riesgo
   de romper algo es cero.

   TRES CANDADOS para no tocar lo que ya funciona:
   1. media screen  → la impresión y el PDF ni se enteran de que esto existe.
   2. max-width 840 → arriba de eso (escritorio, notebook, tablet apaisada) no aplica.
   3. el default 1  → si el JavaScript no corre, el factor es 1 y queda como estaba.

   El factor lo calcula AjusteAncho.tsx: CSS no puede dividir dos longitudes.
   transform-origin top left + el padding de 8px del contenedor la dejan centrada.
   El margen negativo existe porque un elemento escalado SIGUE ocupando su alto original en el
   layout: sin eso quedaría medio metro de vacío entre hoja y hoja.
   (Recordatorio: esto es una plantilla de JavaScript, nada de comillas invertidas acá.) */
@media screen and (max-width: 840px) {
  .acm-root { padding: 10px 8px 80px; }
  .sheet {
    transform: scale(var(--acm-k, 1));
    transform-origin: top left;
    margin: 0 0 calc(-297mm * (1 - var(--acm-k, 1)) + 14px);
    box-shadow: 0 4px 18px rgba(0,0,0,.14);
  }
}

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
