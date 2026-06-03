import { prismaIA } from "./lib/gemini";

async function test() {
  const prompt = `
    Eres un Director Comercial experto. Tu tarea es clasificar el desempeño MENSUAL de un asesor basándote en la eficiencia de su embudo.
    
    CRITERIOS DEL DIRECTOR (PROMPT):
    Eres un clasificador de rendimiento comercial inmobiliario. Tu única función es determinar la categoría de un asesor a partir de los datos del mes. La clasificación es determinista y reproducible: los mismos datos de entrada producen siempre el mismo resultado, sin interpretación subjetiva.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 1 — VARIABLES DE ENTRADA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para esta evaluación considerarás los siguientes datos:
  facturacion_usd  →  Monto en "Facturación total (Comisiones)"
  transacciones    →  Valor de "Transacciones (cierres)" + "Reservas generadas"
  captaciones      →  Valor de "Captaciones nuevas"
  cartera_activa   →  Valor de "Cartera activa total"
  tasaciones       →  Valor de "Tasaciones realizadas"
  consultas        →  Suma de "Consultas WhatsApp" + "Prospección Activa"
  rotacion_pct     →  Valor ya calculado en "Rotación de cartera"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 2 — ÁRBOL DE CLASIFICACIÓN BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Evaluá los pasos en orden estricto 1 → 4. En cuanto se cumple una categoría, asigná esa clasificación base y pasá DIRECTAMENTE a la SECCIÓN 3.

──────────────────────────────────────────────────
PASO 1 — ¿ÉLITE?
──────────────────────────────────────────────────
Asignar 'Elite' si se cumple AL MENOS UNA de las siguientes:
  [1A]  facturacion_usd ≥ 10000
  [1B]  transacciones ≥ 4
  [1C]  rotacion_pct ≥ 15  Y  captaciones ≥ 5  Y  transacciones ≥ 2
→ Si alguna es verdadera → clasificación base = 'Elite'. Ir a SECCIÓN 3.

──────────────────────────────────────────────────
PASO 2 — ¿SÓLIDO?
──────────────────────────────────────────────────
Asignar 'Sólido' si se cumplen TODAS las siguientes simultáneamente:
  [2A]  facturacion_usd ≥ 3000
  [2B]  transacciones ≥ 1
  [2C]  transacciones ≤ 3
→ Si [2A] Y [2B] Y [2C] son verdaderas → clasificación base = 'Sólido'. Ir a SECCIÓN 3.

──────────────────────────────────────────────────
PASO 3 — ¿EN DESARROLLO?
──────────────────────────────────────────────────
Asignar 'En Desarrollo' si se cumple AL MENOS UNA de las siguientes:
  [3A]  consultas ≥ 20  Y  (tasaciones ≥ 3 O captaciones ≥ 3)  Y  facturacion_usd < 3000
  [3B]  captaciones ≥ 4  Y  cartera_activa ≥ 5  Y  transacciones = 0
  [3C]  transacciones ≥ 1  Y  facturacion_usd < 3000
→ Si alguna es verdadera → clasificación base = 'En Desarrollo'. Ir a SECCIÓN 3.

──────────────────────────────────────────────────
PASO 4 — REQUIERE ATENCIÓN
──────────────────────────────────────────────────
Si ningún paso anterior produjo resultado:
→ clasificación base = 'Requiere Atención'. Ir a SECCIÓN 3.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 3 — MODIFICADOR DE ROTACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verificar si se cumplen AMBAS condiciones:
  (M1)  rotacion_pct ≥ 20
  (M2)  transacciones ≥ 1

Si M1 Y M2 son verdaderas, ascender la clasificación base exactamente UNA categoría:
  'Requiere Atención'  →  'En Desarrollo'
  'En Desarrollo'      →  'Sólido'
  'Sólido'             →  Sin cambio
  'Elite'              →  Sin cambio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 4 — FORMATO DE SALIDA (CRÍTICO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Por requerimientos técnicos del sistema, tu salida DEBE ser un único objeto JSON válido sin bloques de código markdown, con esta estricta estructura:

{
  "categoria": "[Clasificación final tras aplicar SECCIÓN 3]",
  "motivo": "Base: [categoria]. Cumple: [ej: 1B o 2A+2B]. Modificador: [Sí/No]. Rotación: [rotacion_pct]%"
}

    DATOS DEL ASESOR (Leito asesor):
    [Top of Funnel]
    - Consultas WhatsApp: 1
    - Prospección Activa: 0
    
    [Pre-Listing / Pre-Buying]
    - Tasaciones realizadas: 0
    - Compradores calificados: 0
    
    [Inventario]
    - Captaciones nuevas: 0
    - Cartera activa total: 0 propiedades
    
    [Cierres y Eficiencia]
    - Reservas generadas: 0
    - Transacciones (cierres): 0
    - Facturación total (Comisiones): $0.00 USD
    - Rotación de cartera: 0.0%

    REGLAS:
    1. Devuelve un JSON con "categoria" (nombre de la clase) y "motivo" (breve explicación).
    2. Si el Director definió su propio sistema de clases en el prompt de arriba, respetalo estrictamente.
    3. Responde ÚNICAMENTE el JSON.
  `;

  try {
    const result = await prismaIA.generateContent(prompt);
    const text = result.response.text();
    console.log("Raw LLM response:\n", text);
    
    const cleanJson = text.replace(/```json|```/g, "").trim();
    console.log("\nClean JSON:\n", cleanJson);
    
    const classification = JSON.parse(cleanJson);
    console.log("\nParsed successfully:", classification);
  } catch (err) {
    console.error("Error parsing JSON:", err);
  }
}

test();
