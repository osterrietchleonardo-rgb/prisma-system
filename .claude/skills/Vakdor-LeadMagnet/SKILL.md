---
name: Vakdor-LeadMagnet
description: Crea lead magnets (imanes de leads) en PDF para Vakdor/PRISMA, como continuación lógica de una pieza de contenido. Se invoca cuando un post/pieza AMERITA un lead magnet (su CTA es descargar algo: scorecard, auditoría, calculadora, plantilla, checklist, swipe file, framework). Arma el contenido del magnet con la anatomía y los arquetipos correctos y delega la generación del PDF a la skill Vakdor-PDF. Triggerea con "lead magnet", "imán de leads", "descargable", "scorecard", "auditoría", "calculadora", "plantilla", "checklist", "PDF de captación".
---

# Vakdor-LeadMagnet — Creador de Imanes de Leads (PDF)

Companion del Sistema Maestro de Contenido. Esta skill **arma el contenido y la estructura** de un lead magnet y **delega la generación del PDF a `Vakdor-PDF`**. No reinventa el render: produce el Markdown on-brand y llama a Vakdor-PDF.

> ⛔ **REGLA DE ORO DE SALIDA (INQUEBRANTABLE):** Esta skill se invoca desde PRISMA-SYSTEM pero **NUNCA escribe archivos dentro de `PRISMA-SYSTEM`**. TODO el output (Markdown del magnet, config de Vakdor-PDF, PDF final, `copy.md`, registro en memoria) va con ruta absoluta dentro de `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK`. Se permite LEER de PRISMA-SYSTEM (logos, `FUNCIONAL-DIRECTOR-PRISMA.md`, la skill Vakdor-PDF), nunca escribir.

---

## 1. Principio central: el magnet es la continuación de la pieza

Un magnet no convierte por ser "bueno", sino por **calzar exacto con el dolor que la pieza acaba de abrir**. La pieza crea la herida; el magnet promete cerrarla *en ese punto preciso*. Cualquier desfasaje entre lo que prometió la pieza y lo que entrega el magnet destruye la conversión.

```
Magnet = f(Objetivo de la pieza, Ángulo de la pieza, Pilar temático)
```

> **Regla de oro de matching:** la pieza y su magnet comparten **exactamente el mismo dolor y el mismo calificador de ICP**. Si no comparten ambos, se regenera el match.

> **Contraintuitivo:** no buscamos máxima cantidad de descargas. Un magnet que 1.000 personas quieren es demasiado genérico. Optimizamos **densidad de ICP** (que 80 directores correctos lo necesiten con urgencia), no volumen. Es coherente con el modo **ultracualificación** de `vakdor-copywriter`.

---

## 2. Las 7 palancas (lo que lo vuelve irresistible de pedir)
1. **Especificidad extrema de la promesa.** Promesa angosta = más creíble y mejor filtro.
2. **Cierre de gap inmediato.** Promete cerrar AHORA el gap que la pieza abrió hace 10 segundos.
3. **Velocidad a valor.** "En 5 minutos", "sin instalar nada". El ICP valora su tiempo.
4. **Una sola cosa, resuelta entera.** Un problema chico resuelto del todo > diez por la mitad.
5. **"Pieza faltante", no "curso completo".** Prometés el slice exacto que le falta, no enseñarle todo.
6. **Asimetría de esfuerzo.** Valor altísimo a cambio de un mail.
7. **Identidad / calificador.** "Para directores de agencias con +30 asesores en Tokko." El no-ICP se autoexcluye.

---

## 3. El mecanismo que genera la conversación: aha + uh-oh
El magnet ganador es una **rebanada potente**: produce DOS efectos a la vez.
- **Aha** — un resultado real y tangible que prueba tu competencia y construye confianza.
- **Uh-oh** — la revelación de que la solución completa es más grande/profunda de lo que el ICP puede resolver solo (requiere sistema, tiempo, expertise). Ese gap es el puente a tu oferta.

Las dos fallas opuestas a evitar:
- Da **muy poco** → no genera confianza → no convierte.
- Resuelve **todo** → genera descargas pero ninguna conversación ("gracias, lo resolví solo").

