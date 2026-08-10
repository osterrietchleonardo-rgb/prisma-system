# Marketing: contenido con voz humana, autoridad y sin repetición

**Fecha:** 10-ago-2026
**Rama:** `feat/marketing-voz-humana` (worktree `prisma-wt-marketing-voz`, desde `main` @ 71b1bc3)
**Alcance:** módulo Marketing de admin-vakdor (app) + `Prisma - MK/marketing-worker`

---

## 1. El problema

El contenido que genera el módulo suena robótico, repetitivo y sin autoridad. No es una impresión: hay seis causas concretas en el código.

| # | Causa | Dónde |
|---|---|---|
| 1 | El modelo es el más barato disponible (`gemini-3.5-flash`), que escribe correcto y plano | `lib/admin-vakdor/marketing/claude.ts:3`, `marketing-worker/watch.mjs:40` |
| 2 | Una sola plantilla para todas las piezas (hook → fricción → quiebre → solución → prueba → CTA), inyectada en post, carrusel y lead magnet | `marketing-worker/content.mjs:17` |
| 3 | La anti-repetición solo manda **títulos y ángulo** de las últimas 60 ideas; el modelo nunca ve el texto que ya escribió | `lib/admin-vakdor/marketing/store.ts:153` |
| 4 | Los "insights" son un ranking de la **primera línea recortada a 90 caracteres** + engagement. No analiza *por qué* funcionó | `marketing-worker/insights.mjs:41` |
| 5 | No hay ninguna materia prima para storytelling: ni escenas, ni casos, ni situaciones del rubro | (ausente) |
| 6 | CTAs hardcodeados que no son los deseados: `"Comentá SISTEMA"`, `"CTA a /call"`; `vakdor.com/demostracion` no aparece en ningún prompt | `content.mjs:127`, `content.mjs:106` |

A eso se suma que el primer comentario se pide con una instrucción de una línea (`"pregunta o dato crudo"` + link), y por eso sale flojo y siempre pidiendo algo.

## 2. El objetivo

Que cada pieza se lea como la escribió alguien que está en el rubro: con una escena concreta, una posición propia, un giro de razonamiento y un cierre que corresponde a la etapa del embudo. Sin depender de datos personales de Leonardo — el material es **el rubro**, no su biografía.

La referencia de voz son los guiones de video que ya validó. Ejemplo:

> "Hablo con directores de inmobiliarias que me dicen 'yo tengo treinta años en el rubro, a mí un software no me va a enseñar a vender'. Y tienen razón. El software no te enseña a vender. Lo que hace el software es que el pibe nuevo de la inmobiliaria de enfrente, que empezó hace seis meses, te robe tres ventas esta semana porque él sí le contestó al cliente en dos minutos un sábado a la noche."

Los seis rasgos replicables de ese texto:

1. **Escena concreta primero**, no tesis abstracta.
2. **Posición fuerte**, aun a costa de incomodar.
3. **Giro de concesión**: le da la razón al lector y ahí se la da vuelta.
4. **Vivencia de campo sin inventar datos** ("hablo con directores que me dicen…").
5. **Detalle específico** (sábado a la noche, dos minutos, seis meses, tres ambientes).
6. **Cierre en la consecuencia**, no en un pedido.

## 3. Decisiones tomadas

| Decisión | Elección |
|---|---|
| Modelo | **Claude Sonnet 5** (`claude-sonnet-5`) en ambos motores |
| Materia prima de storytelling | Banco de escenas del rubro (no datos personales) |
| Link del CTA BOFU | CTA en el cuerpo, **link limpio en el primer comentario** |

---

## 4. Diseño

### 4.1 Modelo: Sonnet 5 en la app y en el worker

Ambos motores vuelven al SDK oficial de Anthropic (`@anthropic-ai/sdk`), que ya se usaba antes del cambio a Gemini.

- Modelo: `claude-sonnet-5`.
- `thinking: { type: "adaptive" }` (es el default en Sonnet 5; se declara explícito para que se lea en el código).
- `output_config.effort`: por defecto para redacción; `"low"` para las tareas mecánicas (clasificar posts en el análisis diario).
- `max_tokens` ≤ 8000 → sin streaming (el umbral de timeout está en ~16000).
- **Prompt caching** (`cache_control: {type: "ephemeral"}`) en el bloque de skills de `skills.mjs`. Recupera el ahorro que ya estaba verificado: el bloque de ~85.000 caracteres se escribe una vez por ráfaga y después se lee al 10% del precio. Gemini no tenía este mecanismo.

