# ACM · Zona estricta + fotos analizadas por IA

Fecha: 2026-08-06 · Rama: `feat/acm-zona-estricta-y-fotos-ia`

Dos cambios independientes sobre el módulo ACM, agrupados porque los dos tocan el
formulario del sujeto y la búsqueda de comparables.

---

## Parte A — Zona estricta

### Problema (verificado con datos reales)

Un cliente de Central reportó que su asesor le mostró un ACM con comparables de otro
barrio. Es cierto, y no es un bug: el 3-ago-2026 (commit `91244f0`, migración
`20260803180000_acm_zona_niveles_y_superficie.sql`, aplicada en producción) la zona dejó
de ser un filtro binario y pasó a puntuar en tres niveles:

| Nivel | Ejemplo | `zona_score` |
|---|---|---|
| Mismo barrio | Belgrano | 100 |
| Sub-barrio / hermano | Belgrano R, Palermo Soho, Las Cañitas | 70 |
| Barrio limítrofe | Belgrano → Núñez, Saavedra, Colegiales | 50 |

Auditoría de los 36 ACM de Central (`acm_searches`, 24-jul a 6-ago):

- **Antes del 3-ago:** solo aparecían sub-barrios del mismo barrio. Sin mezcla real.
- **Desde el 4-ago:** 13 ACM con barrios limítrofes. Casos concretos — 4-ago 20:07
  Belgrano trajo Coghlan, Colegiales, Núñez, Palermo Hollywood, Saavedra y Villa Ortúzar;
  6-ago 17:17 Belgrano trajo Belgrano C/R, Colegiales, Las Cañitas, Núñez y Saavedra;
  4-ago 15:41 San Telmo trajo Monserrat y San Cristóbal.
- **Volumen:** 70 de 618 comparables (11%) de los ACM de Belgrano son de otro barrio.
- **Impacto en precio:** mediana US$3.790/m² mismo barrio vs US$3.714/m² otro barrio
  (−2%). El valor **no** se distorsiona de forma material en esta muestra.
- **El sistema ya los castiga:** 71% de comparabilidad promedio contra 86% los del mismo
  barrio, así que quedan al fondo de la lista.

**Conclusión:** el problema no es de precisión, es de confianza. El cliente ve "Núñez" en
una tasación de Belgrano y descarta el informe entero.

Nota: el ejemplo que motivó el reporte (Palermo → Núñez) **no puede ocurrir**. Los
limítrofes de Palermo son Recoleta, Villa Crespo, Chacarita, Colegiales, Almagro, Barrio
Norte, Once, Abasto y Parque Centenario.

### Diseño

Casilla **"Incluir barrios linderos"**, **apagada por defecto**, junto a "Considerar PH"
en el formulario del sujeto.

- **Apagada (default):** entran solo `zona_score >= 70` (mismo barrio + sub-barrios).
- **Prendida:** entra todo (`>= 50`), y cada comparable limítrofe muestra un chip
  **"lindero"** al lado del barrio — en la lista de resultados y en la ficha del cliente.

### Implementación

**SQL** (migración nueva, mismo patrón que la anterior: la firma cambia → `drop` +
`create` de las dos funciones):

- Parámetro nuevo `p_zona_min smallint DEFAULT 50` en `acm_match_properties` y
  `acm_match_roomix`. El default preserva el comportamiento actual.
- En el CTE `zonas`, filtrar `r.zona_score >= p_zona_min` en la rama de relacionados.
  La fila del barrio propio (score 100) nunca se filtra.
- El fallback por patrones (`v_usar_zonas = false`) no cambia: ya es de barrio exacto.

**App:**

- `acm-module.tsx`: estado `incluirLinderos` (default `false`), va al body como
  `incluir_linderos`.
- `app/api/acm/comparables/route.ts`: `p_zona_min = body.incluir_linderos ? 50 : 70`.
  Al ausentarse el campo, el comportamiento es **estricto** — es el punto del arreglo.
