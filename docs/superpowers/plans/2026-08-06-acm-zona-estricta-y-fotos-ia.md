# ACM · Zona estricta + fotos analizadas por IA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el ACM deje de traer comparables de barrios linderos salvo que el asesor lo pida, y que pueda subir hasta 4 fotos para que una IA con visión describa la propiedad y esa descripción afine la búsqueda de comparables.

**Architecture:** Dos parámetros nuevos en las dos funciones SQL de matching (`p_zona_min`, `p_peso_semantica`), ambos con default que preserva el comportamiento actual, más un endpoint nuevo que manda las fotos a Gemini y devuelve un párrafo editable. La descripción viaja dentro del jsonb `sujeto`, así que no hace falta tocar el esquema de `acm_searches`.

**Tech Stack:** Next.js App Router · Supabase (Postgres + pgvector) · Gemini 3.5-flash (visión + embeddings) · vitest · Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-06-acm-zona-estricta-y-fotos-ia-design.md`

## Global Constraints

- **Los defaults preservan producción.** `p_zona_min` default `50` y `p_peso_semantica` default `10` = comportamiento de hoy. La app es la que cambia el valor.
- **Las fotos NO se persisten.** Ni en Supabase Storage, ni en disco, ni en la base. Van en el request y se descartan.
- **El análisis se hace una sola vez.** No existe botón "volver a analizar". Un fallo de red/API no cuenta como análisis: ahí sí se puede reintentar.
- **El ACM nunca se bloquea por la IA.** Si Gemini falla, se muestra el error y "Buscar comparables" sigue funcionando.
- **Tope duro de la descripción: 700 caracteres**, recortados en límite de palabra. El prompt pide 400-600.
- **Una hoja por propiedad en la ficha.** Toda descripción que se renderice lleva clamp de CSS además del tope de caracteres.
- **No hay base local:** el `npm run dev` local pega contra la Supabase de producción. Por eso la migración del Task 1 se aplica antes de poder probar nada, y por eso sus defaults tienen que preservar el comportamiento.
- **Idioma:** todo el texto de UI y los comentarios de código en español rioplatense, como el resto del módulo.
- **No commitear archivos ajenos.** El árbol tiene cambios sueltos de la skill `vakdor-video`; usar siempre `git add <ruta exacta>`, nunca `git add -A`.

---

### Task 1: Migración SQL — `p_zona_min` y `p_peso_semantica`

Los dos parámetros van en **una sola migración** porque los dos cambian la firma de las mismas dos funciones: hacerlo en dos migraciones obligaría a dropear y recrear 600 líneas de SQL dos veces.

**Files:**
- Create: `supabase/migrations/20260806120000_acm_zona_min_y_peso_semantica.sql`
- Reference: `supabase/migrations/20260803180000_acm_zona_niveles_y_superficie.sql` (definición actual)

**Interfaces:**
- Produces: `acm_match_properties(..., p_zona_min smallint DEFAULT 50, p_peso_semantica smallint DEFAULT 10, p_limit integer DEFAULT 50)` y `acm_match_roomix(...)` con los mismos dos parámetros nuevos, ambos ubicados **antes de `p_limit`**. `RETURNS TABLE` no cambia.

- [ ] **Step 1: Crear la migración partiendo de la definición actual**

Copiar íntegro el contenido de `20260803180000_acm_zona_niveles_y_superficie.sql` **desde la línea del primer `drop function`** hasta el final (o sea: los dos `drop` y los dos `CREATE OR REPLACE FUNCTION`). **No** copiar la tabla `acm_barrio_relacion`, ni `acm_refrescar_barrios_relacion()`, ni el `SELECT` final: ya existen y no se tocan.

Encabezar el archivo nuevo con:

```sql
-- ACM v6: zona estricta por defecto + peso semántico configurable.
--
-- 1) p_zona_min → mínimo zona_score que se admite. 100 = solo mismo barrio,
--    70 = mismo barrio + sub-barrios (Belgrano R, Palermo Soho), 50 = además
--    limítrofes (Belgrano → Núñez). Default 50 = comportamiento de hoy; la app
--    manda 70 salvo que el asesor tilde "Incluir barrios linderos".
--    Motivo: auditados los 36 ACM de Central, 70 de 618 comparables de Belgrano
--    venían de Núñez/Saavedra/Colegiales. El valor casi no se distorsiona
--    (mediana US$3.790/m² vs US$3.714/m², -2%) pero el cliente ve otro barrio
--    en su tasación y descarta el informe entero.
--
-- 2) p_peso_semantica → peso de la similitud descriptiva, hasta ahora fijo en 10.
--    Sube a 20 cuando el asesor cargó fotos y la IA describió la propiedad: ahí
--    la comparación de texto deja de ser redundante con las dimensiones duras
--    (tipo, m², ambientes ya se puntúan aparte) y pasa a aportar señal real.
--
-- Los dos defaults dejan producción idéntica hasta que la app mande otros valores.
```

- [ ] **Step 2: Agregar los dos parámetros a las dos firmas**

En **ambas** funciones, insertar justo antes de `p_limit integer DEFAULT 50`:

```sql
  p_zona_min smallint DEFAULT 50,
  p_peso_semantica smallint DEFAULT 10,
```

- [ ] **Step 3: Filtrar el mapa de barrios por `p_zona_min`**

En **ambas** funciones, en el CTE `zonas`. Antes:

```sql
  with zonas as (
    select v_key as k, 100 as score where v_usar_zonas
    union all
    select r.relacionado, r.zona_score::int from public.acm_barrio_relacion r
    where v_usar_zonas and r.barrio = v_key
  ),
```

Después:

```sql
  with zonas as (
    -- El barrio propio (100) nunca se filtra: siempre entra.
    select v_key as k, 100 as score where v_usar_zonas
    union all
    select r.relacionado, r.zona_score::int from public.acm_barrio_relacion r
    where v_usar_zonas and r.barrio = v_key and r.zona_score >= p_zona_min
  ),
```

- [ ] **Step 4: Hacer configurable el peso semántico**

En **ambas** funciones, dentro del CTE `scored`. Antes:

```sql
      (case when v_emb is not null then 10 else 0 end) as w_sem,
