# Oferta irresistible + guiones de video en Marketing IA

**Fecha:** 13-ago-2026
**Módulo:** Marketing IA (`app/asesor/marketing-ia`, `app/director/marketing-ia`)
**Referencia:** `formularios_oferta_irresistible.md` (fórmula de valor de Alex Hormozi)

---

## 1. El problema

Hoy el generador de anuncios (`/api/marketing-ia/generate-batch`) escribe con tres insumos:

1. el **IPC** (perfil de cliente ideal, tabla `ipc_profiles`, tipo `captar` o `vender`),
2. la **propiedad de Tokko** (opcional),
3. la **directiva creativa** de la agencia (`agencies.marketing_ai_config.creative_directive`).

Falta el insumo más importante para diferenciarse: **cómo trabaja el asesor**. Sin sus números reales
(a qué % del ACM cierra, cuántos compradores tiene en base, en cuántas horas entrega el ACM, qué se
banca él para que el dueño no mueva un dedo), la IA solo puede escribir promesas genéricas que
cualquier inmobiliaria podría firmar.

Además, el guion de video tiene la estructura **fija** (`hook → problema → agitación → solución → CTA`)
y se genera junto con una imagen, cuando en realidad un guion para hablar a cámara no necesita imagen
y sí necesita poder elegir la estructura narrativa.

## 2. Qué se construye

1. Una pestaña nueva **"Mi Forma de Trabajar"** dentro de Marketing IA donde el asesor carga su
   operación real y obtiene **2 ofertas irresistibles** (captación y venta), guardadas y editables.
2. La inyección automática de esa oferta + sus datos duros en **todos** los anuncios que genere.
3. **6 estructuras de guion** elegibles (+ "Sugerida") para el copy de video.
4. El copy de video pasa a ser un **guion para cámara sin imágenes**, con segundos, indicación de
   tono y explicación de por qué va cada bloque.

### Decisiones tomadas (y por qué)

| Decisión | Elegido | Motivo |
|---|---|---|
| Dueño del dato | **Por usuario** (cada asesor el suyo; el director es uno más) | Los números de Hormozi solo funcionan si son de quien habla. Misma lógica que `ipc_profiles`, que ya es por `user_id`. |
| La oferta | **Guardada y editable**, se regenera a pedido | El asesor revisa y corrige antes de que la IA la repita en todos sus anuncios; y no gasta un crédito por anuncio en rehacerla. |
| Estructuras | El asesor elige una; **las 3 variantes la usan** y se siguen diferenciando por ángulo | No rompe el flujo actual y permite comparar 3 redacciones del mismo esquema. |
| Alcance del formulario | Las 11 preguntas del documento **+ bloque de perfil profesional opcional** | Sin casos reales ni credenciales, el bloque "prueba social" de las estructuras queda sin material y la IA lo inventa. |
| Video | **Guion sin imágenes** | Es para aprenderlo y hablarlo a cámara. Post sigue generando imagen. |

### Fuera de alcance (a propósito)

- **Autocompletar los números desde PRISMA** (ventas del pipeline, compradores activos de WhatsApp).
  Es el paso 2 natural, pero exige definir qué cuenta como "vendida" y como "comprador activo"; un
  número mal calculado que sale publicado es peor que uno cargado a mano.
- Versionado/histórico de ofertas: se guarda la vigente.
- Ofertas a nivel agencia.
- Estructuras para el copy de tipo *post* (sigue con `hook / desarrollo / cta`).

---

## 3. Datos

### 3.1 Tabla nueva `advisor_operations`

Una fila por usuario. Migración nueva en `supabase/migrations/`.

