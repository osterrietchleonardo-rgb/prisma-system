"use client"
import { useEffect } from "react"

// Guía financiera embebida en la página Finanzas (mismo contenido que el artifact).
// Explica cada término del módulo aplicado al negocio de Vakdor (SaaS por suscripción).

const COPPER = "#B87333"

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "16px 18px",
}

function Eyebrow({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: COPPER, letterSpacing: "0.12em" }}>{n}</span>
      <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>{children}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ color: "#fff", fontSize: 19, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>{children}</h3>
}

function Intro({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px", maxWidth: 640 }}>{children}</p>
}

function FacetList({ label, items }: { label: string; items: React.ReactNode[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: COPPER, fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((it, i) => (
          <li key={i} style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.5 }}>{it}</li>
        ))}
      </ul>
    </div>
  )
}

function Term({ name, tag, essence, paraQue, formula, mirar, analizar }: {
  name: string; tag?: string; essence: React.ReactNode; paraQue?: React.ReactNode;
  formula?: React.ReactNode; mirar?: React.ReactNode[]; analizar?: React.ReactNode[]
}) {
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        {name}
        {tag && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COPPER, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "2px 7px", marginLeft: 9, textTransform: "uppercase", fontWeight: 500 }}>{tag}</span>}
      </div>
      <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 4px" }}>{essence}</p>
      {formula && (
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, background: "rgba(184,115,51,0.09)", border: "1px dashed rgba(184,115,51,0.35)", borderRadius: 8, padding: "9px 12px", margin: "10px 0 4px", overflowX: "auto", whiteSpace: "nowrap", color: "rgba(255,255,255,0.85)" }}>{formula}</div>
      )}
      {paraQue && <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}><b style={{ color: COPPER }}>Para qué te sirve:</b> {paraQue}</p>}
      {mirar && <FacetList label="Qué mirar" items={mirar} />}
      {analizar && <FacetList label="Cómo analizarlo" items={analizar} />}
    </div>
  )
}

function Chip({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  const c = tone === "good" ? "#10b981" : tone === "warn" ? "#fbbf24" : "#ef4444"
  return <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 600, color: c, background: `${c}22`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{children}</span>
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(184,115,51,0.08)", border: "1px solid rgba(184,115,51,0.25)", borderLeft: `3px solid ${COPPER}`, borderRadius: 10, padding: "14px 16px", marginTop: 14 }}>
      <p style={{ margin: 0, color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.55 }}>{children}</p>
    </div>
  )
}

const plRows: [string, string, string][] = [
  ["Ventas", "Lo que te pagaron las inmobiliarias este mes (suscripciones).", "Que crezca y que no dependa de 1 o 2 clientes."],
  ["− Costo de ventas", "Lo que cuesta prestarles el servicio: APIs de IA, infraestructura, proxy.", "Que crezca más lento que las ventas."],
  ["= Utilidad bruta", "Lo que queda de cada peso de suscripción después de servir al cliente.", "En SaaS sano es alta: es tu músculo para pagar todo lo demás."],
  ["− Gastos operativos", "Lo que gastás para operar y crecer: sueldos, marketing, herramientas.", "Que el marketing/equipo traiga más ventas que su costo."],
  ["= Utilidad operativa (EBIT)", "Si el negocio, operando, gana plata.", "Que sea positiva y creciente."],
  ["− Gastos financieros", "Intereses y comisiones (banco, tarjetas).", "Que sean chicos."],
  ["− Impuestos", "Lo que se lleva el fisco.", "Preverlos: ganar en el papel ≠ ganar después de impuestos."],
  ["= Utilidad neta", "Lo que realmente te queda al final.", "El número final. Ojo: es contable, no siempre caja."],
]