**Requisito previo:** `ANTHROPIC_API_KEY` presente en el `.env` local, en el worker (EasyPanel) y en **Vercel** (con redeploy, porque las env vars no aplican hasta el siguiente deploy).

**Costo esperado:** ~US$0,05 de generación + ~US$0,02 de revisión = **~US$0,07 por pieza**. A 10 piezas por día, ~US$21/mes.

### 4.2 Canon de voz y rotación de estructuras

Se elimina `ESTRUCTURA_LINKEDIN` como molde único. En su lugar:

**a) Canon de voz** — las seis reglas de la sección 2, redactadas como instrucción dura, más el vocabulario argentino natural del rubro.

**b) Ocho estructuras narrativas**, una por pieza, en rotación sin repetir hasta agotarlas:

| Estructura | Forma |
|---|---|
| `confesion` | Un error o creencia propia que resultó equivocada, y qué la corrigió |
| `concesion_vuelta` | "Tenés razón… y por eso mismo el problema es otro" |
| `escena_campo` | Una situación observada, contada como si el lector estuviera ahí |
| `contraste` | Dos perfiles enfrentados (los 30 años vs. el que empezó hace seis meses) |
| `autopsia` | Un caso que salió mal, desarmado paso por paso |
| `mito_realidad` | Lo que se dice en el rubro vs. lo que pasa |
| `carta_director` | Se le habla directo a una persona concreta, en segunda persona |
| `numero_duele` | Un número del negocio y todo lo que ese número implica |

La estructura elegida **se guarda en la idea**, de modo que la rotación es determinista y no queda al criterio del modelo.

### 4.3 Banco de recursos (tabla `marketing_recursos`)

Tabla nueva en Supabase, fuente única de verdad leída por la app **y** por el worker (el worker corre en EasyPanel y la app en Vercel: no pueden compartir archivos, sí la base).

```sql
create table marketing_recursos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('canon','estructura','escena','comentario')),
  clave        text,                  -- ej. 'concesion_vuelta', 'dato_crudo'
  titulo       text not null,
  detalle      text not null,
  tags         text[] default '{}',
  activo       boolean not null default true,
  usos         integer not null default 0,
  ultimo_uso   timestamptz,
  created_at   timestamptz not null default now()
);
create index on marketing_recursos (tipo, activo);
```

Contenido inicial (semilla en la migración):

- `canon` — 1 fila con las reglas de voz.
- `estructura` — las 8 de arriba.
- `comentario` — los 5 tipos de primer comentario (§4.6).
- `escena` — **~30 situaciones concretas del rubro**. Ejemplos: la consulta por un tres ambientes contestada con un menú automático; el lead del portal que entró un sábado a la noche y se contestó el lunes; el asesor que se va y la cartera se va en su celular; el Excel paralelo que lleva cada asesor; el director que se entera de una operación caída por un comentario de pasillo; el "te confirmo y te aviso" que nunca vuelve.

El generador toma 1-2 escenas por pieza, incrementa `usos` y sella `ultimo_uso`.

**Selección determinista:** entre los recursos activos del tipo pedido, se ordena por `usos` ascendente y `ultimo_uso` ascendente (nulls primero), se excluyen los usados en las últimas N piezas, y se toma el primero. Si el banco se agota, se recicla el menos usado (nunca bloquea la generación).

**Fallback:** si la tabla está vacía o falla la lectura, se usa un canon mínimo hardcodeado y la pieza se genera igual (falla suave, como los insights hoy).

### 4.4 Memoria real anti-repetición

Reemplaza a `resumenParaMemoria()` para la etapa de desarrollo (se conserva para la generación de ideas, donde los títulos alcanzan).

Función nueva `textosRecientes(limite = 15)` en `store.ts`: trae las últimas 15 piezas con `contenido` no vacío y arma, por cada una:

- la **primera línea** (el hook, completo, sin recortar);
- los primeros ~400 caracteres (el argumento de entrada);
- la `estructura` y las `escenas` usadas (de la receta guardada).

Se inyecta con la instrucción explícita: *no repitas apertura, argumento central, escena ni estructura de estas piezas*.

