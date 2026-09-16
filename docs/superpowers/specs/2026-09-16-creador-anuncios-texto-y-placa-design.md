# Creador de anuncios: el texto que se pega en Meta y la placa con la foto real

**Fecha:** 16-sep-2026
**Origen:** dos sugerencias de Maximiliano Filoreto (`maximilianof@maxre.com.ar`, asesor de
Central Real Estate Argentina), las dos en estado `en_proceso` en `system_feedback`.

| Id | Fecha (AR) | Qué pidió |
|---|---|---|
| `79226ee2-93da-4f66-81b6-1edba0b705b9` | 3-sep-2026 13:43 | "el texto adjunto se crea todo junto, sin espacios y sin emojis (…) cuando se adjunta a meta no queda muy bien" |
| `ce6b815b-782e-496b-9282-2082110e90b7` | 10-sep-2026 12:23 | "que (…) la foto de la placa sea de esa propiedad en particular, o permita elegir una imagen desde la publicación" |

---

## 1. Qué está pasando hoy, verificado

### El texto sale en un bloque

El copy real que él generó el 10-sep (`copy_drafts`, id `30b0f771-ff34-44bc-8d48-a7e5251af0aa`)
tiene el campo `desarrollo` con **89 palabras, ningún salto de línea y ningún emoji**.

No es la IA teniendo un mal día: es lo que se le pide. El prompt que corre de verdad es
`app/api/marketing-ia/generate-batch/route.ts:130`, y lo único que dice del cuerpo es:

```
"desarrollo":"cuerpo usando el ángulo pas"
```

**En ningún lado se le dice que ese texto se va a pegar en Instagram.**

Ojo con esto, porque explica por qué nadie lo detectó antes: el archivo
`app/api/marketing-ia/generate-copy/route.ts:148` **sí** pide "3-5 párrafos cortos", pero ese
endpoint **no es el que usa la pantalla**. La pantalla llama a `generate-batch`. Hay dos prompts
que dicen cosas distintas y solo uno corre.

Comparando las dos capturas que adjuntó (`evidence_urls` de la sugerencia): **es exactamente el
mismo texto**. ChatGPT no reescribió nada. Lo único que hizo fue cortarlo en 7 párrafos de 1 a 3
renglones, con renglón en blanco entre medio, y poner un emoji al final de algunos — no de todos
(🏡 📸 ⚠️ ✨ 🔑 📲).

### La placa ignora la propiedad — y es peor de lo que él contó

`components/marketing-ia/copy-generator-flow.tsx:118` le manda la propiedad al generador de
imagen desde `selectedIpc.flow_data.tokko_property_details`.

**Ese campo está vacío.** Verificado en `ipc_profiles`: los dos perfiles de Maximiliano tienen
`tokko_property_details` en null, aunque el de tipo `vender` sí tenga `propiedad_tokko_id =
9829957`. O sea que la placa no recibe **ni la foto ni los datos** de la propiedad, y cae en la
línea por defecto de `generate-image/route.ts:78`:

> *"Imagen representativa del mercado inmobiliario argentino premium."*

Por eso el copy dice "La Pampa 1300, USD 130.000" y la imagen muestra un living que no existe.

Las fotos están: esa propiedad (`tokko_id 9829957`, *Monoambiente Belgrano Full Amenities*) tiene
**29 fotos** en la tabla `properties`. De las 551 propiedades de Central, **549 tienen fotos**, con
27,5 de promedio.

---

## 2. Dos cosas que se midieron y cambian el diseño

### Los emojis no se pueden dibujar sobre la placa

El texto que dibuja el código usa **Inter incrustada en base64**
(`lib/tipografia/fuente-inter.ts`), porque el runtime de Vercel no tiene ninguna fuente instalada.

Medido cargando esa misma fuente:

```
glifos de la fuente: 515 | emoji 🏡 -> .notdef
```

**Corregido el 16-sep-2026, después de medirlo:** al principio de esta sesión se escribió acá que
el emoji "sale como nada". **Es falso.** Midiendo el glifo de verdad contra la fuente incrustada:

| | glifo | contorno |
|---|---|---|
| emoji 🏡 | `.notdef` | **638 caracteres — dibuja un cuadrito bien visible** |
| espacio | `space` | vacío — no dibuja nada, pero es un glifo real |
| tabulador | `.notdef` | 638 caracteres — otro cuadrito |

O sea que un emoji en la placa **no desaparece: sale como un cuadrito de tofu en medio del
título**. Es el mismo accidente que ya está documentado en `lib/tipografia/contornos.ts`: el
crédito de OpenStreetMap del mapa del ACM salió como una fila de cuadraditos durante meses sin
que nadie lo viera.