- `step1-sujeto.tsx`: la casilla.
- `comparables-result.tsx`: chip "lindero" cuando el ítem `zona` del checklist tiene
  `score === 50`. Corregir además el comentario de la línea 124, que todavía afirma que
  la zona es un filtro duro de peso 0 (dejó de serlo el 3-ago: pesa 20).
- `app/api/acm/ficha/route.ts` + `app/ficha-acm/[token]/page.tsx`: el snapshot del
  comparable lleva `zona_score` para poder pintar el mismo chip en el PDF.

---

## Parte B — Fotos analizadas por IA

### Objetivo

Antes de buscar comparables, el asesor puede subir hasta 4 fotos. Una IA con visión
describe la propiedad, el asesor edita el texto, y ese texto (a) afina la búsqueda de
comparables y (b) opcionalmente sale en la ficha que recibe el cliente.

### Por qué funciona (verificado)

- El embedding de cada aviso de la red se arma con **título + descripción + barrio +
  amenities** (`roomix-sync/crawler.mjs:742`), o sea que la descripción del aviso está
  indexada y es matcheable.
- Cobertura real del corpus: **91.820 de 92.030** avisos de venta de la red tienen
  descripción (99,8%), 460 caracteres promedio. La cartera propia, 457 de 459, con 1.757
  caracteres promedio.
- Gemini multimodal ya está probado en el proyecto: `extractTextFromDocument`
  (`lib/gemini.ts:49`) manda `inlineData` en base64 a `gemini-3.5-flash`.

### Decisiones tomadas

1. **Un solo texto, presentable y veraz.** No un análisis técnico crudo y otro de
   marketing. Razón adicional a favor: los avisos de los portales están escritos en ese
   mismo registro ("a refaccionar", "muy luminoso", "apto crédito"), así que un texto
   presentable matchea **mejor** contra el corpus que una nota técnica.
2. **Las fotos no se guardan.** Van en el request, se analizan, se descartan. Sin bucket,
   sin fotos de casas de clientes acumulándose, sin costo de storage. En "Mis ACM" queda
   el texto.
3. **El análisis se hace una sola vez.** No hay botón de "volver a analizar". Si el
   resultado no gusta, se edita a mano. (Un fallo de red o de la API no cuenta como
   análisis: ahí sí se puede reintentar.)
4. **Casilla "Incluir esta descripción en la ficha del cliente"**, prendida por defecto.
5. **Peso en la búsqueda:** el parecido descriptivo pasa de 10 a 20 puntos sobre un total
   de ~130, o sea de ~8% a ~15%, **solo si hay descripción**. (Los pesos se redistribuyen
   cuando falta algún dato, así que el porcentaje exacto varía por comparable.) Sin fotos,
   el ACM se comporta idéntico a hoy.

### Flujo

```
[ Formulario del sujeto ]
        │
        ├── Fotos (0 a 4, opcional)  ──┐
        ├── "¿En qué enfocarse?" ──────┤
        │                              ▼
        │                   POST /api/acm/analizar-fotos
        │                     (Gemini 3.5-flash visión)
        │                              │
        │                              ▼
        │                   Descripción EDITABLE por el asesor
        │                   [x] Incluir en la ficha del cliente
        │                              │
        ▼                              ▼
[ Buscar comparables ] ── POST /api/acm/comparables
                              · descripción → texto del embedding
                              · peso semántico 10 → 20
                              · sujeto.descripcion_ia al historial
                                       │
                                       ▼
                          [ Ficha del cliente (portada) ]
```

### Interfaz

En `step1-sujeto.tsx`, arriba del botón "Buscar comparables":

- Bloque **"Fotos de la propiedad (opcional)"**: selector múltiple de imágenes, máximo 4,
  vista previa en miniatura con botón de quitar. Formatos `image/jpeg|png|webp`.