El magnet diagnostica perfecto el problema, pero deja claro que *arreglarlo de forma sistemática* requiere implementación → eso genera la llamada calificada.

---

## 4. PDF como HERRAMIENTA, no como artículo
El ebook/PDF de texto genérico está muerto. El PDF que funciona **hace algo**: el ICP lo *usa*, no lo *lee*. Tipos que rinden:

| Tipo | Qué hace el ICP con él |
|---|---|
| Auditoría / Scorecard | Se autoevalúa con puntaje y descubre su problema |
| Calculadora-en-papel / Worksheet | Completa sus números y ve su pérdida concreta |
| Plantilla lista para usar | Copia y aplica mañana mismo |
| Checklist / Sistema en pasos | Sigue un proceso accionable |
| Framework de decisión / Matriz | Decide algo que tenía trabado |
| Swipe file | Roba ejemplos copiables |
| Breakdown de caso | Ve el cómo exacto, con números |

> El PDF es la puerta de entrada de bajo costo. (La versión interactiva / mini-app convierte aún mejor, pero queda fuera del alcance de esta skill, que produce el PDF.)

---

## 5. Anatomía interna del PDF (estructura fija, rellenable por tema)
El Markdown que generás para Vakdor-PDF debe seguir SIEMPRE este orden:

1. **Portada** — Promesa específica + para quién es (calificador) + marca. (En Vakdor-PDF: `kicker`, `title`, `subtitle`.)
2. **Quick win inmediato** — Valor en los primeros 60 segundos: el ICP piensa "ya valió la pena" antes de la página 2.
3. **El activo / la herramienta** — El scorecard, la calculadora, la plantilla. Acá vive el *aha*. Diseñado para USAR (tablas para completar, casillas, campos), no para leer.
4. **Prueba intercalada** — Un número real, un mini-caso, una captura, distribuidos (no en sección aparte) para sostener credibilidad.
5. **La revelación del gap (uh-oh)** — Una sección que muestra, sin culpa y con honestidad, que el resultado completo requiere implementación/sistema/tiempo que el ICP no tiene solo.
6. **CTA calificador** — NO "agendá una charla". Es **diagnóstico / aplicación**: invierte el poder ("te hago el diagnóstico completo → postulate acá").
7. **Diseño que señala nivel** — Lo da Vakdor-PDF (on-brand, premium). El diseño *es* parte de la prueba.

---

## 6. Matriz de matching: qué magnet para cada ángulo
Cada ángulo de `references/angles.md` (en vakdor-copywriter) tiene un magnet que es su continuación natural:

| Ángulo de la pieza | Arquetipo | Promesa tipo | CTA |
|---|---|---|---|
| A3 Costo de inacción | M2 Calculadora | "Cuánto estás dejando en [pérdida]" | Diagnóstico |
| A8 Diagnóstico | M1 Scorecard | "[N] puntos para saber dónde fuga tu agencia" | Diagnóstico |
| A11 Teardown | M1/Auditoría guiada | "Auditá tu propio flujo como lo haría yo" | Diagnóstico |
| A6 Transformación | M3 Breakdown de caso | "El desglose exacto: de [antes] a [después]" | Aplicación |
| A17 Lista / N maneras | M5 Checklist | "Las [N] [cosas] que toda agencia +30 debería tener" | Lead magnet → diagnóstico |
| A9 Comparación | M6 Matriz de decisión | "[A] vs [B] vs [C]: cómo decidir" | Aplicación |
| A12 Reframe | M8 Framework | "El verdadero [embudo/modelo] (no el que creés)" | Diagnóstico |
| A4 Secreto de insider | M7 Swipe file | "[N] [mensajes/ejemplos] que [resultado]" | DM calificador |
| A5 Mito vs realidad | M5 Checklist de verificación | "Verificá si tu equipo realmente [hace bien X]" | Diagnóstico |
| A1/A7/A16 Contraintuitivo/Predicción/Manifiesto | M8 Guía del nuevo modelo | "El nuevo sistema operativo de la agencia" | Lista de espera / aplicación |
| A19 Análisis de números | M2 Worksheet de datos | "Calculá los [N] indicadores que definen tu agencia" | Diagnóstico |
| A2 Enemigo común | M1 Auditoría enfocada | "Detectá al enemigo silencioso: [villano]" | Diagnóstico |