```sql
CREATE TABLE IF NOT EXISTS public.advisor_operations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  captacion                JSONB NOT NULL DEFAULT '{}'::jsonb,
  venta                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  oferta_captacion         TEXT,
  oferta_venta             TEXT,
  oferta_captacion_editada BOOLEAN NOT NULL DEFAULT false,
  oferta_venta_editada     BOOLEAN NOT NULL DEFAULT false,
  ofertas_generadas_at     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.advisor_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own operation" ON public.advisor_operations;
CREATE POLICY "Users manage own operation" ON public.advisor_operations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

Las ofertas viven en la misma fila: una sola lectura al generar un anuncio. Los flags `*_editada`
marcan que el asesor tocó el texto a mano, para avisarle antes de pisarlo al regenerar.

> La migración **no se aplica sola**: se aplica por Management API (`SUPABASE_API_KEY_MANAGEMENT`
> del `.env`, endpoint `/database/query`), como el resto del repo.

### 3.2 Contenido de los tres bloques `jsonb`

**`perfil`** (todo opcional — alimenta autoridad y prueba social):

| Campo | Pregunta en pantalla |
|---|---|
| `anios_experiencia` | ¿Cuántos años hace que trabajás en el rubro? |
| `matricula` | Matrícula / colegio (si corresponde) |
| `zona_dominio` | ¿En qué zona conocés cada cuadra? |
| `especialidad` | ¿En qué te especializás? (ej. departamentos usados en Caballito) |
| `operaciones_cerradas` | ¿Cuántas operaciones cerraste en tu carrera? |
| `casos_reales` | 2 o 3 casos reales: zona, qué pasó y el resultado |
| `servicio_incluye` | ¿Qué incluye tu servicio? |
| `no_prometer` | ¿Qué NO se puede prometer nunca en tus anuncios? |

**`captacion`** (obligatorio — las 6 del documento):

| Campo | Pregunta en pantalla |
|---|---|
| `propiedades_vendidas_6m` | En los últimos 6 meses, ¿cuántas propiedades vendiste? |
| `porcentaje_acm` | ¿A qué % promedio del valor de tu ACM se cerraron? |
| `diferencial_confianza` | ¿Qué herramienta o proceso exclusivo usás para que el propietario confíe en tu ACM y tu estrategia? |
| `compradores_activos` | ¿Cuántos compradores activos tenés hoy buscando en tu base? |
| `tiempo_entrega_acm` | Desde que visitás la propiedad, ¿en cuánto entregás el ACM completo y el plan de acción? |
| `tiempo_primera_oferta` | Desde que sale al mercado, ¿cuánto tardás en conseguir la primera reserva u oferta formal? |
| `diferencial_esfuerzo` | ¿Qué tareas, fricciones o costos asumís vos al 100% para que el dueño no mueva un dedo hasta la firma? |

**`venta`** (obligatorio — las 5 del documento):

| Campo | Pregunta en pantalla |
|---|---|
| `diferencial_confianza` | ¿Qué hacés distinto para garantizarle al comprador que es un negocio seguro y al precio correcto? |
| `rebaja_promedio` | ¿Qué % de rebaja promedio negociás sobre el precio de lista? |
| `exclusivas_offmarket` | ¿Cuántas de tus propiedades son exclusivas u off-market? |
| `tiempo_primera_seleccion` | Después de conocer sus necesidades, ¿cuánto tardás en mandarle la primera selección curada? |
| `semanas_hasta_reserva` | ¿En cuántas semanas promedio tu comprador encuentra y reserva? |
| `diferencial_esfuerzo` | ¿Qué dolores de cabeza burocráticos o logísticos le sacás de encima? |

Todos los campos se guardan como **texto libre** (admiten "48 hs", "~7%", "más de 300"): pedir
números puros agrega fricción y no mejora el resultado, porque el destino es un prompt.

Validación: `captacion` y `venta` completos (mínimo 2 caracteres por campo) para poder generar las
ofertas. `perfil` nunca bloquea.

### 3.3 `copy_drafts.content` para guiones (sin migración)

`content` ya es `jsonb`. Los guiones nuevos guardan:

```jsonc
{
  "estructura": "variante_1",
  "hook": "frase de los primeros 3 segundos",     // se conserva: la usan la tarjeta del historial y la generación de imagen del post
  "duracion_estimada": 45,                         // segundos, suma de los bloques
  "bloques": [
    {
      "id": "oferta",
      "titulo": "Oferta",
      "texto": "lo que el asesor dice a cámara",
      "segundos": 8,
      "indicacion": "mirando a cámara, tono seguro, sin apurarte",
      "por_que": "abrir con la oferta filtra: el que sigue mirando ya se interesó"
    }
  ]
}
```

Los borradores viejos (sin `bloques`) siguen guardándose y mostrándose como hoy.

---

## 4. Estructuras de guion

Módulo nuevo `lib/marketing-ia/estructuras.ts` — catálogo puro, sin dependencias, testeable:

```ts
export type EstructuraId = 'variante_1' | 'variante_2' | 'aida' | 'pas' | 'bab' | 'storytelling'

export interface BloqueEstructura { id: string; titulo: string; guia: string }
export interface EstructuraGuion {
  id: EstructuraId
  label: string          // lo que ve el asesor
  descripcion: string    // una línea
  cuando_usarla: string  // ayuda en la UI
  bloques: BloqueEstructura[]
}