```

Después:

```sql
      (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem,
```

- [ ] **Step 5: Corregir los `drop function` a la firma vigente**

Los `drop` copiados apuntan a la firma vieja. Reemplazarlos por estos dos, que son la firma que hay hoy en producción (verificada contra `pg_proc`):

```sql
drop function if exists public.acm_match_properties(uuid, text, text, text[], numeric, integer, integer, integer, integer, text[], text[], uuid, boolean, text, boolean, text, boolean, boolean, integer);
drop function if exists public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], boolean, text, boolean, text, boolean, boolean, boolean, boolean, integer);
```

- [ ] **Step 6: Aplicar la migración a la base**

```bash
node scratch/apply-sql.mjs supabase/migrations/20260806120000_acm_zona_min_y_peso_semantica.sql
```

Esperado: `HTTP 201`. **Gotcha conocido del entorno:** el script tira un assert de libuv al cerrar en Windows (exit 127) pero imprime el body antes — verificar por el body impreso, no por el exit code.

- [ ] **Step 7: Verificar que la firma nueva quedó aplicada**

`apply-sql.mjs` lee el SQL con `readFileSync`, así que **no acepta stdin ni heredoc** (en Windows
falla). Toda verificación va a un archivo temporal y se le pasa la ruta:

```bash
cat > scratch/_check-firma.sql <<'SQL'
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('acm_match_properties','acm_match_roomix');
SQL
node scratch/apply-sql.mjs scratch/_check-firma.sql
```

Esperado: las dos filas incluyen `p_zona_min smallint, p_peso_semantica smallint` antes de `p_limit`.
Los archivos `scratch/_*.sql` son temporales de verificación: **no se commitean** (`scratch/` ya
está fuera del árbol versionado para este tipo de archivos — confirmar con `git status` antes del commit).

- [ ] **Step 8: Verificar con datos reales que el filtro funciona**

Belgrano es el caso reportado. Con `p_zona_min => 70` no puede aparecer ningún comparable de Núñez ni Saavedra; con `50` sí.

Misma restricción que el Step 7: archivo temporal + ruta, nunca heredoc a `apply-sql.mjs`.

**Dos gotchas verificados de esta consulta:**
1. En SQL crudo hay que escribir `p_zona_min => 70::smallint`. Sin el cast, Postgres tira
   `function does not exist`: `int4 → int2` es un cast de categoría *assignment*, no *implicit*.
   La app no sufre esto (PostgREST castea el JSON al tipo declarado), solo las verificaciones a mano.
2. `p_limit => 100` **no muestra la diferencia**: el ranking por `match_pct` llena los primeros 100
   con matches del mismo barrio antes de llegar a los de zona 50. Hay que pedir `p_limit => 2000`
   para ver la población completa.

```bash
cat > scratch/_check-zona.sql <<'SQL'
-- Cuenta de barrios devueltos con el gate estricto (esperado: 0 filas de Nuñez/Saavedra)
select r.neighborhood, count(*)
from acm_match_roomix(
  p_operation => 'venta',
  p_type_patterns => array['%apartment%','%accommodation%','%condo%'],
  p_m2 => 80, p_rooms => 3, p_dormitorios => 2, p_bathrooms => 2,
  p_barrio => 'Belgrano', p_zona_niveles => true, p_m2_cubierta => true,
  p_dedup => true, p_zona_min => 70::smallint, p_limit => 2000
) m
join roomix_properties r on r.id = m.id
group by 1 order by 2 desc;
SQL
node scratch/apply-sql.mjs scratch/_check-zona.sql
```

Repetir el mismo bloque cambiando a `p_zona_min => 50` y confirmar que ahí **sí** aparecen Núñez y/o Saavedra. Si con 70 aparece alguno, el filtro del Step 3 quedó mal.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260806120000_acm_zona_min_y_peso_semantica.sql
git commit -m "feat(acm): p_zona_min y p_peso_semantica en las funciones de matching"
```

---

### Task 2: Zona estricta punta a punta

**Files:**
- Modify: `app/api/acm/comparables/route.ts` (bloque de las dos RPC, ~línea 91-134)
- Modify: `app/asesor/acm/components/acm-module.tsx:49` (estado) y `:75` (body) y `:167` (props)
- Modify: `app/asesor/acm/components/subject-input.tsx` (props ~línea 38-50, casilla ~línea 245-261)

**Interfaces:**
- Consumes: `p_zona_min` del Task 1.
- Produces: el body de `POST /api/acm/comparables` acepta `incluir_linderos?: boolean`. **Ausente = estricto.** El prop `incluirLinderos: boolean` + `onIncluirLinderosChange: (v: boolean) => void` en `SubjectInputProps`.

- [ ] **Step 1: Pasar el parámetro desde el endpoint**

En `app/api/acm/comparables/route.ts`, junto a donde se calcula `considerarPh` (~línea 59):

```ts
    // Zona: por defecto ESTRICTO (mismo barrio + sub-barrios). Los barrios limítrofes
    // (zona_score 50) solo entran si el asesor los pidió explícitamente. Si el campo no
    // viene en el body, se comporta estricto: es el arreglo, no un default heredado.
    const zonaMin = body.incluir_linderos === true ? 50 : 70;
```

Y agregar `p_zona_min: zonaMin,` a **las dos** llamadas RPC, junto a `p_zona_niveles: true`.

- [ ] **Step 2: Estado y envío en el módulo**

En `acm-module.tsx`, junto al estado de `considerarPh` (línea 49):

```tsx
  // Barrios linderos: apagado por defecto. Un comparable de Núñez en un ACM de Belgrano
  // es técnicamente defendible pero le rompe la confianza al cliente, así que se pide.
  const [incluirLinderos, setIncluirLinderos] = useState(false);
```

En el body del fetch (línea 75), agregar `incluir_linderos: incluirLinderos`.

En el render de `<SubjectInput>` (línea ~167), agregar:

```tsx
              incluirLinderos={incluirLinderos}
              onIncluirLinderosChange={setIncluirLinderos}
```

- [ ] **Step 3: La casilla**

En `subject-input.tsx`, sumar a `SubjectInputProps` (después de `onConsiderarPhChange`):

```ts
  incluirLinderos: boolean;
  onIncluirLinderosChange: (v: boolean) => void;
```

Agregarlos al destructuring de la función. Y renderizar la casilla **justo después** del bloque de "Considerar PH" (después del `)}` de la línea ~261). A diferencia de la de PH, esta se muestra siempre:

```tsx
      {/* Barrios linderos: apagado por defecto. Con el gate estricto entran el mismo barrio
          y sus sub-barrios (Belgrano R, Palermo Soho); los limítrofes (Núñez, Saavedra)
          solo si el asesor los pide. */}
      <label className="flex items-start gap-3 p-4 rounded-2xl border border-accent/10 bg-card/20 cursor-pointer">
        <Checkbox
          checked={incluirLinderos}
          onCheckedChange={(v) => onIncluirLinderosChange(v === true)}
          className="mt-0.5"
        />
        <span className="text-sm">
          <span className="font-bold">Incluir barrios linderos</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Por defecto se comparan solo propiedades del mismo barrio. Tildá si necesitás
            ampliar a los barrios vecinos; los que entren van marcados como “lindero”.
          </span>
        </span>
      </label>
```

- [ ] **Step 4: Chip "lindero" en la lista de resultados**

En `comparables-result.tsx`, dentro del componente de la tarjeta, antes del `return`:

```tsx
  // El ítem "zona" del checklist trae el nivel: 100 mismo barrio · 70 sub-barrio · 50 limítrofe.
  const esLindero = c.checklist.some((i) => i.dimension === "zona" && i.score === 50);
```

Y en la línea del barrio (actual línea 76), reemplazar:

```tsx
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {c.zona || c.direccion || "—"}
                {esLindero && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 text-[10px] font-bold uppercase tracking-wide">
                    lindero
                  </span>
                )}
              </p>
```

- [ ] **Step 5: Corregir el comentario desactualizado**

En `comparables-result.tsx:124`, reemplazar:

```tsx
                {/* Las dimensiones con peso 0 son filtros duros (tipo, operación, zona/barrio). */}
```

por:

```tsx
                {/* Peso 0 = filtro duro (tipo y operación). La zona dejó de serlo el 3-ago-2026:
                    puntúa 100/70/50 según mismo barrio, sub-barrio o lindero. */}
```

- [ ] **Step 6: Probar en el navegador**

Levantar con `npm run dev`, entrar a `/asesor/acm` con la cuenta de Central y hacer un ACM de **Belgrano, departamento, venta, 2 dormitorios**:

1. Con la casilla **apagada** (default): ningún comparable puede decir Núñez, Saavedra ni Colegiales. Sí pueden aparecer Belgrano R / Belgrano C.
2. Con la casilla **prendida**: aparecen los linderos, cada uno con el chip ámbar "lindero".
3. Abrir el checklist de un lindero: "Zona / barrio" muestra `Belgrano vs Núñez` y `50%`.

- [ ] **Step 7: Commit**

```bash
git add app/api/acm/comparables/route.ts app/asesor/acm/components/acm-module.tsx app/asesor/acm/components/subject-input.tsx app/asesor/acm/components/comparables-result.tsx
git commit -m "feat(acm): zona estricta por defecto + casilla de barrios linderos con chip"
```

---

### Task 3: Chip "lindero" en la ficha del cliente

**Files:**
- Modify: `app/api/acm/ficha/route.ts` (armado del snapshot de comparables)
- Modify: `app/ficha-acm/[token]/page.tsx` (`ComparableSheet` + CSS)
- Modify: `lib/acm/ficha.ts` (tipo del comparable del snapshot)

**Interfaces:**
- Produces: cada comparable del snapshot lleva `zona_score?: number | null`.

- [ ] **Step 1: Sumar el campo al tipo del snapshot**

En `lib/acm/ficha.ts`, agregar al tipo del comparable de la ficha:

```ts
  /** 100 mismo barrio · 70 sub-barrio · 50 lindero. Ausente en fichas anteriores a ago-2026. */
  zona_score?: number | null;
```

- [ ] **Step 2: Llenarlo al armar el snapshot**

En `app/api/acm/ficha/route.ts`, donde se arma cada comparable del snapshot, tomar el nivel del checklist del comparable que llegó en el body:

```ts
      zona_score: (c.checklist || []).find((i: any) => i.dimension === "zona")?.score ?? null,
```

- [ ] **Step 3: Renderizar el chip**

En `app/ficha-acm/[token]/page.tsx`, dentro de `ComparableSheet`, donde se muestra la ubicación del comparable, agregar:

```tsx
        {c.zona_score === 50 && <span className="comp-lindero">Barrio lindero</span>}
```

Y en el bloque `CSS`, junto a los estilos del encabezado del comparable:

```css
.comp-lindero { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: #f5ead6; color: #8a6320; vertical-align: middle; }
```

- [ ] **Step 4: Verificar**

Crear una ficha desde un ACM hecho **con la casilla prendida**, abrir el link público y confirmar que el comparable de Núñez muestra "Barrio lindero" y que la hoja **sigue siendo una sola** (imprimir con Ctrl+P y contar páginas: portada + 1 por comparable + matriz).

Además abrir una ficha **vieja** (de `shared_acm_reports`, anterior a hoy) y confirmar que no rompe: sin `zona_score` no se pinta nada.

- [ ] **Step 5: Commit**

```bash
git add lib/acm/ficha.ts app/api/acm/ficha/route.ts "app/ficha-acm/[token]/page.tsx"
git commit -m "feat(acm): chip de barrio lindero en la ficha del cliente"
```

---

### Task 4: `lib/acm/descripcion-ia.ts` — sanear y recortar

Red de seguridad del contrato de salida del prompt: si el modelo filtra el paso de análisis previo, el asesor no debe ver el andamiaje.

> **REDISEÑADO el 10-ago-2026, decisión de Leonardo.** El diseño original —limpiar el andamiaje
> del texto corrido con regex— se intentó dos veces y **falló en las dos direcciones a la vez**,
> verificado ejecutando el código: seguía filtrando razonamiento (listas numeradas enteras; y como
> el prompt pide analizar 3 cosas, el modelo escribe 2-3 oraciones de análisis y el limpiador solo
> sacaba la primera) y además borraba descripciones legítimas (`"Análisis de la ubicación: el
> edificio está a dos cuadras del subte…"` → `""`, y el asesor veía "la IA no devolvió texto").
>
> La causa es estructural, no de implementación: mirando texto suelto hay que **adivinar** qué
> oración es razonamiento y cuál es contenido, y "análisis", "se observa" y "como resultado" son
> palabras normales de un aviso inmobiliario. Más agresivo borra lo bueno; más suave deja pasar lo
> malo. No hay punto medio.
>
> **Nuevo diseño:** la Task 6 le pide a Gemini **salida estructurada** (`responseMimeType:
> "application/json"` + `responseSchema`) con dos campos, `analisis` y `descripcion`. El
> razonamiento tiene su propio lugar, así que no necesita colarse en el párrafo final, y el
> endpoint simplemente descarta ese campo. El contenido del prompt no cambia: el paso de análisis
> previo, el tono y las consignas quedan igual — cambia solo cómo viene empaquetada la respuesta.
>
> Esto **achica** el alcance de este módulo. Ya no adivina nada:
> - `extraerDescripcion(crudo)` — parsea el JSON y devuelve el campo `descripcion`. Si el JSON no
>   parsea o falta el campo, devuelve `""`. **No intenta rescatar el texto con heurísticas:** un
>   rescate es exactamente el adivinar que este rediseño elimina, y devolver vacío es seguro
>   (restricción global: si la IA falla se muestra el error y "Buscar comparables" sigue andando).
> - `sanearDescripcionIA(texto)` — queda como higiene de formato sobre un campo que ya se sabe que
>   es la descripción: normaliza espacios/saltos y saca restos de markdown. **Sin reglas de
>   andamiaje, sin cortar por etiquetas, sin descartar párrafos.** Todo lo que fue whack-a-mole se
>   borra.
> - `recortarAPalabra(texto, max)` — sin cambios. Ya estaba bien y sus tests pasaron las dos rondas.
>
> Los tests de andamiaje/etiquetas/párrafos se eliminan junto con el código que probaban. Se
> conservan y se refuerzan los de `recortarAPalabra` y los de higiene de formato, y se agregan los
> de `extraerDescripcion` (JSON válido; JSON roto; campo ausente; campo vacío; JSON con la
> descripción vacía pero `analisis` lleno).