Que el espacio tenga el contorno vacío mientras el `.notdef` tiene uno lleno es justo al revés de
lo que parece, y define cómo se detecta: **el control mira el nombre del glifo, nunca si el
contorno vino vacío.** Al revés, cada espacio del aviso legal se reportaría como letra rota.

**Consecuencia de diseño: EN LA IMAGEN NO VA NINGÚN EMOJI.** Dicho por Leonardo el 16-sep-2026.
Los emojis viven en el texto del post —que es lo que se pega en Meta— y en ningún otro lado. Ni
en el título de la placa, ni en la bajada, ni en las casillas de datos. El hook, que es lo que se
dibuja sobre la placa, se genera sin emoji y además se le sacan en el servidor por las dudas.

**Agujero que hay que tapar de paso:** `Contornos.letrasRotas` (`contornos.ts:86`) solo cuenta
coordenadas `NaN`. El contorno del cuadrito de `.notdef` es un dibujo perfectamente válido y no
tiene ningún `NaN`, así que pasaba derecho: **se dibujaba y no se contaba.** Se agrega la
detección de `.notdef` al contador, por nombre de glifo.

### Las fotos de Tokko varían mucho, y el 18% son chicas

Medidas **40 portadas de propiedades distintas** de Central (descargadas y medidas de verdad, no
deducidas de la base):

| | |
|---|---|
| Forma | 28 de 40 son **4:3**; 7 son 3:2; 3 son 16:9; 2 casi cuadradas (una de ellas vertical) |
| Ancho | mediana **1500 px**, mínimo **575**, máximo 1600 |
| Más angostas que la placa (1080 px) | **7 de 40 = 18%** |

Con la foto típica (4:3, 1500×1120), las dos maneras posibles de armar cada formato — con la
foto ocupando el 55% del alto en el caso del panel:

| | Pantalla completa | | Foto + panel | |
|---|---|---|---|---|
| | *usa del ancho* | *escala* | *usa del ancho* | *escala* |
| Reel 9:16 | 42% | **1,71× blanda** | **76%** | **0,94× nítida** |
| Post 4:5 | 60% | **1,21× blanda** | **100%** | **0,72× nítida** |
| Cuadrado 1:1 | 75% | 0,96× | **100%** | **0,72× nítida** |

**El panel gana en las dos cosas a la vez, en los tres formatos**: se ve más propiedad y se ve
más nítida. En 4:5 y en cuadrado la foto entra **entera, sin recortar nada**. Es la decisión.

El 18% de portadas más angostas que 1080 px salen blandas con cualquier diseño. No se puede
arreglar desde acá: se marcan en la tira de miniaturas para que el asesor elija otra.

---

## 3. El diseño

### Parte 1 — El texto del post

**Se le deja de pedir `desarrollo` como un texto suelto y se le pide `parrafos`, una lista.**
El servidor los pega con renglón en blanco y los guarda en `desarrollo` como hasta ahora.

Esto no es un capricho de forma. `lib/marketing-ia/formatos.ts` ya documenta que **pedirle algo al
modelo adentro del texto del prompt no alcanza**: así fue como las placas salieron de 768 px de
ancho durante meses mientras el prompt decía 1080. Una lista la puede **contar** el servidor; un
"poné renglones en blanco" no se puede verificar.

Reglas nuevas en el prompt de `generate-batch`:

- Entre **6 y 8 párrafos**, de 1 a 3 renglones cada uno.
- Un emoji al final de **algunos** párrafos, nunca de todos, nunca en el medio de una frase.
- **El hook va sin emoji** (se dibuja sobre la placa con Inter, que no los tiene).
- El CTA sí lleva uno.

**El servidor sella lo que devuelve el modelo**, igual que ya sella `estructura` y
`duracion_estimada` de los guiones:

- Los párrafos se pegan con `\n\n`.
- Máximo **1 emoji por párrafo**; si mete más, se conservan el último (que es el de la posición
  que se busca) y se descartan los demás.
- **Cero emojis en el hook**, se saquen donde se saquen.

Módulo nuevo: `lib/marketing-ia/parrafos.ts`, con sus pruebas.

**Qué NO se toca, a propósito:**

- La forma de `copy_drafts.content` sigue siendo `{hook, desarrollo, cta}`. **Los borradores
  viejos se siguen leyendo igual.**
- La pantalla ya muestra el texto con `whitespace-pre-wrap`
  (`marketing-history.tsx:582`) y "Copiar Todo" ya pega con renglón en blanco
  (`marketing-history.tsx:244`). **Los párrafos aparecen solos, sin tocar la pantalla.**

### Parte 2 — La placa con la foto real

#### El paso nuevo en la pantalla