- Las imágenes se **redimensionan en el navegador** a 1280px de lado mayor y JPEG calidad
  0.82 mediante `canvas` antes de enviarse. Baja el tiempo de subida y el costo, y evita
  chocar con el límite del body de la request.
- Campo **"¿En qué querés que se enfoque el análisis?"** (opcional, máximo 300
  caracteres), con ejemplos como placeholder: "estado de la cocina y los baños",
  "luminosidad y vista", "calidad de las terminaciones".
- Botón **"Analizar fotos con IA"**, deshabilitado sin fotos. Tras un análisis exitoso el
  botón desaparece y queda el resultado.
- **Cuadro de texto editable** con el resultado y contador de caracteres, más la casilla
  "Incluir esta descripción en la ficha del cliente".

### Endpoint `POST /api/acm/analizar-fotos`

- `requireTenant()`; `dynamic = "force-dynamic"`; `maxDuration = 60`.
- Body: `fotos` (array de `{ data: base64, mimeType }`, máximo 4), `foco` (string ≤300),
  y los datos ya cargados del sujeto (tipo, barrio, m², ambientes, dormitorios, baños).
- Valida: máximo 4 imágenes, mime en la lista blanca, peso total ≤6 MB. Rechaza con 400 y
  mensaje claro.
- Llama a `gemini-3.5-flash` con las imágenes como `inlineData` más el prompt.
- Devuelve `{ descripcion }`. **No persiste las imágenes en ningún lado.**

### Prompt

Reglas duras, en el system/instrucción:

Análisis visual previo: Observá detenidamente las imágenes buscando indicadores de luminosidad (fuentes de luz natural, sombras), estado de conservación (pisos, paredes, humedad) y distribución espacial.

Describí únicamente lo que se ve en las fotos basándote en el análisis anterior. Si algo no se ve, no lo afirmes.

Nunca contradigas los datos cargados del sujeto (te los paso como contexto).

Tono de aviso profesional argentino, español rioplatense. Sin superlativos vacíos ("espectacular", "único", "soñado"), sin signos de exclamación.

No omitas ni disimules lo que está deteriorado, pero decilo con honestidad y sin castigar: "cocina original, con posibilidad de actualización" en lugar de "cocina vieja" o de no mencionarla.

Sin precio, sin datos de contacto, sin nombre de inmobiliaria.

Entre 400 y 600 caracteres, en un solo párrafo corrido.

Si el asesor indicó un foco, priorizalo sin ignorar el resto de las características clave.

**Formato de salida (contrato duro):** el análisis visual previo es un paso **interno**.
Devolvé **únicamente el párrafo final**, sin encabezados, sin viñetas, sin repetir las
consignas y sin prefijos del tipo "Análisis:" o "Descripción:". Nada de markdown.

Detalles de armado del prompt en el código:

- La cantidad de imágenes se interpola según cuántas subió el asesor (1 a 4). **Nunca
  hardcodear "4"**: si el prompt afirma que hay más fotos de las que hay, el modelo
  completa el hueco y describe ambientes que no vio.
- El servidor sanea la respuesta antes de devolverla: quita cercos de markdown y, si
  aparece un prefijo tipo `Análisis…` / `Descripción:`, se queda con el último párrafo.
  Es la red de seguridad por si el modelo igual filtra el paso previo — el asesor nunca
  debería ver el andamiaje del prompt en el cuadro de texto.

### Cómo afina la búsqueda

- `lib/acm/subject.ts` · `sujetoToEmbeddingText()` concatena la descripción al final del
  texto que se embebe con `RETRIEVAL_QUERY`.
- Parámetro SQL nuevo `p_peso_semantica smallint DEFAULT 10` en ambas funciones de
  matching, que reemplaza el `10` fijo del `w_sem`. El route manda **20** cuando hay
  descripción y **10** cuando no. El default preserva el comportamiento actual.
