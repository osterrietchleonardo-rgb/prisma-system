// La selección que el asesor le manda a su cliente: varias propiedades en una sola página,
// con la marca de la inmobiliaria y su tarjeta de contacto.
//
// Pensada para el CELULAR —se abre desde WhatsApp— y que se acomode a la compu. No tiene
// versión para imprimir ni botón de PDF, a diferencia de la ficha del ACM: acá el que lee
// es el cliente en el teléfono, no alguien que archiva un documento.
//
// Es pública por el middleware: vive fuera de (public), de /asesor y de /director, igual
// que /ficha/[token] y /ficha-acm/[token].
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import GaleriaPropiedad from "./GaleriaPropiedad";

export const dynamic = "force-dynamic";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

// Paleta default "autoridad / lujo" si la agencia no configuró marca. Igual que /ficha.
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

async function getSeleccion(token: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("shared_selections").select("snapshot").eq("token", token).single();
  return data?.snapshot as any | undefined;
}

// Texto legible (blanco/negro) según luminancia del color de fondo. Mismo criterio que /ficha:
// la agencia carga el color que quiere y el texto tiene que leerse igual.
function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0c0c0c" : "#ffffff";
}

const fmtPrice = (price: number, currency: string) =>
  price > 0 ? `${currency === "ARS" ? "$" : "USD"} ${new Intl.NumberFormat("es-AR").format(price)}` : "Consultar";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getSeleccion(params.token);
  if (!snap) return { title: "Selección no disponible" };
  const cuantas = snap.properties?.length || 0;
  const title = `${cuantas} ${cuantas === 1 ? "propiedad seleccionada" : "propiedades seleccionadas"}`;
  return {
    title: `${title} | ${snap.agency?.name || "PRISMA"}`,
    description: `Una selección preparada por ${snap.agent?.full_name || "tu asesor"}.`,
    openGraph: {
      title,
      images: snap.properties?.[0]?.images?.[0] ? [snap.properties[0].images[0]] : [],
    },
  };
}

export default async function SeleccionPage({ params }: { params: { token: string } }) {
  const snap = await getSeleccion(params.token);
  if (!snap) notFound();

  // Contador de vistas (best-effort, no bloquea el render).
  try {
    const admin = createAdminClient();
    await admin.rpc("increment_shared_selection_view", { p_token: params.token });
  } catch { /* noop */ }

  const { properties = [], nota_final, agent, agency, brand } = snap;
  const colors: string[] = brand?.colors?.length ? brand.colors : DEFAULT_COLORS;
  const primary = colors[0] || DEFAULT_COLORS[0];
  const accent = colors[1] || colors[0] || DEFAULT_COLORS[1];
  const onPrimary = readableOn(primary);
  const onAccent = readableOn(accent);

  const phoneDigits = (agent?.phone || "").replace(/[^\d]/g, "");
  const waLink = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
        `Hola ${agent?.full_name || ""}, vi la selección que me mandaste y quería consultarte.`,
      )}`
    : null;
  const initials = (agent?.full_name || "A").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = agent?.role === "director" ? "Director/a" : "Asesor/a Inmobiliario/a";

  return (
    <div
      className={`${playfair.variable} ${inter.variable} min-h-screen`}
      style={{ background: "#fbfaf7", color: "#161616", fontFamily: "var(--font-body)" }}
    >
      {/* Barra superior: marca de la agencia */}
      <div className="w-full" style={{ backgroundColor: primary, color: onPrimary }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {brand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={agency?.name || ""} className="h-9 w-auto object-contain" />
            ) : null}
            <span className="truncate font-semibold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
              {agency?.name || "Inmobiliaria"}
            </span>
          </div>
          <span className="shrink-0 text-xs uppercase tracking-widest opacity-80">Selección</span>
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-5 md:py-12">
        <header className="flex flex-col gap-2">
          <h1
            className="text-3xl leading-tight md:text-4xl"
            style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
          >
            Seleccionamos esto para vos
          </h1>
          <p className="text-neutral-500">
            {properties.length} {properties.length === 1 ? "propiedad elegida" : "propiedades elegidas"} por{" "}
            {agent?.full_name || "tu asesor"}.
          </p>
        </header>

        {properties.map((p: any, i: number) => (
          <article key={i} className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <GaleriaPropiedad images={p.images || []} alt={p.title || "Propiedad"} />

            <div className="flex flex-col gap-4 p-5 md:p-6">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
                    style={{ backgroundColor: accent, color: onAccent }}
                  >
                    {p.status || "Propiedad"}
                  </span>
                  {p.city && <span className="text-sm text-neutral-500">{p.city}</span>}
                </div>
                <h2 className="text-2xl leading-snug" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
                  {p.title || "Propiedad"}
                </h2>
                {p.address && <p className="text-neutral-500">{p.address}</p>}
                <div className="mt-1 text-2xl font-bold" style={{ color: primary, fontFamily: "var(--font-display)" }}>
                  {fmtPrice(p.price, p.currency)}
                </div>
              </div>

              {/* La nota del asesor. Si no escribió nada, este bloque NO existe: ni el
                  título, ni el recuadro, ni el espacio. */}
              {p.nota ? (
                <div className="rounded-2xl border-l-4 bg-neutral-50 p-4" style={{ borderColor: accent }}>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                    Por qué te la mando
                  </p>
                  <p className="whitespace-pre-line leading-relaxed text-neutral-700">{p.nota}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: p.bedrooms === 1 ? "Dormitorio" : "Dormitorios", value: p.bedrooms || "—" },
                  { label: "Baños", value: p.bathrooms || "—" },
                  { label: "Superficie", value: p.total_area ? `${p.total_area} m²` : "—" },
                  { label: "Tipo", value: p.property_type || "—" },
                ].map((s, k) => (
                  <div key={k} className="rounded-xl border border-neutral-200 p-3 text-center">
                    <div className="text-lg font-bold" style={{ color: primary }}>{s.value}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-500">{s.label}</div>
                  </div>
                ))}
              </div>

              {p.description ? (
                <p className="whitespace-pre-line leading-relaxed text-neutral-700">{p.description}</p>
              ) : null}

              {p.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.amenities.slice(0, 20).map((a: string, k: number) => (
                    <span key={k} className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-600">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}

        {/* La nota final del grupo. Si no escribió nada, este bloque NO existe. */}
        {nota_final ? (
          <section className="rounded-3xl p-6" style={{ backgroundColor: primary, color: onPrimary }}>
            <p className="whitespace-pre-line text-lg leading-relaxed">{nota_final}</p>
          </section>
        ) : null}

        {/* Tarjeta del asesor */}
        <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-lg">
          <div className="h-2 w-full" style={{ backgroundColor: primary }} />
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-4">
              {agent?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.avatar_url} alt={agent.full_name} className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
                  style={{ backgroundColor: primary, color: onPrimary, fontFamily: "var(--font-display)" }}
                >
                  {initials}
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-400">{roleLabel}</div>
                <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  {agent?.full_name || "Tu asesor"}
                </div>
                <div className="text-sm text-neutral-500">{agency?.name || ""}</div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold shadow-md"
                  style={{ backgroundColor: "#25D366", color: "#fff" }}
                >
                  WhatsApp
                </a>
              )}
              {agent?.email && (
                <a
                  href={`mailto:${agent.email}?subject=${encodeURIComponent(
                    "Consulta por las propiedades que me mandaste",
                  )}`}
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  Email
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <div className="w-full border-t border-neutral-200 py-4 text-center text-xs text-neutral-400">
        Selección generada con PRISMA · {agency?.name || ""}
      </div>
    </div>
  );
}