En `copy-generator-flow.tsx`, un paso **"6. Foto de la placa"** que aparece **solo si el perfil
IPC tiene `propiedad_tokko_id`**. Trae las fotos con `/api/marketing-ia/fotos-propiedad`, que ya
existe, y las muestra como miniaturas.

Es la misma tira que ya usa el retoque de fotos (`components/marketing-ia/fotos-ia.tsx:497`), así
que el asesor la reconoce. La primera viene marcada.

Las miniaturas cuyo original mide **menos de 1080 px de ancho** salen con un aviso discreto
("esta foto va a salir poco nítida"). Se pueden elegir igual: es su decisión, no un bloqueo.

#### Cómo se arma la placa

Sin IA. Capas, en este orden:

1. La **foto**, recortada lo mínimo necesario para llenar el ancho y el alto que le toca.
2. El **panel** de marca abajo: título, línea cobre, bajada, precio, casillas con los datos
   (ambientes, m², amenities).
3. El **logo**, arriba de la franja legal.
4. La **franja del aviso legal**, tal como hoy (`armarFranjaLegal`).

Módulo nuevo: `lib/marketing-ia/placa-con-foto.ts`, calcado de `aviso-legal.ts` — mismo patrón de
medir, elegir el cuerpo de letra que entra, y dibujar **un renglón por lienzo** (la razón está
explicada en `aviso-legal.ts`: un dibujo grande se corta solo a la mitad sin avisar).

#### La regla que no se puede saltear: el panel se mide, no se asume

**Probando el mockup con la foto real apareció el problema antes de que llegara a producción:** con
un panel de alto fijo (40% de la placa), en el formato 4:5 las casillas de datos **chocaban con el
aviso legal** y el logo se montaba encima de las casillas.

Entonces: **el alto del panel se calcula a partir de su contenido real** — cuántos renglones ocupa
el título con el cuerpo elegido, más la bajada, el precio, la fila de casillas, el logo y la
franja legal. La foto se queda con lo que sobra.

**Corregido el 16-sep-2026, después de probarlo con el aviso legal real del cliente.** Acá decía
que la foto "nunca baja del 45%" y que primero se achica el título y después se sueltan las
casillas. Las dos cosas quedaron mal: probando con el aviso legal de verdad de Central (165 px de
franja, 319 px reservados con el logo), **el formato cuadrado seguía metiendo el precio abajo de la
franja legal** aun con el título en el cuerpo más chico, cero casillas y la foto clavada en el 45%.
El tope del 45% terminaba pisando el aviso legal, que es exactamente lo que este diseño existe
para evitar.

**Lo que se construyó, que es otra cosa.** Hay una sola regla que no se negocia: *el contenido
nunca se mete en la zona del aviso legal*. Para cumplirla, el panel afloja en este orden:

1. **Suelta las casillas de datos** — son lo más prescindible.
2. **Suelta la bajada.**
3. **Achica el cuerpo del título**, de mayor a menor.
4. **Achica la foto**: el 45% pasa a ser una *preferencia*, con un piso duro del **30%**.

El título nunca se achica antes que las casillas, y esto es a propósito: en una placa inmobiliaria
el título *es* el mensaje; las casillas son adorno informativo.

Si ni con la foto al 30% entra, la placa **igual sale** —no se rompe nada— pero lo **avisa**: la
función devuelve `desborda: true`, la ruta lo registra y el asesor ve una advertencia. Antes esto
se aceptaba en silencio.

Las casillas, además, se dejan de dibujar en cuanto la siguiente no entra a lo ancho. Nunca se
parten ni se desbordan.

Es la misma filosofía que ya tiene el aviso legal: se mide y se acomoda, no se supone.

#### Qué pasa cuando no hay propiedad

Si el IPC es de tipo `captar` (propietarios) o no tiene propiedad cargada, **no aparece el paso y
todo sigue exactamente como hoy**: Gemini genera la imagen. Esta parte del diseño es aditiva.

#### Créditos

La placa con foto real **no llama a Gemini**, así que no consume créditos de imagen. Hoy cada
placa consume 2 y salen 3 por generación: **se dejan de gastar 6 créditos** cada vez que el
asesor usa este camino.

`consumeAiCredits` no se llama en el camino con foto.

### Parte 3 — El bug del `tokko_property_details`

Se arregla mandando `propiedad_tokko_id` a `generate-image` y que **el servidor busque la
propiedad**, igual que ya hace `generate-batch` (`generate-batch/route.ts:196`).

Sin esto, el camino sin foto (los IPC de captar, y cualquier placa vieja) sigue inventando para
siempre, y el panel de la placa con foto no tendría de dónde sacar el precio ni los m².

---

## 4. Cómo se prueba