**Files:**
- Create: `lib/acm/descripcion-ia.ts`
- Test: `lib/acm/descripcion-ia.test.ts`

**Interfaces:**
- Produces: `MAX_DESC_IA = 700`; `extraerDescripcion(crudo: string): string`; `sanearDescripcionIA(texto: string): string`; `recortarAPalabra(texto: string, max: number): string`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import { sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "./descripcion-ia";

describe("sanearDescripcionIA", () => {
  it("deja intacto un párrafo limpio", () => {
    const t = "Departamento de dos ambientes con muy buena luz natural.";
    expect(sanearDescripcionIA(t)).toBe(t);
  });

  it("saca los cercos de markdown", () => {
    expect(sanearDescripcionIA("```\nTexto real.\n```")).toBe("Texto real.");
  });

  it("descarta el bloque de análisis previo si el modelo lo imprime", () => {
    const t = "Análisis visual: se observan pisos de madera y ventanas amplias.\n\nDepartamento luminoso al frente.";
    expect(sanearDescripcionIA(t)).toBe("Departamento luminoso al frente.");
  });

  it("saca el prefijo 'Descripción:'", () => {
    expect(sanearDescripcionIA("Descripción: Casa en dos plantas.")).toBe("Casa en dos plantas.");
  });

  it("junta los saltos de línea en un solo párrafo", () => {
    expect(sanearDescripcionIA("Primera parte.\nSegunda parte.")).toBe("Primera parte. Segunda parte.");
  });

  it("no rompe con vacío", () => {
    expect(sanearDescripcionIA("")).toBe("");
  });
});

describe("recortarAPalabra", () => {
  it("no toca lo que ya entra", () => {
    expect(recortarAPalabra("corto", 700)).toBe("corto");
  });

  it("corta en límite de palabra, nunca a mitad", () => {
    const r = recortarAPalabra("uno dos tres cuatro", 11);
    expect(r).toBe("uno dos");
    expect(r.length).toBeLessThanOrEqual(11);
  });

  it("el tope duro es 700", () => {
    expect(MAX_DESC_IA).toBe(700);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/acm/descripcion-ia.test.ts`
Expected: FAIL — no existe el módulo `./descripcion-ia`.

- [ ] **Step 3: Implementar**

```ts
// ─────────────────────────────────────────────────────────────────────────────
// ACM · Saneado de la descripción que devuelve la IA de visión.
//
// El prompt le pide al modelo que observe primero (luminosidad, conservación,
// distribución) y recién después redacte, pero que devuelva SOLO el párrafo final.
// Los modelos filtran ese andamiaje con bastante frecuencia, y este texto va al
// cuadro que edita el asesor y de ahí puede ir a la ficha del cliente. Esto es la
// red de seguridad: si el análisis previo sale impreso, se descarta acá.
// ─────────────────────────────────────────────────────────────────────────────

/** Tope duro de lo que se guarda. El prompt pide 400-600; esto es el techo. */
export const MAX_DESC_IA = 700;

/** Párrafos que son andamiaje del prompt, no la descripción. */
const RE_ANDAMIAJE = /^\s*(an[áa]lisis|observaci[óo]n(es)?|paso\s*1|razonamiento)\b/i;
/** Etiqueta que a veces precede al texto bueno. */
const RE_ETIQUETA = /^\s*(descripci[óo]n|texto\s*final|resultado)\s*:\s*/i;

export function sanearDescripcionIA(texto: string): string {
  if (!texto) return "";

  // 1) Cercos de markdown (```...``` o ```md ... ```).
  let t = texto.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "");

  // 2) Descartar los párrafos que son el análisis previo.
  const parrafos = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const utiles = parrafos.filter((p) => !RE_ANDAMIAJE.test(p));

  // Si TODO parecía andamiaje, nos quedamos con el último párrafo: es preferible
  // devolver algo editable a devolver vacío.
  t = (utiles.length ? utiles : parrafos.slice(-1)).join(" ");

  // 3) Sacar la etiqueta del texto bueno, y aplastar saltos y espacios repetidos.
  return t.replace(RE_ETIQUETA, "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Recorta sin cortar palabras. Si no hay espacio antes del tope, corta duro. */
export function recortarAPalabra(texto: string, max: number = MAX_DESC_IA): string {
  if (!texto || texto.length <= max) return texto;
  const cortado = texto.slice(0, max);
  const ultimo = cortado.lastIndexOf(" ");
  return (ultimo > 0 ? cortado.slice(0, ultimo) : cortado).trimEnd();
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/acm/descripcion-ia.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/acm/descripcion-ia.ts lib/acm/descripcion-ia.test.ts
git commit -m "feat(acm): saneado y recorte de la descripcion que devuelve la IA"
```

---

### Task 5: La descripción entra al texto del embedding

**Files:**
- Modify: `lib/tasacion/types.ts` (interface `Sujeto`)
- Modify: `lib/acm/subject.ts` (`sujetoToEmbeddingText`, ~línea 63-78)
- Test: `lib/acm/subject.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `Sujeto.descripcion_ia?: string` y `Sujeto.incluir_desc_ficha?: boolean`. `sujetoToEmbeddingText` concatena la descripción al final.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import { sujetoToEmbeddingText } from "./subject";
import type { Sujeto } from "@/lib/tasacion/types";

const base = {
  tipo_propiedad: "departamento",
  barrio: "Belgrano",
  direccion: "Cuba 2500",
  dormitorios: 2,
  banos: 1,
  m2_cubiertos: 60,
  m2_semicubiertos: 0,
} as unknown as Partial<Sujeto>;

describe("sujetoToEmbeddingText", () => {
  it("sin descripción se comporta igual que antes", () => {
    const t = sujetoToEmbeddingText(base);
    expect(t).toContain("Belgrano");
    expect(t).toContain("3 ambientes");
    expect(t).not.toContain("undefined");
  });

  it("suma la descripción de la IA al final", () => {
    const t = sujetoToEmbeddingText({ ...base, descripcion_ia: "Muy luminoso, cocina original." });
    expect(t).toContain("Muy luminoso, cocina original.");
    expect(t.indexOf("Muy luminoso")).toBeGreaterThan(t.indexOf("Belgrano"));
  });

  it("ignora una descripción vacía o de puros espacios", () => {
    expect(sujetoToEmbeddingText({ ...base, descripcion_ia: "   " })).toBe(sujetoToEmbeddingText(base));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/acm/subject.test.ts`
Expected: FAIL — `descripcion_ia` no existe en el tipo `Sujeto` y el texto no la incluye.

- [ ] **Step 3: Sumar los campos al tipo**

En `lib/tasacion/types.ts`, dentro de `interface Sujeto`, después de `en_pozo?: boolean;`:

```ts
  // Descripción generada por la IA a partir de las fotos y editada por el asesor.
  // Entra al texto que se embebe para buscar comparables por similitud descriptiva.
  descripcion_ia?: string;
  // Si va o no en la ficha que recibe el cliente. Solo aplica si hay descripcion_ia.
  incluir_desc_ficha?: boolean;
```

- [ ] **Step 4: Concatenarla en el texto del embedding**

En `lib/acm/subject.ts`, en `sujetoToEmbeddingText`, agregar como último elemento del array (después de `amen.join(", ")`):

```ts
    (s.descripcion_ia || "").trim(),
```

El `.filter(Boolean)` que ya está la descarta sola si viene vacía.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/acm/subject.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/tasacion/types.ts lib/acm/subject.ts lib/acm/subject.test.ts
git commit -m "feat(acm): la descripcion de la IA entra al texto del embedding del sujeto"
```

---

### Task 6: Endpoint `POST /api/acm/analizar-fotos`

**Files:**
- Create: `app/api/acm/analizar-fotos/route.ts`
- Reference: `lib/gemini.ts:49` (`extractTextFromDocument`, patrón de `inlineData`)

**Interfaces:**
- Consumes: `extraerDescripcion`, `sanearDescripcionIA`, `recortarAPalabra`, `MAX_DESC_IA` del Task 4.
- El import correspondiente del Step 1 incluye `extraerDescripcion`.
- Produces: `POST /api/acm/analizar-fotos` con body `{ fotos: {data: string, mimeType: string}[], foco?: string, sujeto?: Partial<Sujeto> }` → `200 { descripcion: string }` | `400 { error }` | `500 { error }`.

- [ ] **Step 1: Escribir el endpoint**

```ts
// ACM · Analiza hasta 4 fotos de la propiedad sujeto con Gemini (visión) y devuelve una
// descripción presentable y veraz, que el asesor edita y que se usa para afinar la
// búsqueda de comparables por similitud descriptiva.
//
// Las fotos NO se guardan en ningún lado: entran por el body, van al modelo y se descartan.
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "@/lib/acm/descripcion-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES_OK = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTOS = 4;
const MAX_BYTES_TOTAL = 6 * 1024 * 1024; // 6 MB ya redimensionadas en el navegador
const MAX_FOCO = 300;

export async function POST(req: Request) {
  try {
    await requireTenant();
    const body = await req.json();

    const fotos = Array.isArray(body.fotos) ? body.fotos : [];
    if (fotos.length === 0) {
      return NextResponse.json({ error: "Subí al menos una foto." }, { status: 400 });
    }
    if (fotos.length > MAX_FOTOS) {
      return NextResponse.json({ error: `Máximo ${MAX_FOTOS} fotos.` }, { status: 400 });
    }
    if (fotos.some((f: any) => !f?.data || !MIMES_OK.includes(f?.mimeType))) {
      return NextResponse.json({ error: "Formato no admitido. Usá JPG, PNG o WEBP." }, { status: 400 });
    }
    // base64 pesa ~4/3 del binario; alcanza para frenar un body desmedido.
    const bytes = fotos.reduce((a: number, f: any) => a + Math.floor(f.data.length * 0.75), 0);
    if (bytes > MAX_BYTES_TOTAL) {
      return NextResponse.json({ error: "Las fotos pesan demasiado. Probá con menos o más chicas." }, { status: 400 });
    }

    const foco = String(body.foco || "").slice(0, MAX_FOCO).trim();
    const s = body.sujeto || {};
    const contexto = [
      s.tipo_propiedad && `Tipo: ${s.tipo_propiedad}`,
      s.barrio && `Barrio: ${s.barrio}`,
      s.m2_cubiertos && `Superficie cubierta: ${s.m2_cubiertos} m²`,
      s.dormitorios && `Dormitorios: ${s.dormitorios}`,
      s.banos && `Baños: ${s.banos}`,
    ].filter(Boolean).join(" · ");

    // OJO: la cantidad de fotos se interpola. Si el prompt afirma que hay más de las que
    // hay, el modelo completa el hueco y describe ambientes que nunca vio.
    const cuantas = fotos.length === 1 ? "la imagen" : `las ${fotos.length} imágenes`;

    const prompt = `Sos un redactor inmobiliario argentino. Vas a describir una propiedad a partir de sus fotos.

Análisis visual previo: Observá detenidamente ${cuantas} buscando indicadores de luminosidad (fuentes de luz natural, sombras), estado de conservación (pisos, paredes, humedad) y distribución espacial.

Describí únicamente lo que se ve en las fotos basándote en el análisis anterior. Si algo no se ve, no lo afirmes.

Nunca contradigas los datos cargados de la propiedad.${contexto ? `\nDatos cargados: ${contexto}` : ""}

Tono de aviso profesional argentino, español rioplatense. Sin superlativos vacíos ("espectacular", "único", "soñado"), sin signos de exclamación.

No omitas ni disimules lo que está deteriorado, pero decilo con honestidad y sin castigar: "cocina original, con posibilidad de actualización" en lugar de "cocina vieja" o de no mencionarla.

Sin precio, sin datos de contacto, sin nombre de inmobiliaria.

Entre 400 y 600 caracteres, en un solo párrafo corrido.
${foco ? `\nEl asesor pidió enfocarse en: ${foco}. Priorizalo sin ignorar el resto de las características clave.` : ""}

FORMATO DE SALIDA: devolvé un JSON con dos campos. En "analisis" va el análisis visual previo (es un paso interno, nadie lo ve). En "descripcion" va únicamente el párrafo final, sin encabezados, sin viñetas, sin repetir las consignas, sin prefijos como "Análisis:" o "Descripción:" y sin markdown.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // Salida estructurada: el análisis previo tiene su propio campo, así que no puede
    // colarse en el párrafo final. Sin esto habría que adivinar, mirando texto corrido,
    // qué oración es razonamiento y cuál es contenido — y "análisis", "se observa" o
    // "como resultado" son palabras normales de un aviso inmobiliario. Se probó y falla
    // en las dos direcciones: filtra andamiaje y borra descripciones buenas.
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            analisis: { type: "string" },
            descripcion: { type: "string" },
          },
          required: ["analisis", "descripcion"],
        },
      },
    });

    const result = await model.generateContent([
      ...fotos.map((f: any) => ({ inlineData: { data: f.data, mimeType: f.mimeType } })),
      prompt,
    ]);

    // `analisis` se descarta acá: existe para darle al modelo dónde poner el razonamiento,
    // no para mostrarlo.
    const crudo = extraerDescripcion(result.response.text());
    const descripcion = recortarAPalabra(sanearDescripcionIA(crudo), MAX_DESC_IA);
    if (!descripcion) {
      return NextResponse.json({ error: "La IA no devolvió texto. Probá de nuevo." }, { status: 500 });
    }

    return NextResponse.json({ descripcion });
  } catch (e: any) {
    console.error("ACM analizar-fotos error:", e);
    const status = e.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: e.message || "No se pudo analizar las fotos." }, { status });
  }
}
```

- [ ] **Step 2: Probar el endpoint con fotos reales**

Con `npm run dev` corriendo y sesión iniciada, desde la consola del navegador en `/asesor/acm`:

```js
const f = document.createElement("input"); f.type = "file"; f.accept = "image/*"; f.multiple = true;
f.onchange = async () => {
  const fotos = await Promise.all([...f.files].slice(0,4).map(file => new Promise(res => {
    const r = new FileReader();
    r.onload = () => res({ data: r.result.split(",")[1], mimeType: file.type });
    r.readAsDataURL(file);
  })));
  const r = await fetch("/api/acm/analizar-fotos", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ fotos, foco: "estado de la cocina", sujeto: { tipo_propiedad: "departamento", barrio: "Belgrano", m2_cubiertos: 60 } })
  });
  console.log(await r.json());
};
f.click();
```

Verificar, mirando las fotos usadas:
1. El texto **no** afirma nada que no esté en las fotos (ni cantidad de ambientes que no se vean, ni vista, ni amenities).
2. No aparece "Análisis:", ni viñetas, ni markdown.
3. Está entre 400 y 700 caracteres.
4. Si algo está deteriorado, lo menciona sin castigar.

Probar además el caso de **una sola foto** y confirmar que el prompt dice "la imagen" y el modelo no inventa ambientes.

- [ ] **Step 3: Probar los rechazos**

Mandar 5 fotos → `400 "Máximo 4 fotos."`. Mandar `fotos: []` → `400 "Subí al menos una foto."`. Mandar un PDF en base64 con `mimeType: "application/pdf"` → `400 "Formato no admitido…"`.

- [ ] **Step 4: Commit**

```bash
git add app/api/acm/analizar-fotos/route.ts
git commit -m "feat(acm): endpoint que analiza fotos con Gemini y devuelve descripcion veraz"
```

---

### Task 7: Componente de fotos + IA en el formulario

`subject-input.tsx` ya tiene 368 líneas y tres modos de carga. El bloque de fotos va en **su propio componente** para no engordarlo: es una unidad con responsabilidad clara (elegir fotos, achicarlas, pedir el análisis, dejarlo editable).

**Files:**
- Create: `app/asesor/acm/components/fotos-ia.tsx`
- Modify: `app/asesor/acm/components/subject-input.tsx` (props + render antes del botón de la línea ~356)
- Modify: `app/asesor/acm/components/acm-module.tsx` (estado + envío)

**Interfaces:**
- Consumes: `POST /api/acm/analizar-fotos` del Task 6.
- Produces: `<FotosIA descripcion incluirEnFicha onDescripcionChange onIncluirEnFichaChange sujeto />`. El padre es dueño del estado; el componente no guarda nada que necesite sobrevivirle.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

// ACM · Fotos de la propiedad + análisis con IA de visión.
//
// Hasta 4 fotos opcionales. Se achican en el navegador antes de subirlas (menos espera y
// menos costo) y NO se guardan en ningún lado: van al endpoint, vuelve el texto y se
// descartan. El análisis se hace UNA sola vez; si el texto no convence, se edita a mano.
import { useState } from "react";
import { Loader2, ImagePlus, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Sujeto } from "@/lib/tasacion/types";

const MAX_FOTOS = 4;
const MAX_LADO = 1280;
const MAX_DESC = 700;

interface FotoLocal {
  preview: string; // objectURL solo para la miniatura
  data: string;    // base64 ya redimensionado
  mimeType: string;
}

/** Redimensiona a 1280px de lado mayor y devuelve JPEG base64 (sin el prefijo data:). */
async function achicar(file: File): Promise<FotoLocal> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { preview: dataUrl, data: dataUrl.split(",")[1], mimeType: "image/jpeg" };
}

export function FotosIA({
  sujeto, descripcion, incluirEnFicha, onDescripcionChange, onIncluirEnFichaChange,
}: {
  sujeto: Sujeto;
  descripcion: string;
  incluirEnFicha: boolean;
  onDescripcionChange: (v: string) => void;
  onIncluirEnFichaChange: (v: boolean) => void;
}) {
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [foco, setFoco] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El análisis se hace una sola vez: una vez que hay texto, no se ofrece rehacerlo.
  const yaAnalizo = descripcion.trim().length > 0;

  const agregar = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const libres = MAX_FOTOS - fotos.length;
      const nuevas = await Promise.all([...files].slice(0, libres).map(achicar));
      setFotos((f) => [...f, ...nuevas]);
    } catch {
      setError("No se pudo leer alguna de las imágenes.");
    }
  };

  const analizar = async () => {
    setAnalizando(true);
    setError(null);
    try {
      const r = await fetch("/api/acm/analizar-fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotos: fotos.map(({ data, mimeType }) => ({ data, mimeType })),
          foco,
          sujeto,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo analizar las fotos.");
      onDescripcionChange(j.descripcion);
    } catch (e: any) {
      // Un fallo no cuenta como análisis: el botón sigue disponible para reintentar.
      setError(e.message);
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-2xl border border-accent/10 bg-card/20">
      <div>
        <Label className="text-sm font-bold">Fotos de la propiedad (opcional)</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Hasta {MAX_FOTOS}. La IA las mira y redacta una descripción que afina la búsqueda de
          comparables. Las fotos no se guardan.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.preview} alt={`Foto ${i + 1}`} className="w-20 h-20 rounded-xl object-cover" />
            {!yaAnalizo && (
              <button
                type="button"
                onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-accent/20 flex items-center justify-center"
                aria-label="Quitar foto"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {fotos.length < MAX_FOTOS && !yaAnalizo && (
          <label className="w-20 h-20 rounded-xl border border-dashed border-accent/30 flex items-center justify-center cursor-pointer hover:bg-accent/5">
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => agregar(e.target.files)}
            />
          </label>
        )}
      </div>

      {fotos.length > 0 && !yaAnalizo && (
        <>
          <div className="space-y-1">
            <Label className="text-xs font-bold">¿En qué querés que se enfoque el análisis?</Label>
            <Input
              value={foco}
              maxLength={300}
              onChange={(e) => setFoco(e.target.value)}
              placeholder="Ej: estado de la cocina y los baños, luminosidad y vista, calidad de las terminaciones"
              className="bg-card/50 border-accent/10"
            />
          </div>
          <Button onClick={analizar} disabled={analizando} className="bg-accent hover:bg-accent/90">
            {analizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {analizando ? "Analizando fotos..." : "Analizar fotos con IA"}
          </Button>
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {yaAnalizo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold">Descripción (editable)</Label>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {descripcion.length}/{MAX_DESC}
            </span>
          </div>
          <Textarea
            value={descripcion}
            maxLength={MAX_DESC}
            rows={5}
            onChange={(e) => onDescripcionChange(e.target.value)}
            className="bg-card/50 border-accent/10 text-sm"
          />
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={incluirEnFicha}
              onCheckedChange={(v) => onIncluirEnFichaChange(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs">
              <span className="font-bold">Incluir esta descripción en la ficha del cliente</span>
              <span className="block text-muted-foreground mt-0.5">
                Revisala antes: lo que quede acá es lo que va a leer tu cliente.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Estado en el módulo**

En `acm-module.tsx`, junto a `incluirLinderos`:

```tsx
  const [descripcionIa, setDescripcionIa] = useState("");
  const [incluirDescFicha, setIncluirDescFicha] = useState(true);
