# ACM · Fotos desde la cartera + detección de fotos que no son de la propiedad

**Fecha:** 12-ago-2026 · **Rama:** `feat/acm-zona-estricta-y-fotos-ia` (continúa sobre las 10 tareas ya cerradas)

## De dónde sale esto

Sobre la función de fotos+IA ya entregada, Leonardo pidió dos cosas:

1. Que en modo cartera se puedan **elegir 4 de las fotos que la propiedad ya tiene**, en vez de subirlas a mano.
2. Que la descripción por fotos sirva para **afinar los comparables** que ya superan el 90%, analizando 4 fotos de cada uno.

Lo primero se construye tal cual. **Lo segundo se descartó por evidencia**, y en su lugar sale algo distinto que sí funciona. Ver "Lo que se midió y por qué el afinado no va".

---

## Feature A — Elegir hasta 4 fotos desde la cartera

**Qué hace:** cuando el sujeto viene de la cartera, sus fotos aparecen en una grilla y el asesor tilda hasta 4. Subir archivos a mano sigue funcionando; las dos fuentes conviven (4 en total, de donde sea).

**Alcance:** solo modo cartera. En modo link y manual el asesor sube las fotos a mano — decisión explícita de Leonardo, que además evita tocar `lib/acm/extract.ts` y `roomix-sync/extractor-server.mjs` (el pipeline de link hoy **no captura imágenes en ningún lado**: ni `og:image`, ni JSON-LD, ni el extractor con navegador; verificado).

**Por qué es barato:** `GET /api/acm/cartera` (`route.ts:16-24`) **ya hace `select` de `images`** y ya calcula una primera imagen (`:60`). El frontend la descarta porque `CarteraItem` (`subject-input.tsx:19-37`) no declara el campo. Es sumar la grilla, no plomería nueva.

**La decisión de seguridad:** el navegador **no manda URLs de fotos**. Manda *qué propiedad y qué índices*; el servidor resuelve contra su propia base, con alcance de la agencia del que llama, y descarta lo que no resuelva a una foto de una propiedad de esa agencia. Mandar URLs sueltas convertiría el endpoint en un proxy que descarga cualquier cosa de internet (SSRF). La forma vieja (base64 desde el navegador) sigue andando y un pedido mixto también.

---

## Feature B — Detección de fotos que no son de la propiedad

**Qué hace:** marca los comparables cuyas fotos **no muestran la propiedad** — renders de pozo, solo palier o escalera, planos — en dos momentos:

1. **En la lista de resultados del asesor:** un chip que dice qué pasa ("render de pozo", "solo espacios comunes").
2. **Antes de crear la ficha del cliente:** si un comparable seleccionado está marcado, se avisa y el asesor decide si lo saca o lo deja.

**Nunca saca nada solo, y no toca el %.** El asesor decide.

**Por qué importa más de lo que parece:** en la validación sobre San Telmo, **4 de 7 comparables reales tenían fotos de palier, escaleras o planos mezcladas entre sus primeras 4 imágenes**. No es un caso raro de laboratorio: es lo que hay. Y esas fotos van a la ficha que ve el dueño de la propiedad — un render de un edificio que todavía no existe, presentado como comparable, destruye la credibilidad del informe entero.

**Costo, tope y caché:** tope de 10 comparables por revisión (los de mayor `match_pct` de los que superan 90%), y el resultado **se guarda por propiedad**, no por ACM. Las propiedades de roomix se repiten entre ACM del mismo barrio, así que el segundo ACM en la zona reusa lo ya revisado. La clave del caché incluye un hash de las URLs de las fotos: si la publicación cambia sus fotos, se vuelve a revisar sola.

Datos reales que fijan el tope: sobre 51 ACM ya hechos, hay 42,3 comparables promedio, **12,8 sobre 90%** y un máximo de **54**. Sin tope, el peor caso serían 54 llamadas de visión con el cliente esperando.

---

## Lo que se midió y por qué el afinado por ±5 no va

Se corrieron **cuatro rondas** con datos y fotos reales de Central. Los informes completos están en `.superpowers/sdd/2026-08-06-acm-zona-estricta-y-fotos-ia/`.