export default function GuiaFinancieraModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, padding: "5vh 16px", overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#101420", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, width: "100%", maxWidth: 780, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}
      >
        {/* Header sticky */}
        <div style={{ position: "sticky", top: 0, background: "#101420", borderBottom: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px 16px 0 0", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: COPPER, fontWeight: 600, marginBottom: 3 }}>Guía financiera · Vakdor</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Cómo leer tus números</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 24px 30px" }}>
          <Intro>
            Qué significa cada número de esta página, para qué te sirve y cómo leerlo — aplicado a tu negocio: <b style={{ color: "rgba(255,255,255,0.85)" }}>cobrás una suscripción mensual a inmobiliarias</b> y tu costo principal es la tecnología (IA, infraestructura) para darles el servicio.
          </Intro>

          {/* 01 - Estado de Resultado */}
          <div style={{ marginTop: 22 }}>
            <Eyebrow n="01">La película del mes</Eyebrow>
            <SectionTitle>El Estado de Resultado</SectionTitle>
            <Intro>Es una <b style={{ color: "rgba(255,255,255,0.85)" }}>cascada</b>: arranca en lo que facturaste y va restando costos hasta lo que ganaste. Leelo de arriba hacia abajo.</Intro>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              {plRows.map(([r, q, m], i) => {
                const isTotal = r.startsWith("=")
                return (
                  <div key={r} style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 14, padding: "11px 16px", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none", background: isTotal ? "rgba(184,115,51,0.06)" : "transparent" }}>
                    <div style={{ color: isTotal ? COPPER : "#fff", fontWeight: 600, fontSize: 13 }}>{r}</div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, lineHeight: 1.45 }}>{q}</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}><b style={{ color: "rgba(255,255,255,0.55)" }}>Mirá:</b> {m}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <Callout><b style={{ color: COPPER }}>Los 3 que más importan:</b> Utilidad <b>bruta</b> (¿rinde el servicio?), <b>operativa</b> (¿funciona el negocio?), <b>neta</b> (¿qué me queda?). Si la bruta es buena pero la neta baja, el problema no es el producto: son los gastos de estructura.</Callout>
          </div>

          {/* 02 - Márgenes */}
          <div style={{ marginTop: 28 }}>
            <Eyebrow n="02">La salud en porcentaje</Eyebrow>
            <SectionTitle>Los márgenes</SectionTitle>
            <Intro>Los montos dicen <i>cuánto</i>; los márgenes dicen <b style={{ color: "rgba(255,255,255,0.85)" }}>qué tan sano</b>. Un margen es una utilidad ÷ ventas: sirve para comparar meses distintos y contra otros SaaS.</Intro>
            <Term name="Margen bruto" tag="Utilidad bruta ÷ Ventas" essence="De cada $100 de suscripción, cuántos quedan después de servir al cliente."
              mirar={[<>Referencia SaaS: <Chip tone="good">&gt;70% sano</Chip> <Chip tone="warn">50–70% ok</Chip> <Chip tone="bad">&lt;50% ojo</Chip></>, "Si baja, tu costo de IA/infra crece más rápido que tus precios."]}
              analizar={["Mirá la tendencia, no un mes suelto.", "Si cae: subir precio, optimizar uso de IA o cambiar de modelo/proveedor."]} />
            <Term name="Margen operativo" tag="Utilidad operativa ÷ Ventas" essence="Cuánto ganás por cada $100 después de todos los gastos de operar."
              mirar={["Que sea positivo y que mejore a medida que crecés (escala)."]}
              analizar={["Si vendés más pero el margen no sube, la estructura crece igual de rápido: revisá fijos."]} />
            <Term name="Margen neto" tag="Utilidad neta ÷ Ventas" essence="La foto final: de cada $100 facturados, cuántos quedan de verdad."
              mirar={["La distancia entre margen operativo y neto = cuánto se llevan impuestos y financieros."]}
              analizar={["Si el operativo es sano pero el neto flaco, atacá impuestos y costo de financiación."]} />
            <Term name="Margen de contribución" tag="Ventas − Costos variables" essence="Lo que aporta cada suscripción para cubrir tus gastos fijos. Es la base del punto de equilibrio."
              mirar={["Que cada cliente nuevo sume (precio > costo de servirlo)."]}
              analizar={["Cuanto más alto, más rápido cada venta extra se vuelve ganancia pura."]} />
            <Term name="Apalancamiento operativo" tag="Contribución ÷ Utilidad operativa" essence="Cuánto multiplica tu ganancia una suba de ventas. Alto = mucho costo fijo: arriesgado si bajan las ventas, muy rentable si suben."
              mirar={["Ej. 3× → si las ventas suben 10%, la ganancia sube ~30% (y a la baja igual)."]}
              analizar={["Te dice cuán expuesto estás. Con estructura pesada, cuidá que las ventas no caigan."]} />
          </div>

          {/* 03 - EBITDA */}
          <div style={{ marginTop: 28 }}>
            <Eyebrow n="03">Rentabilidad operativa de caja</Eyebrow>
            <SectionTitle>EBITDA</SectionTitle>
            <Intro>La ganancia de <b style={{ color: "rgba(255,255,255,0.85)" }}>operar</b>, antes de restar cosas que no son plata (depreciación/amortización) ni externas a la operación (intereses e impuestos). Es la vara con la que los inversores comparan negocios.</Intro>
            <Term name="EBITDA" essence="“¿Cuánta ganancia genera el negocio con solo operar, sin importar cómo se financia ni cómo lo maquilla la contabilidad?”"
              formula={<>EBITDA = <b style={{ color: COPPER }}>Utilidad operativa</b> + Depreciación y Amortización</>}
              paraQue="Comparar tu rentabilidad de igual a igual entre meses o contra otras empresas; es lo primero que pide un inversor o comprador. En Vakdor casi no hay activos físicos, así que tu EBITDA se parece mucho a la utilidad operativa (normal y sano en software)."
              mirar={[<>El <b>margen EBITDA</b> (EBITDA ÷ ventas) y su tendencia.</>, "Que crezca al crecer las ventas."]}
              analizar={["Buen EBITDA pero poca caja → mirá el FCL: algo se come la plata.", "No lo mires solo: un EBITDA lindo puede tapar deuda o inversión."]} />
            <Term name="Depreciación y Amortización" tag="D&A" essence="Repartir el costo de algo que compraste una vez (equipo, desarrollo, licencia grande) a lo largo de los meses que lo usás. No es plata que sale este mes; ya salió cuando lo compraste."
              analizar={[<>En tu caso suele ser baja. Cargala como gasto de categoría <b>“Depreciación/Amort.”</b> y el sistema la trata solo.</>]} />
          </div>

          {/* 04 - Punto de equilibrio */}
          <div style={{ marginTop: 28 }}>
            <Eyebrow n="04">El piso para no perder</Eyebrow>
            <SectionTitle>Punto de equilibrio</SectionTitle>
            <Intro><b style={{ color: "rgba(255,255,255,0.85)" }}>¿Cuántas inmobiliarias necesito que me paguen para no perder plata?</b> Por debajo, perdés; por encima, cada cliente nuevo es casi pura ganancia.</Intro>
            <Term name="Punto de equilibrio" essence="La cantidad de agencias que cubren exactamente tus costos: ni ganás ni perdés."
              formula={<>Punto de equilibrio = <b style={{ color: COPPER }}>Gastos fijos</b> ÷ (Precio − Costo variable por agencia)</>}
              paraQue="Ponerle un objetivo claro al equipo (“necesitamos N agencias”) y saber cuánto colchón tenés hoy sobre ese piso."
              mirar={["Cuántas agencias tenés por encima del piso (tu margen de seguridad).", "Que el número baje si subís precios o bajás fijos."]}
              analizar={["Usá el simulador: “¿y si subo el precio 15%?” → el piso baja.", "Si estás justo en el piso, sos frágil: vendé o recortá fijos."]} />
            <Callout><b style={{ color: COPPER }}>Ejemplo:</b> si cada agencia paga US$60, servirla cuesta US$8 (contribución US$52) y tus fijos son US$2.600 → necesitás <b>50 agencias</b> para empatar. La 51ª deja ~US$52 casi limpios.</Callout>
          </div>

          {/* 05 - FCL */}
          <div style={{ marginTop: 28 }}>
            <Eyebrow n="05">La plata de verdad</Eyebrow>
            <SectionTitle>Flujo de Caja Libre (FCL)</SectionTitle>
            <Intro>La utilidad neta es <i>contable</i>; el FCL es <b style={{ color: "rgba(255,255,255,0.85)" }}>la plata que de verdad te queda</b> después de impuestos, invertir y financiar la operación. Podés “ganar” en el papel y quedarte sin caja — el FCL no miente.</Intro>
            <Term name="Flujo de Caja Libre" essence="La caja libre que genera el negocio, disponible para reinvertir, guardar o retirar."
              formula={<>FCL = <b style={{ color: COPPER }}>EBITDA</b> − Impuestos − CAPEX − Δ Capital de trabajo</>}
              paraQue="Saber si el negocio se banca solo con su propia plata o necesita que le metas capital. Mide la salud financiera real."
              mirar={[<>Que sea <Chip tone="good">positivo</Chip> y parecido al EBITDA.</>, <><Chip tone="bad">FCL negativo</Chip> con EBITDA bueno = algo se come la caja.</>]}
              analizar={["Compará FCL vs EBITDA: si hay brecha grande, la causa está en impuestos, CAPEX o cobranzas.", "FCL sano y sostenido = crecés sin depender de deuda."]} />
            <Term name="CAPEX" tag="Inversiones" essence="Plata en cosas que duran (equipos, desarrollo grande, licencia importante). No es gasto del mes: es inversión, por eso no aparece en el Estado de Resultado, pero sí te saca caja."
              paraQue="En software suele ser bajo. El sistema lo excluye del EBIT y de las tortas, y lo resta solo en el FCL."
              analizar={["Un mes con CAPEX alto baja el FCL sin que el negocio esté peor: es inversión puntual."]} />
            <Term name="Capital de trabajo" tag="Δ calculado" essence="La plata atada en el día a día: lo que te deben menos lo que debés (más anticipos y prepagos). Su variación mes a mes te suma o resta caja."
              paraQue="Si las inmobiliarias te pagan por adelantado, juega a tu favor (cobrás antes de gastar). Si les das crédito, te ata caja."
              analizar={[<>Cargás los <b>saldos</b> de cada partida con “Cargar saldos de capital de trabajo”; el sistema calcula la variación contra el mes anterior. Cobrar más rápido = más caja libre sin vender un peso más.</>]} />
          </div>

          {/* 06 - Rutina */}
          <div style={{ marginTop: 28 }}>
            <Eyebrow n="06">Cómo analizarlo en la práctica</Eyebrow>
            <SectionTitle>Tu rutina mensual</SectionTitle>
            <Intro>No mires 20 números sueltos. Seguí este orden una vez por mes. Regla de oro: <b style={{ color: "rgba(255,255,255,0.85)" }}>siempre tendencia, nunca un mes aislado.</b></Intro>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                ["Empezá por utilidad neta y FCL.", "¿Gané y me quedó caja? Si neta es buena pero FCL flojo, algo se come la plata."],
                ["Mirá los márgenes, no los montos.", "Bruto (¿rinde el servicio?), operativo (¿funciona el negocio?) y su tendencia."],
                ["Margen bruto vs la referencia.", "Si cae debajo de ~70%, tu costo de IA/infra crece más rápido que tus precios."],
                ["Ubicá el punto de equilibrio.", "¿Cuántas agencias tengo por encima del piso? Simulá subas de precio."],
                ["EBITDA vs FCL.", "Si se parecen, sano. Si hay brecha: impuestos, CAPEX o capital de trabajo."],
                ["Leé el análisis de la IA.", "Apretá “Actualizar”: resume el mes y marca mejoras y riesgos con tus números. Segunda opinión, no verdad absoluta."],
              ].map(([t, d], i) => (
                <div key={i} style={{ ...card, display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: COPPER, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{i + 1}</div>
                  <div>
                    <div style={{ color: "#fff", fontSize: 13.5, fontWeight: 600 }}>{t}</div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <Callout><b style={{ color: COPPER }}>La idea de fondo:</b> el Estado de Resultado te dice si <i>ganás</i>. El Flujo de Caja Libre, si <i>tenés plata</i>. El Punto de Equilibrio, cuánto <i>margen de error</i> tenés. Los tres juntos, mes a mes, son tu tablero.</Callout>
          </div>
        </div>
      </div>
    </div>
  )
}