```

Y en el body del fetch de comparables, mandar la descripción **dentro del sujeto** (es donde la espera el endpoint y donde queda guardada en el historial):

```tsx
        body: JSON.stringify({
          sujeto: { ...sujeto, descripcion_ia: descripcionIa.trim(), incluir_desc_ficha: incluirDescFicha },
          operacion,
          exclude_id: excludeId,
          considerar_ph: considerarPh,
          incluir_linderos: incluirLinderos,
        }),
```

Pasar los cuatro props nuevos a `<SubjectInput>`:

```tsx
              descripcionIa={descripcionIa}
              onDescripcionIaChange={setDescripcionIa}
              incluirDescFicha={incluirDescFicha}
              onIncluirDescFichaChange={setIncluirDescFicha}
```

- [ ] **Step 3: Montarlo en el formulario**

En `subject-input.tsx`, sumar a `SubjectInputProps`:

```ts
  descripcionIa: string;
  onDescripcionIaChange: (v: string) => void;
  incluirDescFicha: boolean;
  onIncluirDescFichaChange: (v: boolean) => void;
```

Agregarlos al destructuring, importar `FotosIA` y renderizarlo **justo antes** del `<Button>` de "Buscar comparables" (línea ~356):

```tsx
      <FotosIA
        sujeto={sujeto}
        descripcion={descripcionIa}
        incluirEnFicha={incluirDescFicha}
        onDescripcionChange={onDescripcionIaChange}
        onIncluirEnFichaChange={onIncluirDescFichaChange}
      />