export const ESTRUCTURAS: Record<EstructuraId, EstructuraGuion>
export function sugerirEstructura(nivel: ConsciousnessLevel): EstructuraId
```

| `id` | Label | Bloques |
|---|---|---|
| `variante_1` | Variante 1 — Oferta primero | Oferta · Problema · Solución · Prueba social · CTA |
| `variante_2` | Variante 2 — Oferta y prueba social | Oferta · Prueba social · Problema · Solución · CTA |
| `aida` | AIDA | Atención · Interés · Deseo · Acción |
| `pas` | PAS | Problema · Agitación · Solución · CTA |
| `bab` | Antes – Después – Puente | Antes · Después · Puente · CTA |
| `storytelling` | Caso real / Storytelling | Situación · Conflicto · Qué hicimos · Resultado · CTA |

> A PAS, BAB y Storytelling se les agrega un bloque final de **CTA** aunque la fórmula clásica no lo
> incluya: un anuncio sin llamada a la acción no convierte. En AIDA el CTA **es** el bloque "Acción".

**"Sugerida"** (opción por defecto) es determinista según el nivel de consciencia del IPC:

| Nivel | Estructura | Por qué |
|---|---|---|
| 0 — Inconsciente | `pas` | Hay que crear el problema antes de ofrecer nada. |
| 1 — Consciente del problema | `bab` | Ya siente el dolor: mostrarle el después. |
| 2 — Consciente de la solución | `aida` | Sabe que hay soluciones: posicionar la nuestra. |
| 3 — Consciente del producto | `variante_2` | Nos conoce y duda: oferta + prueba social arriba mata la objeción. |
| 4 — Muy consciente | `variante_1` | Está listo: oferta directa y CTA. |

`storytelling` queda solo como elección manual (no se sugiere sola: depende de tener un caso real
cargado en el perfil).

El nivel sale de `ipc.flow_data.nivel_conciencia` mapeado con la tabla que hoy vive duplicada en
`generate-copy/route.ts:185`. Se extrae a `lib/marketing-ia/niveles.ts` y la usan los dos endpoints.

> **Arreglo de arrastre incluido:** hoy `generate-batch` ignora el nivel de consciencia del perfil y
> siempre usa el nivel 1 (`generate-batch/route.ts:26`). Pasa a leerlo del IPC, como ya hace
> `generate-copy`.

**PAS estructura vs. PAS ángulo:** el ángulo gobierna el enfoque/tono (dolor, transformación, datos);
la estructura gobierna el orden de los bloques. Si el asesor elige estructura PAS, las 3 variantes
siguen diferenciándose por ángulo. Se aclara en el texto de ayuda del selector.

---

## 5. Generación de las 2 ofertas

Endpoint nuevo `app/api/marketing-ia/generar-oferta/route.ts`:

```
POST /api/marketing-ia/generar-oferta
body: { objetivo?: 'ambas' | 'captacion' | 'venta' }   // default: 'ambas'
```

1. `requireTenant()` → `userId`, `agencyId`.
2. Lee `advisor_operations` del usuario. Si faltan campos obligatorios → **400** con el mensaje
   "Completá los pasos de Captación y Venta antes de generar tus ofertas" (sin consumir crédito).
3. `consumeAiCredits("marketing_ia", 1, "Generar ofertas irresistibles")`.
4. Arma el prompt (base: el del documento de referencia) con:
   - la fórmula de Hormozi (Resultado Soñado × Probabilidad de Éxito ÷ Retraso × Esfuerzo),
   - los datos del formulario, **solo los campos completos**,
   - la directiva creativa de la agencia (`agencies.marketing_ai_config.creative_directive`),
   - español rioplatense (voseo), como el resto del módulo,
   - **regla anti-invento**: prohibido usar cifras, plazos, testimonios o garantías que no estén en
     los datos provistos; prohibido contradecir el campo `no_prometer`.
5. `prismaIA.generateContent(prompt)` y parseo de JSON `{ oferta_captacion, oferta_venta }` con la
   extracción robusta que ya usan los otros endpoints (`match(/\{[\s\S]*\}/)`).
6. Registra el costo real: `tokensFromUsage` + `calculateCost({ model: "gemini-3.5-flash", ... })` +
   `updateAiTransactionCost(txId, ...)`, igual que `generate-batch`.
7. Guarda las ofertas, pone `ofertas_generadas_at = now()` y baja a `false` el flag `*_editada` de
   las que se regeneraron.

El **guardado del formulario** no pasa por endpoint: el componente hace `upsert` directo con el
cliente de Supabase (`onConflict: 'user_id'`) protegido por RLS, igual que hace `ipc-form.tsx` con
`ipc_profiles`. Un endpoint solo agregaría capas para un CRUD que RLS ya cubre.

---

## 6. Inyección en los anuncios

Módulo nuevo `lib/marketing-ia/operacion-context.ts`, gemelo del `property-context.ts` que ya existe:

```ts
export function buildOperacionDirective(
  op: AdvisorOperation | null,
  tipoIpc: 'captar' | 'vender'
): string
```

- `op === null` o sin oferta para ese tipo → devuelve `""` → **el prompt queda idéntico al de hoy**
  (retrocompatibilidad total para quien todavía no cargó nada).
- Con datos, devuelve un bloque con:
  1. **OFERTA IRRESISTIBLE DEL ASESOR** — la de `captacion` si el IPC es `captar`, la de `venta` si
     es `vender`; es la columna vertebral del mensaje.
  2. **DATOS DUROS VERIFICADOS** — lista con los campos completos que correspondan a ese tipo, más
     el bloque `perfil` (años, zona, casos reales, qué incluye el servicio).
  3. **REGLAS** — usar solo esos números; no inventar cifras, plazos, testimonios ni garantías; no
     contradecir `no_prometer`.

Lo consumen `generate-batch/route.ts` y `generate-copy/route.ts` con una lectura extra:

```ts
const { data: operacion } = await supabase
  .from('advisor_operations').select('*').eq('user_id', userId).maybeSingle()