**Patrón:** ángulos de **dolor/diagnóstico** → **auditoría/calculadora** (mejor aha+uh-oh y mejor filtro). Ángulos **educativos/lista** → **plantillas/checklists**. Ángulos de **visión/POV** → **frameworks/manifiestos**.

---

## 7. Librería de los 8 arquetipos (plantillas rellenables)

| # | Arquetipo | Plantilla de promesa | Calificación |
|---|---|---|---|
| M1 | **Scorecard / Autoauditoría** | "[N] puntos para saber [problema] en tu [activo]" | ★★★★★ |
| M2 | **Calculadora de costo** | "Cuánto [perdés/ganarías] con [variable]" | ★★★★★ |
| M3 | **Breakdown de caso** | "Cómo [cliente] pasó de [antes] a [después]" | ★★★★☆ |
| M4 | **Plantilla lista** | "Plantilla de [proceso] para usar mañana" | ★★★☆☆ |
| M5 | **Checklist / Sistema** | "Las [N] [cosas] que toda agencia +30 debería tener" | ★★★☆☆ |
| M6 | **Matriz de decisión** | "[A] vs [B] vs [C]: cómo decidir" | ★★★★☆ |
| M7 | **Swipe file** | "[N] [ejemplos] que [resultado]" | ★★★☆☆ |
| M8 | **Framework / Manifiesto** | "El nuevo [modelo] de [categoría]" | ★★★★☆ |

**Magnet hero (default si hay duda):** **M1 — Scorecard de autoauditoría**. Filtra durísimo (solo el director con la base lo quiere), genera aha+uh-oh casi automáticamente (le mostrás el problema, pero taparlo requiere el sistema) y el segue a "te hago el diagnóstico completo" es natural.

---

## 8. Errores que matan la conversión (checklist anti-fallo)
- Magnet genérico pegado a toda pieza (rompe el message match).
- Resolver el problema entero (no genera conversación).
- Prometer demasiado o vago (no se cree).
- PDF que es un artículo, no una herramienta.
- CTA de ruego en vez de calificador.
- Sin calificador de ICP (atrae descargas basura).
- Fricción de consumo alta (largo, denso, lento).

---

## 9. Protocolo de ejecución

**PASO 0 — Brief del magnet (a partir de la pieza que lo origina).**
Conseguí (o confirmá con el usuario) los parámetros de la pieza: **objetivo, ángulo+sub-variante, pilar/eje y el calificador de ICP**. El magnet hereda el MISMO dolor y el MISMO calificador. Si la pieza no existe todavía, pedí esos datos antes de seguir.

**PASO 1 — Seleccionar arquetipo.**
Usá la matriz de matching (sección 6) según el ángulo de la pieza. Ante la duda, M1 (Scorecard). Definí: arquetipo, promesa específica, calificador, y el CTA (diagnóstico/aplicación, nunca ruego).

**PASO 2 — Escribir el contenido (Markdown), con la voz de Vakdor.**
Apoyate en **`vakdor-copywriter`** para la voz, el ICP y las reglas (es la skill base de contenido). Aplicá su **Regla de Fuente**: si el magnet menciona funciones concretas de PRISMA, leé primero `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\PRISMA-SYSTEM\docs\compartible\estandarizada\FUNCIONAL-DIRECTOR-PRISMA.md` y hablá con información real (no inventar features). Redactá el `.md` siguiendo la **anatomía fija** (sección 5) y armado como **herramienta** (tablas para completar, casillas `[ ]`, campos en blanco), no como artículo. Guardalo en la carpeta del activo en `Prisma - MK`.

**PASO 3 — Generar el PDF con Vakdor-PDF (delegación obligatoria).**
NO renderices el PDF por tu cuenta: escribí un config y llamá a `Vakdor-PDF`. Usá el branding de marketing de Vakdor (cobre `#C07C41` + logo Vakdor), no el branding doc por defecto.

