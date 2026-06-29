import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import FichaGallery from "./FichaGallery";
import ShareActions from "./ShareActions";

export const dynamic = "force-dynamic";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

// Paleta default "autoridad / lujo" si la agencia no configuró marca.
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

async function getShare(token: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("shared_properties").select("snapshot").eq("token", token).single();
  return data?.snapshot as any | undefined;
}

// Texto legible (blanco/negro) según luminancia del color de fondo.
function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0c0c0c" : "#ffffff";
}

const fmtPrice = (price: number, currency: string) =>
  price > 0 ? `${currency === "ARS" ? "$" : "USD"} ${new Intl.NumberFormat("es-AR").format(price)}` : "Consultar";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getShare(params.token);
  if (!snap) return { title: "Ficha no disponible" };
  const p = snap.property;
  const title = p.title || "Propiedad";
  const desc = `${p.property_type || "Propiedad"} en ${p.city || p.address || ""} · ${fmtPrice(p.price, p.currency)}`;
  return {
    title: `${title} | ${snap.agency?.name || "PRISMA"}`,
    description: desc,
    openGraph: { title, description: desc, images: p.images?.[0] ? [p.images[0]] : [] },
  };
}

export default async function FichaPage({ params }: { params: { token: string } }) {
  const snap = await getShare(params.token);
  if (!snap) notFound();

  // Contador de vistas (best-effort, no bloquea el render).
  try {
    const admin = createAdminClient();
    await admin.rpc("increment_shared_view", { p_token: params.token });
  } catch { /* noop */ }

  const { property: p, agent, agency, brand } = snap;
  const colors: string[] = brand?.colors?.length ? brand.colors : DEFAULT_COLORS;
  const primary = colors[0] || DEFAULT_COLORS[0];
  const accent = colors[1] || colors[0] || DEFAULT_COLORS[1];
  const onPrimary = readableOn(primary);
  const onAccent = readableOn(accent);

  const phoneDigits = (agent?.phone || "").replace(/[^\d]/g, "");
  const waText = encodeURIComponent(`Hola ${agent?.full_name || ""}, me interesa la propiedad "${p.title || ""}" que me compartiste.`);
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}?text=${waText}` : null;
  const initials = (agent?.full_name || "A").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = agent?.role === "director" ? "Director/a" : "Asesor/a Inmobiliario/a";

  const specs = [
    { label: p.bedrooms === 1 ? "Ambiente" : "Ambientes/Dorm.", value: p.bedrooms || "—" },
    { label: "Baños", value: p.bathrooms || "—" },
    { label: "Superficie", value: p.total_area ? `${p.total_area} m²` : "—" },
    { label: "Tipo", value: p.property_type || "—" },
    { label: "Operación", value: p.status || "—" },
  ];

  return (
    <div
      className={`${playfair.variable} ${inter.variable} min-h-screen`}
      style={{ background: "#fbfaf7", color: "#161616", fontFamily: "var(--font-body)" }}
    >
      {/* Barra superior: marca de la agencia */}
      <div className="w-full" style={{ backgroundColor: primary, color: onPrimary }}>
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {brand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={agency?.name || ""} className="h-9 w-auto object-contain" />
            ) : null}
            <span className="font-semibold tracking-wide truncate" style={{ fontFamily: "var(--font-display)" }}>
              {agency?.name || "Inmobiliaria"}
            </span>
          </div>
          <span className="text-xs uppercase tracking-widest opacity-80 shrink-0">Ficha de Propiedad</span>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 py-8 md:py-12 flex flex-col gap-10">
        {/* Encabezado */}
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              {p.status || "Propiedad"}
            </span>
            {p.city && <span className="text-sm text-neutral-500">{p.city}</span>}
          </div>
          <h1 className="text-3xl md:text-5xl leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
            {p.title || "Propiedad"}
          </h1>
          {p.address && <p className="text-neutral-500 text-lg">{p.address}</p>}
          <div className="mt-1 text-3xl md:text-4xl font-bold" style={{ color: primary, fontFamily: "var(--font-display)" }}>
            {fmtPrice(p.price, p.currency)}
          </div>
        </header>

        {/* Galería */}
        <FichaGallery images={p.images || []} title={p.title || "Propiedad"} accent={accent} />

        {/* Specs */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {specs.map((s, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-sm">
              <div className="text-xl font-bold" style={{ color: primary }}>{s.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mt-1">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Descripción */}
        {p.description && (
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>Descripción</h2>
            <p className="text-neutral-700 leading-relaxed whitespace-pre-line">{p.description}</p>
          </section>
        )}

        {/* Amenities */}
        {p.amenities?.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-2xl" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>Características</h2>
            <div className="flex flex-wrap gap-2">
              {p.amenities.slice(0, 30).map((a: string, i: number) => (
                <span key={i} className="text-sm px-3 py-1.5 rounded-full border border-neutral-200 bg-white text-neutral-700">
                  {a}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Tarjeta del asesor/director */}
        <section className="rounded-2xl overflow-hidden border border-neutral-200 shadow-lg bg-white">
          <div className="h-2 w-full" style={{ backgroundColor: primary }} />
          <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex items-center gap-4 flex-1">
              {agent?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.avatar_url} alt={agent.full_name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{ backgroundColor: primary, color: onPrimary, fontFamily: "var(--font-display)" }}
                >
                  {initials}
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-400">{roleLabel}</div>
                <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{agent?.full_name || "Tu asesor"}</div>
                <div className="text-sm text-neutral-500">{agency?.name || ""}</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold shadow-md"
                  style={{ backgroundColor: "#25D366", color: "#fff" }}
                >
                  WhatsApp
                </a>
              )}
              {agent?.email && (
                <a
                  href={`mailto:${agent.email}?subject=${encodeURIComponent(`Consulta: ${p.title || "propiedad"}`)}`}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  Email
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Acciones / pie (vista de cliente externo: NO se muestra el link a la publicación original) */}
        <footer className="flex items-center justify-center gap-4 pt-2 pb-10">
          <ShareActions title={p.title || "Propiedad"} accent={accent} onAccentText={onAccent} />
        </footer>
      </main>

      <div className="w-full border-t border-neutral-200 py-4 text-center text-xs text-neutral-400">
        Ficha generada con PRISMA · {agency?.name || ""}
      </div>
    </div>
  );
}