**Ronda 1 — comparar los textos de las descripciones (embeddings). Muerta.**
El par más "parecido" de 66 resultó ser un departamento reciclado a nuevo contra uno viejo y desordenado: los dos más distintos de la muestra dieron el puntaje más alto. Dos causas: la prosa inmobiliaria en español comparte mucho vocabulario de relleno, y —clave— **el prompt de producción esconde a propósito lo deteriorado** ("no omitas ni disimules lo que está deteriorado, pero decilo con honestidad y sin castigar"), que para el cliente está perfecto pero borra justo la varianza necesaria para comparar. Un mismo texto no puede ser diplomático para el cliente y crudo para comparar.

**Ronda 2 — atributos estructurados (estado, terminaciones, luminosidad). Prometedora.**
Desapareció la inversión catastrófica y el departamento con humedad pasó a puntuar último, como corresponde. Pero apareció una inversión menor y `calidad_terminaciones` cambiaba de opinión entre corridas.

**Ronda 3 — ajuste de la escala. Parecía cerrada.**
Se precisó qué debe mostrar una foto para ganarse cada calificación y se agregó "no puedo juzgarlo con estas fotos". `calidad_terminaciones` siguió inestable y se descartó. Con `estado_conservacion` 70% + `luminosidad` 30%, la correlación contra el criterio humano dio **0,96**.

**Ronda 4 — validación sobre datos nunca vistos (San Telmo). Muerta.**
Ese 0,96 estaba medido sobre **las mismas 9 propiedades con las que se eligió la fórmula**. Aplicada tal cual sobre otro barrio y otro tipo de propiedad, la correlación cayó a **0,13** —ruido estadístico— y **5 de 14 pares (36%) quedaron invertidos**: los dos comparables más parecidos al sujeto terminaron últimos.

La causa raíz es estructural, no de ajuste: **la IA calificó mal al sujeto mismo**, en el límite "bueno vs excelente" que venía flojo desde la ronda 2. Como cada comparable se puntúa *contra el sujeto*, ese único error de anclaje contaminó las seis comparaciones a la vez. Más ajuste no lo arregla: cualquier escala relativa hereda el error del ancla.

**Decisión:** no se implementa el ±5. Habría movido tasaciones 5 puntos en la dirección equivocada, con toda la autoridad de un número.

**Lo que sobrevivió:** la pregunta "¿estas fotos muestran la propiedad?" acertó **6 de 6 en las cuatro rondas**, incluido un test de estrés no planeado en la ronda 4. Es lo único que se construye de la Feature B.

---

## Restricciones que siguen vigentes

- **Las fotos NO se persisten** — ni en Storage, ni en disco, ni en la base, ni en los logs. Lo que se guarda del detector es el veredicto (y el hash de las URLs), nunca la imagen.
- **El ACM nunca se bloquea por la IA.** Si Gemini falla, se muestra el error y todo lo demás sigue andando.
- **El análisis del sujeto se hace una sola vez.** El flag `analizado` con su inicializador lazy (`fotos-ia.tsx:67`) implementa esto; elegir fotos ocurre antes de analizar, así que la grilla desaparece junto con el resto de la UI previa.
- **Idioma:** español rioplatense en UI y comentarios.
- **No commitear archivos ajenos:** `git add <ruta exacta>`, nunca `git add -A`.

## Cómo se verifica

Navegador real contra la Supabase de producción, no simulación.

- **Feature A:** elegir una propiedad de cartera con fotos → la grilla aparece → tildar 3 → suben al strip → subir una cuarta a mano → analizar → vuelve una descripción real de esas fotos. Además: propiedad sin fotos, cambiar de propiedad a mitad de la selección, e intentar pasarse de 4 entre las dos fuentes.
- **Feature B:** un ACM cuyos comparables incluyan al menos un render de pozo y uno con solo palier (la validación de San Telmo dejó identificados casos reales) → el chip aparece en los correctos y no en los demás → seleccionar uno marcado para la ficha → aparece el aviso → crear igual y confirmar que la ficha sale como el asesor decidió.
- **Caché:** correr dos ACM del mismo barrio y confirmar por el conteo de llamadas que el segundo reusa lo revisado.