```

- [ ] **Step 4: Verificar en el navegador**

1. Sin subir fotos, el ACM funciona igual que siempre y el bloque no molesta.
2. Subir 4 fotos: se ven las miniaturas, se pueden quitar.
3. Al llegar a 4, desaparece el recuadro de agregar.
4. Analizar: aparece el texto editable, el contador, la casilla de la ficha, **y ya no hay botón de analizar** (una sola vez).
5. Editar el texto a mano y confirmar que el contador acompaña y que corta en 700.
6. Cortar internet y darle a analizar: aparece el error y el botón sigue disponible para reintentar. "Buscar comparables" nunca se bloquea.

- [ ] **Step 5: Commit**

```bash
git add app/asesor/acm/components/fotos-ia.tsx app/asesor/acm/components/subject-input.tsx app/asesor/acm/components/acm-module.tsx
git commit -m "feat(acm): bloque de fotos con analisis por IA en el formulario del sujeto"
```

---

### Task 8: El peso semántico sube cuando hay descripción

**Files:**
- Modify: `app/api/acm/comparables/route.ts`
- Modify: `lib/acm/checklist.ts` (`PESOS`, `buildChecklist`)

**Interfaces:**
- Consumes: `p_peso_semantica` (Task 1), `Sujeto.descripcion_ia` (Task 5).
- Produces: `buildChecklist` acepta `pesoSemantica: number` en sus args.

- [ ] **Step 1: Calcular y mandar el peso**

En `app/api/acm/comparables/route.ts`, junto a `zonaMin`:

```ts
    // Con una descripción real de la propiedad, la similitud descriptiva deja de ser
    // redundante con las dimensiones duras (tipo/m²/ambientes ya se puntúan aparte) y
    // pasa a aportar señal propia: de 10 a 20 puntos sobre ~130.
    const tieneDesc = Boolean((sujeto.descripcion_ia || "").trim());
    const pesoSemantica = tieneDesc ? 20 : 10;