> ⚙️ **Cómo ejecutarlo bien (aprendido en producción):** `generate.mjs` resuelve sus dependencias (`marked` + `playwright`) **desde su propia ubicación en PRISMA-SYSTEM**, donde NO podemos instalarlas (Regla de Oro). `Prisma - MK` ya tiene `playwright`, pero suele faltar `marked`. Por eso el flujo correcto es:
> 1. Asegurar `marked` en `Prisma - MK`: `npm install marked --no-save` (corriendo desde `Prisma - MK`).
> 2. **Copiar el runner a `Prisma - MK`** (es autocontenido y el logo va por ruta absoluta en el config), ejecutarlo desde ahí para que Node resuelva los módulos locales, y **borrarlo al final**:
> ```bash
> cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/Prisma - MK"
> cp "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM/.claude/skills/Vakdor-PDF/generate.mjs" "./.tmp-vakdor-pdf.mjs"
> node "./.tmp-vakdor-pdf.mjs" "<ruta-config-en-Prisma-MK>/leadmagnet.config.json"
> rm -f "./.tmp-vakdor-pdf.mjs"
> ```
> Ejecutar el script directamente desde la ruta de la skill en PRISMA-SYSTEM **falla** con "Faltan dependencias", aunque estén instaladas en `Prisma - MK`.
Config (rutas relativas resuelven respecto al config; outDir y file dentro de `Prisma - MK`):
```json
{
  "outDir": "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/Prisma - MK/Activos de Marketing/[fecha]/[nombre-magnet]",
  "brand": {
    "name": "Vakdor",
    "tagline": "PRISMA · Sistema Operativo Inmobiliario",
    "footerBrand": "Vakdor / PRISMA",
    "copper": "#C07C41",
    "logo": "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/Prisma - MK/assets/logo-vakdor.png"
  },
  "docs": [
    {
      "file": "./[nombre-magnet].md",
      "out": "[nombre-magnet].pdf",
      "kicker": "Lead Magnet",
      "title": "[promesa específica]",
      "subtitle": "Para directores de inmobiliarias con +30 asesores"
    }
  ]
}
```
Si faltan dependencias (`marked` / `playwright`), seguí los pasos de la skill Vakdor-PDF (instalar con `--no-save` y limpiar al final). `Prisma - MK` ya tiene `playwright` instalado.

**PASO 4 — QA visual.** Verificá portada y 1-2 páginas: marca aplicada (cobre Vakdor + logo Vakdor), que la herramienta sea usable (tablas con casillas) y que el gap/CTA estén. Corregí desbordes.

> ⚙️ **Cómo sacar las capturas (aprendido en producción):** leer el PDF directo suele fallar (el entorno no tiene `pdftoppm`) y screenshotear el visor de PDF de Chromium es poco fiable. El método que funciona: renderizar el Markdown a HTML con `marked` aplicando **el mismo CSS de `generate.mjs`** (con `copper:#C07C41` y el logo Vakdor en data-uri), cargarlo en Playwright a ancho A4 (~794px) y hacer `locator(".cover").screenshot()` + `locator("table").screenshot()`. Borrá las capturas de QA al terminar.

**PASO 5 — Registro y companion.**
- Creá un `copy.md` en la carpeta del magnet con: arquetipo, promesa, calificador, CTA, y cómo se entrega (el mensaje del primer comentario/DM que lo ofrece).
- Registrá el activo en `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\memoria.md` (fecha, nombre, pieza de origen, arquetipo, promesa, ángulo, objetivo).

---

## 10. Relación con las otras skills
- **`vakdor-copywriter`** — voz, ICP, Regla de Fuente y los parámetros de la pieza (objetivo/ángulo). Es la fuente del contenido y del matching.
- **`vakdor-carousel`** — arma la pieza visual (el post). Cuando su CTA es "lead magnet", esta skill produce el descargable.
- **`Vakdor-PDF`** — render del PDF on-brand. Esta skill SIEMPRE delega ahí la generación.