**Chequeo de solapamiento (sin costo de API):** se normaliza el hook nuevo (minúsculas, sin tildes ni puntuación), se arman trigramas de palabras y se compara por coeficiente de Dice contra los hooks previos. Si supera **0,45**, se regenera una vez señalando cuál se estaba pareciendo. Un solo reintento; si vuelve a pasar, se deja pasar y se registra en el historial de la idea.

### 4.5 Insights v2: patrones, no ranking

`insights.mjs` deja de emitir "top 5 / bottom 3 de hooks recortados a 90 caracteres".

Nuevo flujo, una vez por día (cacheado en `marketing_insights`, igual que hoy):

1. Traer de Buffer los posts enviados con métricas (ya funciona).
2. **Una sola llamada** a Sonnet 5 (`effort: "low"`) que clasifica cada post en un JSON: `{ apertura, estructura, tema, cta, tiene_giro }` — donde `apertura ∈ escena | tesis | pregunta | dato | anécdota`.
3. Cruzar cada dimensión con el engagement y quedarse con los contrastes que tengan al menos 3 posts por lado.
4. Guardar el análisis estructurado en `marketing_insights.data` y el resumen en `resumen`.

El resumen pasa de *"este post hizo 6,85%"* a *"las aperturas con escena concreta promedian el triple de engagement que las aperturas con tesis; los posts con giro de concesión concentran los comentarios; los temas de producto rinden por debajo del promedio"*. Eso sí orienta la escritura.

### 4.6 CTA por etapa y primer comentario con autoridad

Se eliminan los CTA hardcodeados `"Comentá SISTEMA"` (`content.mjs:127`) y `"CTA a /call"` (`content.mjs:106`).

| Etapa | Objetivo del cierre | Producto | Link |
|---|---|---|---|
| **TOFU** | Tomar conciencia del problema. Cierre en la consecuencia o en una pregunta que deja pensando. | No se nombra | No |
| **MOFU** | Entender el mecanismo (Método P-R-I-S-M-A). Cierre que invita a ver cómo se resuelve. | Se nombra como camino | No |
| **BOFU** | Empujar a la demostración: "lo mostré entero en el video". El cuerpo dice **qué van a ver y qué duda les resuelve**. | Sí | `https://vakdor.com/demostracion` **en el primer comentario** |

Se mantiene la regla de LinkedIn: **sin links en el cuerpo** (bajan el alcance).

**Primer comentario — 5 tipos en rotación**, ya no siempre un CTA:

| Tipo | Qué es |
|---|---|
| `dato_crudo` | Un número real con el contexto que lo hace doler |
| `opinion_filosa` | Una postura más dura que la del post (controversia acotada, no agravio) |
| `matiz` | La excepción que nadie dice: "esto no aplica si…" — es el que más autoridad da |
| `micro_caso` | La escena en tres líneas, sin moraleja |
| `pregunta_binaria` | Una pregunta concreta de dos opciones (nunca "¿y vos qué opinás?") |

El link solo aparece en BOFU, al final del comentario, sin ruego.

### 4.7 Paso de revisión contra rúbrica

Después de escribir, una segunda llamada corta evalúa la pieza y devuelve `{ aprobado, fallos[] }`. Si no aprueba, **una** reescritura señalando los fallos (nunca más de un ciclo, para que la rúbrica no se convierta en la nueva plantilla).

Rúbrica:

1. La primera línea es una escena o situación concreta, no una tesis abstracta.
2. Hay una posición: se afirma algo que alguien podría discutir.
3. Hay un giro (concesión y vuelta, o expectativa rota).
4. Hay al menos dos detalles específicos (una hora, un día, un número, un tipo de propiedad, un plazo).
5. No repite apertura, argumento ni escena de la memoria.
6. El CTA corresponde a la etapa y el link está donde corresponde.
7. Cero muletillas de IA de la lista.

**Lista de muletillas a evitar:** "en un mundo donde", "hoy más que nunca", "la realidad es que", "no es casualidad que", "el secreto está en", "imaginá por un momento", "y acá está la clave", "spoiler:", "déjame decirte", "aprovechar al máximo", "revolucionar", "potenciar", "sinergia", tríos de adjetivos, y cierres tipo "¿Y vos, qué opinás?".

> **Excepción explícita:** la fórmula **"X no es Y"** NO se prohíbe. Es la del post de mayor rendimiento histórico ("Automatizar no es poner un bot", 3.280 impresiones, 30-jun-2026). Prohibirla por parecer un tic de IA sería tirar el mejor patrón propio.

### 4.8 Receta guardada por pieza