```

---

## 7. UI

### 7.1 Pestaña "Mi Forma de Trabajar"

Se agrega en `app/asesor/marketing-ia/page.tsx` (pasa a 5 pestañas) y
`app/director/marketing-ia/page.tsx` (pasa a 6). La `TabsList` ya scrollea en horizontal
(`overflow-x-auto`), así que en celular no se rompe.

Componentes nuevos, separados para que ningún archivo crezca de más:

- `components/marketing-ia/forma-trabajo-form.tsx` — los pasos 1 a 3 con el `MarketingIAStepper` que
  ya usa el IPC, validación con `zod` + `react-hook-form` (mismo patrón que `ipc-form.tsx`),
  guardado parcial (se puede dejar a medias y volver).
- `components/marketing-ia/ofertas-irresistibles.tsx` — el paso 4: botón "Generar mis 2 ofertas"
  (avisa que consume 1 crédito), las dos ofertas en cuadros editables con "Guardar" y "Regenerar",
  fecha de generación y cartel de "editada a mano" cuando corresponde. Regenerar una oferta editada
  a mano pide confirmación.

Aviso visible en los pasos de Captación y Venta: *"Estos números van a salir publicados en tus
anuncios. Cargá los reales."*

### 7.2 Crear Anuncio (`copy-generator-flow.tsx`)

- **Selector de estructura**, visible solo cuando el tipo de copy es *Video*: "Sugerida" por defecto
  + las 6, cada una con su línea de "cuándo usarla".
- Con *Video* seleccionado se **ocultan** los selectores de Formato de imagen y Estilo visual, y el
  flujo **no llama a `/api/marketing-ia/generate-image`**. El botón dice "Generar 3 guiones".
- Con *Post* todo queda igual que hoy (copy + imagen).
- Aviso cuando el asesor todavía no cargó su forma de trabajar: *"Tus anuncios van a salir genéricos
  hasta que completes Mi Forma de Trabajar"*, con link a la pestaña.

### 7.3 Historial (`marketing-history.tsx`)

Hoy renderiza los guiones con una lista fija de campos (`marketing-history.tsx:442`) y arma el
"Copiar Todo" con esos mismos campos (`:237-244`); además toda tarjeta espera una imagen y muestra un
placeholder de "sin imágenes" (`:320-325`). Cambia a:

- Si `content.bloques` existe → se muestran los bloques con su título real, y debajo de cada uno los
  segundos, la indicación de tono y el "por qué va acá". Si no existe → se muestra como hoy
  (borradores viejos intactos).
- Encabezado del guion: estructura · ángulo · duración total.
- Las generaciones de video se muestran como **guion** (sin marco de imagen ni placeholder roto).
- Dos botones: **"Copiar para teleprompter"** (hook + textos hablados, nada más) y **"Copiar
  completo"** (con segundos, indicaciones y explicaciones).
- La edición manual sigue funcionando: se editan los `texto` de cada bloque.

---

## 8. Archivos

**Nuevos**

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/<ts>_advisor_operations.sql` | Tabla + RLS |
| `types/marketing-ia.ts` (ampliación) | `AdvisorOperation`, `EstructuraId`, `BloqueGuion`, `CopyContent` con `bloques` |
| `lib/marketing-ia/estructuras.ts` | Catálogo de las 6 + `sugerirEstructura` |
| `lib/marketing-ia/estructuras.test.ts` | Tests del catálogo y la sugerencia |
| `lib/marketing-ia/niveles.ts` | Mapa de nivel de consciencia (hoy duplicado) |
| `lib/marketing-ia/operacion-context.ts` | Bloque de prompt con oferta + datos duros |
| `lib/marketing-ia/operacion-context.test.ts` | Tests del bloque de prompt |
| `app/api/marketing-ia/generar-oferta/route.ts` | Genera/regenera las 2 ofertas |
| `components/marketing-ia/forma-trabajo-form.tsx` | Formulario (pasos 1-3) |
| `components/marketing-ia/ofertas-irresistibles.tsx` | Ofertas (paso 4) |