```

Agregar `p_peso_semantica: pesoSemantica,` a **las dos** llamadas RPC.

- [ ] **Step 2: Que el checklist muestre el peso real**

En `lib/acm/checklist.ts`, sacar `semantica` de la constante `PESOS` y pasarlo por argumento. Cambiar la firma:

```ts
export function buildChecklist(args: {
  sub: SubScores;
  operacion: string;
  /** Peso del ítem semántico: 20 si el sujeto trae descripción de la IA, 10 si no. */
  pesoSemantica: number;
  sujeto: { tipo: string; zona: string; m2: number | null; ambientes: number | null; dormitorios: number | null; banos: number | null; antiguedad: number | null; amenities: string[] };
  comp: { tipo: string; zona: string; m2: number | null; ambientes: number | null; dormitorios: number | null; banos: number | null; antiguedad: number | null; amenities: string[] };
}): ChecklistItem[] {
  const { sub, sujeto, comp, operacion, pesoSemantica } = args;
```

Los tipos de `sujeto` y `comp` quedan **exactamente como están hoy**: lo único que se agrega es
`pesoSemantica`. Y en la constante `PESOS`, quitar la clave `semantica` y dejar el comentario:

```ts
// Pesos base del % (deben coincidir con los de las funciones SQL acm_match_*). El semántico NO
// está acá: es variable (10, o 20 cuando el sujeto trae descripción de la IA) y llega por argumento.
const PESOS = { zona: 20, superficie: 22, ambientes: 16, dormitorios: 14, banos: 12, antiguedad: 14, amenities: 12 } as const;
```

Y en el ítem `semantica`, reemplazar `peso: PESOS.semantica` por `peso: pesoSemantica`. Actualizar el comentario de `PESOS` para aclarar que el semántico ya no vive ahí.

- [ ] **Step 3: Pasarlo en las dos construcciones del checklist**

En `route.ts`, las dos llamadas a `buildChecklist` (cartera ~línea 185 y roomix ~línea 225) reciben `pesoSemantica,`.

- [ ] **Step 4: Verificar el efecto real**

Hacer el mismo ACM dos veces (mismo barrio, tipo, m², dormitorios) — una sin fotos y otra con la descripción cargada — y comparar:

- El orden de los comparables **cambia**: los de descripción parecida suben.
- En el checklist, "Similitud descriptiva (IA)" muestra `20` de peso en el segundo caso.
- Los comparables de **otro barrio** no aparecen en ninguno de los dos (la casilla de linderos sigue apagada).

- [ ] **Step 5: Commit**

```bash
git add app/api/acm/comparables/route.ts lib/acm/checklist.ts
git commit -m "feat(acm): el peso de la similitud descriptiva sube a 20 cuando hay descripcion"
```

---

### Task 9: La descripción en la portada de la ficha

**Files:**
- Modify: `lib/acm/ficha.ts` (tipo del sujeto del snapshot)
- Modify: `app/api/acm/ficha/route.ts:205-212` (armado del snapshot)
- Modify: `app/ficha-acm/[token]/page.tsx` (portada ~línea 154-165 + CSS)

**Interfaces:**
- Consumes: `Sujeto.descripcion_ia` e `incluir_desc_ficha` (Task 5).
- Produces: `snapshot.sujeto.descripcion?: string | null`.

- [ ] **Step 1: Sumar el campo al tipo**

En `lib/acm/ficha.ts`, en el bloque `sujeto` del snapshot:

```ts
  /** Descripción de la IA editada por el asesor. Solo viaja si la tildó para la ficha. */
  descripcion?: string | null;
```

- [ ] **Step 2: Llenarlo solo si el asesor lo pidió**

En `app/api/acm/ficha/route.ts`, dentro del objeto `sujeto` del snapshot (después de `banos`):

```ts
        // Solo va si el asesor tildó la casilla. El tope de 700 ya se aplicó al generarla,
        // pero se re-aplica acá porque el texto pudo editarse a mano.
        descripcion: sujeto.incluir_desc_ficha && sujeto.descripcion_ia
          ? recortarAPalabra(String(sujeto.descripcion_ia).trim(), MAX_DESC_IA)
          : null,
```

Importar arriba: `import { recortarAPalabra, MAX_DESC_IA } from "@/lib/acm/descripcion-ia";`

- [ ] **Step 3: Renderizarla en la portada**

En `app/ficha-acm/[token]/page.tsx`, dentro de `.cover-body`, **después** del `<div className="cover-meta">` (cierra en la línea ~165):

```tsx
          {subject.descripcion && (
            <p className="cover-desc">{subject.descripcion}</p>
          )}
```

- [ ] **Step 4: El clamp que garantiza una sola hoja**

En el bloque `CSS`, junto a los estilos de portada:

```css
/* Descripción del sujeto en la portada. Mismo criterio que .comp-desc: la hoja es un A4
   EXACTO, así que además del tope de 700 caracteres al guardar va un clamp duro. Aunque
   alguien pegue a mano un texto larguísimo, la portada no puede desbordar. */
.cover-desc {
  margin-top: 26px; font-size: 12.5px; line-height: 1.65; color: #5c5c5c; max-width: 88%;
  max-height: 165px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical;
}
```

- [ ] **Step 5: Verificar que no se pasa de la hoja**

1. Hacer un ACM con descripción, tildar "Incluir en la ficha", crear la ficha y abrir el link.
2. La portada muestra el párrafo debajo del bloque de la propiedad.
3. **Ctrl+P** y contar páginas: portada (1) + una por comparable + matriz. La portada **no** puede partirse en dos.
4. Repetir con el peor caso: pegar a mano 700 caracteres en el cuadro antes de crear la ficha. Sigue siendo una sola hoja.
5. Destildar la casilla y crear otra ficha: la portada queda como antes, sin párrafo.
6. Abrir una ficha vieja: sin el campo, renderiza igual que siempre.

- [ ] **Step 6: Commit**

```bash
git add lib/acm/ficha.ts app/api/acm/ficha/route.ts "app/ficha-acm/[token]/page.tsx"
git commit -m "feat(acm): descripcion del sujeto en la portada de la ficha, con clamp"
```

---

### Task 10: Verificación final y documentación

**Files:**
- Modify: `docs/interno/LOGICA-PRISMA.md`
- Modify: `docs/interno/TECNICO-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`

- [ ] **Step 1: Correr todos los tests y el build**

```bash
npm test
npm run build
```

Esperado: los tests de `lib/acm/*` y los de `lib/reports/weekly/*` en verde, y el build sin errores de tipos.

- [ ] **Step 2: Prueba de punta a punta con datos reales**

Con la cuenta de Central, un ACM de Belgrano departamento venta:

1. Sin fotos y sin linderos → ningún comparable de Núñez/Saavedra/Colegiales.
2. Tildando linderos → aparecen, con chip.
3. Con 4 fotos reales → descripción veraz, editable, una sola pasada.
4. Ficha creada con la descripción → una hoja por propiedad.
5. Reabrir el ACM desde **"Mis ACM"**: la descripción vuelve guardada (viaja en el jsonb `sujeto`).

- [ ] **Step 3: Documentar**

En `LOGICA-PRISMA.md`: la zona ahora es estricta por defecto y por qué (el reclamo real, el −2% de impacto en precio contra el costo de confianza), más qué hace la descripción de la IA en el matching.

En `TECNICO-PRISMA.md`: los dos parámetros SQL nuevos con sus defaults, el endpoint `analizar-fotos`, que las fotos no se persisten, y el mecanismo de dos capas (tope de caracteres + clamp CSS) que garantiza una hoja por propiedad.

En las guías funcionales, en lenguaje llano: qué hace la casilla de barrios linderos, cómo se usan las fotos, que el análisis es **una sola vez** y que el texto es responsabilidad del asesor antes de mandárselo al cliente.

- [ ] **Step 4: Commit**

```bash
git add docs/interno/LOGICA-PRISMA.md docs/interno/TECNICO-PRISMA.md \
        docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md \
        docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md
git commit -m "docs(acm): zona estricta, barrios linderos y fotos analizadas por IA"
```

- [ ] **Step 5: Avisar antes de mergear**

No mergear a `main` ni pushear sin OK explícito de Leonardo. Presentarle: el ACM de Belgrano antes/después, una descripción generada contra sus fotos, y la ficha impresa.

---

## Notas de riesgo para quien ejecute

- **La migración del Task 1 va contra la base de producción** (no hay base local). Es segura porque los dos parámetros nuevos tienen defaults que preservan el comportamiento: hasta que el código del Task 2 y del Task 8 mande otros valores, producción no cambia.
- **El default estricto cambia resultados respecto de ayer.** Es intencional. Las búsquedas ya guardadas en "Mis ACM" no se recalculan: guardan su snapshot.
- **La IA puede equivocarse leyendo una foto y ese texto puede llegar al cliente.** Las tres capas son: el prompt prohíbe afirmar lo que no se ve, el texto es editable, y la casilla decide si sale en la ficha. Ninguna de las tres es opcional.
- **Nunca hardcodear la cantidad de fotos en el prompt.** Si dice "4 imágenes" y hay 2, el modelo rellena el hueco con ambientes que no existen.