Columna nueva `marketing_ideas.receta jsonb`:

```json
{
  "estructura": "concesion_vuelta",
  "escenas": ["<uuid>", "<uuid>"],
  "comentario_tipo": "matiz",
  "modelo": "claude-sonnet-5",
  "revision": { "aprobado": true, "reintentos": 0 }
}
```

Sirve para tres cosas: la rotación determinista, la memoria anti-repetición, y poder auditar después qué receta produjo los posts que mejor rindieron.

---

## 5. Archivos afectados

**App (`PRISMA-SYSTEM`)**

| Archivo | Cambio |
|---|---|
| `lib/admin-vakdor/marketing/claude.ts` | SDK Anthropic + `claude-sonnet-5` + caching |
| `lib/admin-vakdor/marketing/voz.ts` | *(nuevo)* canon, rúbrica, muletillas, tipos de comentario |
| `lib/admin-vakdor/marketing/recursos.ts` | *(nuevo)* lectura y rotación de `marketing_recursos` |
| `lib/admin-vakdor/marketing/brand-prompt.ts` | CTA por etapa; sin CTA hardcodeados |
| `lib/admin-vakdor/marketing/store.ts` | `textosRecientes()`, lectura/escritura de `receta` |
| `lib/admin-vakdor/marketing/types.ts` | tipos `Receta`, `Recurso`, `EstructuraNarrativa` |
| `app/api/admin-vakdor/marketing/generar/route.ts` | insights v2 + memoria |
| `app/api/admin-vakdor/marketing/[id]/reformular/route.ts` | canon de voz + rúbrica |
| `supabase/migrations/<ts>_marketing_voz.sql` | tabla `marketing_recursos` + semilla + columna `receta` |

**Worker (`Prisma - MK/marketing-worker`)**

| Archivo | Cambio |
|---|---|
| `watch.mjs` | cliente Anthropic; guardar `receta` |
| `content.mjs` | reescritura completa de los tres prompts (post, carrusel, lead magnet) |
| `voz.mjs` | *(nuevo)* espejo del canon con fallback |
| `recursos.mjs` | *(nuevo)* rotación contra la tabla |
| `revision.mjs` | *(nuevo)* rúbrica + chequeo de solapamiento |
| `insights.mjs` | v2 (clasificación + patrones) |

---

## 6. Cómo se prueba

1. Aplicar la migración por Management API (las migraciones del repo no se aplican solas).
2. Levantar `npm run dev` y generar **tres piezas, una por etapa** (TOFU, MOFU, BOFU) sobre la agencia Central (donde hay datos reales).
3. Verificar sobre las piezas generadas:
   - Ninguna arranca con una tesis abstracta; las tres abren con escena.
   - Las tres usan **estructuras distintas** y **escenas distintas**.
   - El CTA de cada una corresponde a su etapa, y el link de `vakdor.com/demostracion` aparece **solo** en la BOFU y **solo** en el primer comentario.
   - Los tres primeros comentarios son de **tipos distintos** y no todos piden algo.
   - Ningún hook se parece a los últimos 15 publicados (el chequeo de Dice queda registrado).
4. Correr el análisis diario de insights y leer el resumen: debe hablar de patrones, no de un ranking.
5. Comparar lado a lado contra una pieza generada con el motor viejo.

## 7. Riesgos y cómo se acotan

| Riesgo | Mitigación |
|---|---|
| El costo sube de centavos a ~US$21/mes | Es la decisión tomada; `effort: "low"` en las tareas mecánicas y caching en el bloque de skills contienen el resto |
| La rúbrica se vuelve la nueva plantilla | Un solo ciclo de revisión; la revisión **señala fallos**, no reescribe el texto entero |
| El banco de escenas se agota y vuelve a repetirse | Se recicla la menos usada, y el banco es ampliable sin deploy (vive en la base) |
| Falta `ANTHROPIC_API_KEY` en Vercel o EasyPanel | Se verifica antes de mergear; sin la clave, error explícito (no falla en silencio) |
| El worker y la app se desincronizan en el canon | Fuente única en `marketing_recursos`; el código solo tiene el fallback mínimo |

## 8. Documentación a actualizar al terminar

- `docs/interno/TECNICO-PRISMA.md` — modelo, tabla nueva, flujo de generación.
- `docs/interno/marketing-handoff.md` — el handoff del módulo.

Merge a `main` solo con OK explícito de Leonardo.