**Modificados**

| Archivo | Cambio |
|---|---|
| `app/asesor/marketing-ia/page.tsx` | Pestaña nueva |
| `app/director/marketing-ia/page.tsx` | Pestaña nueva |
| `components/marketing-ia/copy-generator-flow.tsx` | Selector de estructura; video sin imágenes |
| `components/marketing-ia/marketing-history.tsx` | Render dinámico de bloques; 2 botones de copiar; video sin marco de imagen |
| `app/api/marketing-ia/generate-batch/route.ts` | Oferta + datos duros; estructura; nivel real del IPC |
| `app/api/marketing-ia/generate-copy/route.ts` | Oferta + datos duros; estructura; usa `niveles.ts` |

---

## 9. Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Asesor sin forma de trabajar cargada | Todo funciona como hoy; aviso con link en Crear Anuncio. |
| Formulario incompleto al generar ofertas | 400 con mensaje claro, **sin consumir crédito**. |
| La IA devuelve JSON inválido | Mismo manejo que los endpoints actuales: 500 con mensaje y log del texto crudo. El crédito ya se consumió (comportamiento actual del módulo, no se cambia acá). |
| Regenerar una oferta editada a mano | Confirmación explícita antes de pisarla. |
| Guion con menos bloques de los que pide la estructura | Se muestra lo que vino; los bloques faltantes no rompen el render. |
| Borradores viejos sin `bloques` | Se renderizan con el formato anterior. |
| Sin créditos IA | Lo maneja `consumeAiCredits` como en el resto del módulo. |

## 10. Verificación

Tests automáticos (`npm test`, vitest ya barre `lib/**/*.test.ts`):

- `estructuras.test.ts`: las 6 tienen bloques y terminan en CTA; `sugerirEstructura` es determinista
  para los 5 niveles y nunca devuelve `storytelling`.
- `operacion-context.test.ts`: sin operación devuelve `""`; con IPC `captar` inyecta la oferta de
  captación y no la de venta (y viceversa); omite los campos vacíos; incluye siempre la regla
  anti-invento y el `no_prometer`.

Prueba real en el navegador (escritorio y celular con emulación de dispositivo), entrando con la
cuenta de director de Leonardo — nunca con la de un asesor real:

1. Cargar la forma de trabajar completa y guardarla a medias primero (verificar que persiste).
2. Generar las 2 ofertas; comprobar que **cada número que aparece es exactamente uno de los
   cargados** y que no aparecen cifras inventadas.
3. Editar una oferta a mano, guardar, regenerar la otra y verificar que la editada no se pisó.
4. Generar guiones de video contra un IPC de `captar` y otro de `vender`, con las 6 estructuras y con
   "Sugerida": verificar el orden de los bloques, que no se genere ninguna imagen y que la oferta
   correcta esté adentro.
5. Generar un post y verificar que sigue saliendo con imagen, como siempre.
6. Historial: guion nuevo (bloques + segundos + por qué), anuncio viejo (formato anterior intacto),
   y los dos botones de copiar.
7. Revisar el costo registrado en Finanzas para las generaciones nuevas.

## 11. Documentación a actualizar al cerrar

`docs/interno/TECNICO-PRISMA.md`, `docs/interno/LOGICA-PRISMA.md`, `PROGRESO.md` y la guía funcional
del asesor/director (con el paso a paso de "Mi Forma de Trabajar" en lenguaje no técnico).