**La prueba que tiene que fallar con el bug puesto** (memoria: *una prueba que no falla con el bug
no es prueba*):

- Genero un post y cuento los párrafos de `desarrollo`. Con el código de hoy da **1**. Tiene que
  dar entre 6 y 8. Meto el prompt viejo y veo la prueba fallar antes de darla por buena.

**Que la foto sea la foto** — esto es lo que sostiene todo el diseño:

**Corregido el 16-sep-2026:** acá decía "comparo píxel a píxel; si no son idénticas, la imagen se
tocó". **Eso no se puede pedir**, y prometerlo hacía que la prueba fuera mentirosa: la placa se
guarda como JPEG de calidad 92, así que los bytes cambian aunque nadie haya tocado la foto.

Lo que se comprueba de verdad: se recorta la foto original por separado, exactamente como debería
quedar (`resize` a la zona de foto, recorte al centro), y se compara **píxel contra píxel de esa
referencia**, midiendo cuánto se desvía en promedio. Un viaje de ida y vuelta por JPEG mueve muy
poco; cualquier cosa que le pase a la foto de verdad —un desenfoque, un retoque, una regeneración—
la mueve muchísimo más.

**Y la prueba se probó al revés**: se le metió un desenfoque a la foto a propósito para verla
fallar, y recién después se sacó. La versión anterior de esta prueba usaba una foto de color plano
y **seguía pasando con la foto desenfocada** — o sea que no probaba nada. Es la prueba que sostiene
todo el diseño; si no puede fallar, no sirve.

**Que no falte ninguna letra:**

- `letrasSinDibujo` del título tiene que dar **0**.
- Le meto un emoji al hook a propósito y verifico que el sellado lo saque **antes** de dibujar.
- Verifico que el contador nuevo de `.notdef` levante la mano si el emoji llega igual.

**Los tres formatos, con fotos reales de las tres formas** (4:3, 3:2 y la vertical), más una de
las chicas (575 px) para ver el aviso.

**En el navegador**, escritorio y celular emulado, **en los dos temas** — el panel oscuro es un
color nuevo (memoria: *tocaste un token de color, medí los dos temas*).

Con la cuenta **PRISMAIA - VAKDOR**, nunca entrando como un asesor de Central.

---

## 5. Archivos que se tocan

*(Lista completada el 16-sep-2026 al cerrar la rama: faltaban tres archivos.)*

**Nuevos**

- `lib/marketing-ia/parrafos.ts` + `parrafos.test.ts`
- `lib/marketing-ia/placa-con-foto.ts` + `placa-con-foto.test.ts`
- `lib/tipografia/contornos.test.ts` — no existía ninguna prueba de la tipografía
- `app/api/marketing-ia/generate-batch/prompt.test.ts`
- `app/api/marketing-ia/generate-image/camino.test.ts`

**Modificados**

- `app/api/marketing-ia/generate-batch/route.ts` — el esquema `parrafos` y las reglas nuevas
- `app/api/marketing-ia/generate-copy/route.ts` — se alinea con el otro para que dejen de decir
  cosas distintas
- `app/api/marketing-ia/generate-image/route.ts` — el camino con foto, y la propiedad la busca el
  servidor
- `components/marketing-ia/copy-generator-flow.tsx` — el paso de elegir la foto
- `lib/tipografia/contornos.ts` — que `letrasRotas` cuente también los `.notdef`
- `lib/marketing-ia/aviso-legal.ts` — el repartidor de renglones se mudó a tipografía, porque ahora
  lo usan dos
- `types/marketing-ia.ts` — `foto_url` y `propiedad_tokko_id` en `GenerateImagePayload`

---

## 6. Qué queda afuera

- **El hook de la placa puede ser muy largo.** El del ejemplo tiene 150 caracteres, que para un
  título de placa es mucho. El diseño lo acomoda achicando la letra, pero lo correcto sería
  pedirle al modelo un título corto aparte del hook del post. **No entra en este trabajo.**
- **Las fotos de menos de 1080 px (18%) salen blandas.** Se avisa, no se arregla. Arreglarlo sería
  agrandarlas con IA, y eso es el módulo de retoque de fotos, que ya existe y es otro camino.
- **Una foto vertical** (2 de 40) recortada a la zona de foto pierde arriba y abajo. Se acepta:
  hacer un segundo diseño para el 5% de los casos no se paga.
- **Elegir una foto distinta por variante.** Las 3 placas salen con la misma foto, que es lo que
  se decidió. Si después quiere una por variante, es un agregado chico sobre esto.

---

## 7. Cómo se trabaja

Rama nueva desde `main`. Se prueba de verdad en el navegador, con el link para que Leonardo lo
vea. Recién con su OK, commit y merge. Nunca `git add -A`.