- `lib/acm/checklist.ts` · `buildChecklist()` recibe el peso semántico usado, para que el
  checklist muestre el número real y no una constante desactualizada.

### Persistencia

`acm_searches.sujeto` es `jsonb`, así que **no hace falta migración** para el historial:

- `sujeto.descripcion_ia` (string)
- `sujeto.incluir_desc_ficha` (boolean)

Sí hay que sumar los dos campos al tipo `Sujeto` en `lib/tasacion/types.ts`.

### La descripción en la ficha (que no se pase de la hoja)

Se renderiza en la **portada**, debajo del bloque "Propiedad de referencia". Medición: el
contenido actual de la portada ocupa poco más de la mitad del A4, quedan unos 570px libres
antes del pie. Un texto de 400-600 caracteres entra con aire de sobra.

Aun así se aplica el **mismo mecanismo de dos capas que ya usa `.comp-desc`** para las
descripciones de los comparables, que es lo que hoy garantiza una hoja por propiedad:

1. **Presupuesto al generar:** el prompt pide 400-600 caracteres y el servidor recorta en
   límite de palabra a un tope duro de 700.
2. **Red de seguridad en CSS:** clase `.cover-desc` con `max-height`, `overflow: hidden` y
   `-webkit-line-clamp`, igual que `.comp-desc` (que hoy usa 3 líneas / 47px). Aunque
   alguien pegue a mano un texto larguísimo, la portada **no puede** desbordar.

El campo solo entra al snapshot si `incluir_desc_ficha` es verdadero. Las fichas ya
creadas no tienen el campo y siguen renderizando igual.

### Errores

Si Gemini falla o tarda, se muestra el error y **el ACM sigue funcionando sin
descripción**. El botón "Buscar comparables" nunca queda bloqueado por esto.

### Costo

Cuatro imágenes a 1280px son unos 4.100 tokens de entrada más ~600 de salida. Con la
tarifa real de `gemini-3.5-flash` despejada de la factura (US$1,50 / US$9,00 por millón),
da **alrededor de US$0,01 por análisis**. Despreciable.

---

## Fuera de alcance (YAGNI)

- Guardar las fotos, mostrarlas en la portada o en "Mis ACM".
- Un segundo texto de marketing separado del técnico.
- Regenerar el análisis con otro foco.
- Una perilla en pantalla para que el asesor gradúe el peso de la búsqueda.
- Tocar el mapa de barrios (`acm_barrio_relacion`) o cómo se calcula.

## Riesgos

- **La IA puede equivocarse leyendo una foto y el texto va al cliente.** Tres capas de
  cobertura: el prompt prohíbe afirmar lo que no se ve, el texto es editable antes de
  usarse, y la casilla decide si sale o no en la ficha. El criterio final es del asesor,
  no de la IA, y así hay que comunicárselo al equipo.
- **Zona estricta deja ACM más flacos en barrios de poca oferta.** Mitigado: la casilla
  está a un clic. Si un barrio queda sin comparables, el asesor la prende.
- **El cambio de default altera resultados respecto de ayer.** Es intencional y es el
  pedido. Las búsquedas ya guardadas en "Mis ACM" no se recalculan: guardan su snapshot.

## Pruebas

1. Local con `npm run dev` y datos reales de Central.
2. Zona: un ACM de Belgrano con la casilla apagada no debe traer Núñez ni Saavedra; con la
   casilla prendida los trae y con chip "lindero".
3. Fotos: subir 4 fotos reales de una propiedad de la cartera y comparar el orden de los
   comparables con y sin descripción.
4. Verificar que el prompt no invente: contrastar el texto contra las fotos.
5. Imprimir la ficha con una descripción de 700 caracteres y confirmar que la portada
   sigue siendo **una sola hoja**.

## Documentación a actualizar al cerrar

`docs/interno/LOGICA-PRISMA.md`, `docs/interno/TECNICO-PRISMA.md` y las guías funcionales
de asesor y director.
