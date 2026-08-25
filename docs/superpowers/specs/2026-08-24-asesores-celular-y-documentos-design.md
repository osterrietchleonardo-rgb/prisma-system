# Asesores: celular obligatorio al invitar + documentos personalizados con versionado

**Fecha:** 2026-08-24
**Estado:** diseño aprobado en conversación, pendiente de plan de implementación
**Rama:** `feat/asesores-celular-y-documentos` (worktree, desde `main` @ 2ff67b2)
**Alcance:** (a) que ningún código de invitación se genere sin el celular verificado del invitado; (b) que cada asesor tenga documentos propios —plantillas personalizadas e información suelta—; (c) que el director pueda cambiar la versión de una plantilla y el sistema rehaga el documento de cada asesor conservando sus datos.

---

## 1. Problema

Son tres problemas encadenados.

**a) El sistema no sabe el celular de sus propios asesores.** `profiles.phone` existe y está vacío. Al invitar a alguien solo se pide el nombre, así que el dato entra tarde o no entra nunca. Y el director no tiene dónde cargárselo a los que ya están adentro.

**b) Hay dos formularios distintos para lo mismo, y uno es una puerta trasera.** Los códigos de invitación se generan en dos lugares con reglas distintas:

| | `/director/configuracion` | `/director/asesores` |
|---|---|---|
| Pide nombre | Sí | **No** |
| Elige rol | Sí (por solapa) | No, siempre `asesor` por default |
| Formato del código | `CENTRA-ASE-2026-K3P` | 8 caracteres al azar |
| Dónde | `page.tsx:334` → `lib/queries/director.ts:299` | `page.tsx:340`, insert directo |

Poner el celular obligatorio en uno solo deja al otro como agujero: el dato obligatorio deja de serlo.

**c) Los documentos de cada asesor viven fuera del sistema, y cambiar su versión es trabajo manual multiplicado por N.** El contrato de asesor, el acuerdo de comisiones y la carta de confidencialidad son el mismo texto para todos con unos pocos datos cambiados. Hoy son archivos de Word en la computadora del director. Cuando cambia una cláusula hay que rehacer y volver a mandar los N documentos a mano — y en Central son 29 asesores.

## 2. Principio rector

**Lo que cambia entre asesores no se adivina: se mide.**

La plantilla no sale de que una IA interprete un documento suelto. Sale de comparar varios documentos del mismo tipo entre sí: lo que es idéntico en todos es el texto fijo, lo que difiere es —por definición— el dato personalizado. La IA queda relegada a lo único que hace bien acá: ponerle nombre a cada hueco. Si la IA falla, la detección igual funciona con nombres genéricos.

Corolario: **nada se publica sin verificarse.** Antes de dar una plantilla por buena, el sistema la vuelve a rellenar con los datos de cada asesor y compara el resultado contra el archivo original. Lo que no da idéntico queda en rojo y frena la publicación de esa plantilla.

## 3. Contexto verificado

Comprobado el 2026-08-24 contra el código de `main` @ 2ff67b2 y contra la base de producción vía Management API. Nada se asumió.

### 3.1 La base ya tiene dónde guardar el celular

`profiles` en producción: `id, role, full_name, email, phone, avatar_url, agency_id, created_at, updated_at, estado, deleted_at, deleted_by, tokens_invalidos_desde, notification_prefs, clasificacion`.

**`phone text` ya existe.** No hace falta columna nueva en `profiles`.

`agency_invites` en producción: `id, agency_id, code, is_used, used_at, used_by, created_at, role, invitee_name`. **Falta el celular** — esa sí es columna nueva.

### 3.2 La verificación de celular que ya usa PRISMA

`components/shared/ManualContactFields.tsx:47`. No es SMS ni código: es **doble tipeo**. Se escribe el número dos veces, está bloqueado pegar y arrastrar (`blockPaste`), hay selector de país, y los dos valores se comparan **normalizados a E.164**, no como texto — así "11 1234-5678" y "011 15 1234 5678" dan iguales. Los helpers viven en `lib/whatsapp/phone.ts`: `normalizePhoneE164:18`, `formatPhoneInternational:48`, `getPhoneCountries:81`.

Es la verificación correcta: ya está probado que la Cloud API de WhatsApp no permite verificar la titularidad de un número.

### 3.3 Qué pasa hoy cuando alguien se registra con un código — y el agujero que tiene

`lib/actions/auth.ts:180`, rama `mode === 'unirme'`: valida el código contra `agency_invites`, crea el usuario, y actualiza `profiles` con `agency_id`, `role` y `full_name`.

**Hoy no hay ninguna validación de que quien usa el código sea la persona invitada.** Y no es algo que introduzca esta rama: ya está roto, sin celular de por medio.

- Al validar el código, el sistema lee **solo** `agency_id, is_used, role` (`auth.ts:86-89`). **Ni siquiera trae `invitee_name`.**
- Al crear el perfil, le pone el nombre que tipeó quien se registra: `full_name: data.fullName` (`auth.ts:183`).

Es decir: se puede generar un código que dice "Juan Pérez" y terminar con un perfil que dice "Pedro Gómez". El nombre del invitado es hoy **decorativo** — se muestra en la lista de códigos y nada más.

Lo único que sí funciona es que el código es **de un solo uso**: `is_used` se chequea al validar (`auth.ts:93`) y se marca al consumirlo (`auth.ts:190`).

Con el celular, ese agujero pasa de cosmético a peligroso: si el código se reenvía, se le asigna a una persona **el número de teléfono de otra persona real** — y es el número que después usa el director para llamarlo.

### 3.3.1 Cuánto arrastre hay de códigos viejos

Medido en producción el 2026-08-24:

| Estado | Sin nombre | Cantidad |
|---|---|---|
| Sin usar | No | **2** |
| Usados | No | 23 |
| Usados | Sí | 14 |

**Los únicos 2 códigos sin usar ya tienen nombre.** Los 14 sin nombre están todos consumidos. No hay gap de nombres que resolver; sí les falta email y celular (§5.5).

### 3.4 El motor de plantillas que ya existe (Contratos IA)

`contract_templates` (`template_body` con `{{PLACEHOLDER}}`, `campos_schema` jsonb, `version`) + `contratos` (`form_data` jsonb, `pdf_url`). Confirma que el patrón *plantilla + datos por instancia* ya es idioma de la casa.

**Pero su salida no sirve acá.** `lib/contratos/pdf-generator.ts` arma el PDF con jsPDF a partir de texto plano: A4, Helvetica, encabezado de PRISMA. Es un documento nuevo, no una copia del Word. Para este caso hace falta conservar el formato original.

### 3.5 Dónde ve documentos el asesor hoy

`app/asesor/documentos/page.tsx:57` — dos solapas: `"biblioteca"` (la compartida, con IA) y `"oficiales"` (`components/documentos/OfficialDocsSection.tsx`, solo lectura). En el menú lateral figura como **"Biblioteca"**.

### 3.6 Los buckets de Storage

| Bucket | ¿Público? |
|---|---|
| `contratos` | **Sí** |
| `documents` | **Sí** |
| `logos` | Sí |
| `marketing-images` | Sí |
| `feedback-evidence` | Sí |
| `marketing-assets` | No |

`documents` está en público: sus archivos se leen con la URL sin estar logueado. Ver §9.1.

### 3.7 Librerías

Ninguna instalada todavía. Las tres son gratis y de licencia abierta, verificado con `npm view`:

| Paquete | Versión | Licencia | Para qué |
|---|---|---|---|
| `docxtemplater` | 3.69.3 | MIT | Rellenar los `{{huecos}}` del .docx conservando formato |
| `pizzip` | 3.2.0 | MIT OR GPL-3.0 | Leer y escribir el ZIP que es un .docx |
| `diff` | 9.0.0 | BSD-3-Clause | Alinear los documentos entre sí para detectar qué cambia |

`mammoth` (^1.12.0) y `libphonenumber-js` (^1.13.7) ya están.

## 4. Decisiones tomadas

Cada una es una decisión de Leonardo del 2026-08-24, no un default mío.

| Decisión | Qué se eligió | Por qué importa |
|---|---|---|
| Qué son los documentos | Texto fijo con datos puntuales | Habilita plantilla + campos; es lo que hace posible el versionado |
| Carga inicial | Subir el .docx ya armado, el sistema extrae los datos | Evita tipear N campos × N asesores |
| Cómo se detecta la plantilla | Comparando una muestra de varios documentos del mismo tipo | Medir en vez de adivinar (§2) |
| Dos secciones | Plantillas versionadas (.docx) + Documentos de información (.docx/.pdf) | Son necesidades distintas y no se mezclan |
| Salida | **.docx el día uno; el PDF queda para la segunda vuelta** | El PDF idéntico al Word exige LibreOffice en un servidor |
| Los dos formularios de código | Se unifican en un componente compartido | Cierra la puerta trasera |
| El rol | **El formulario nunca lo pregunta**: lo fija la pantalla que lo abre | En Asesores es siempre `asesor` y no hay forma de crear un director |
| Qué pide el formulario | **Nombre + celular + email** | El email es la llave: sin él, el código no valida contra nadie |
| Cómo se valida quién se registra | **El email tiene que coincidir con el del código** | Convierte el código en intransferible sin pedirle nada nuevo al que se registra |
| El nombre | **Manda el del código**, no el que tipea quien se registra | Cierra la inconsistencia de §3.3 de raíz |
| Quién edita el celular después | **Solo el director** | El asesor lo ve, no lo toca |
| Bucket | **Público**, reusando `documents` | Decisión de Leonardo tras plantearle el riesgo (§9.1) |

## 5. Diseño — Parte A: el celular obligatorio

### 5.1 Un solo componente para el celular verificado

Se crea `components/shared/VerifiedPhoneField.tsx`: selector de país + número + confirmación, sin pegar, comparando en E.164. Reusa los helpers de `lib/whatsapp/phone.ts`. Expone `onChange({ phoneE164, isValid })`.

**No se toca `ManualContactFields.tsx`.** El alta manual de contactos es un camino en producción que funciona; extraerle el campo por dentro es un refactor con riesgo que no pertenece a esta rama. Costo aceptado: la regla queda escrita en dos lugares. Queda anotado en §9.2.

### 5.2 Un solo formulario para crear códigos

Se crea `components/director/NuevoCodigoDialog.tsx`, con una prop `role: "asesor" | "director"` que **no se muestra ni se elige**.

Pide **tres cosas, las tres obligatorias**:

| Campo | Verificación | Para qué sirve |
|---|---|---|
| Nombre del invitado | — | Pasa a `profiles.full_name` al registrarse. Manda esto, no lo que tipee la persona |
| Celular | Doble tipeo, sin pegar, comparado en E.164 | Pasa a `profiles.phone` |
| Email | **Doble tipeo**, normalizado a minúsculas | **Es la llave**: solo se puede registrar quien use ese email |

El botón de confirmar queda deshabilitado hasta que los tres estén completos y verificados.

**Por qué el email también va con doble tipeo:** deja de ser un dato de contacto y pasa a ser una credencial. Un error de tipeo ahí no es una molestia — **es una persona que directamente no puede registrarse**, con un código quemado y un director que no entiende por qué. Es el mismo criterio que ya aplica `ManualContactFields` (§3.2).

**Chequeo al generar:** si ese email ya tiene cuenta en la agencia, no se genera el código y se dice cuál es el asesor que ya lo usa. Evita el duplicado antes de que exista, en vez de tener que borrarlo después.

Se usa en los dos lados:

- **`/director/configuracion`**: el botón "Generar" de cada solapa abre el diálogo con el rol de esa solapa. El input de nombre suelto que hoy está en línea (`page.tsx:388`) se saca: pasa a vivir adentro del diálogo.
- **`/director/asesores`**: el modal "Invitar al equipo" pasa a abrir el mismo diálogo con `role="asesor"` fijo. Se elimina `generateInviteCode` (`page.tsx:340`) y su generación de código al azar: pasa a usar `generateAgencyInvite` de `lib/queries/director.ts:299`, así todos los códigos quedan con el mismo formato y las mismas reglas.

### 5.3 Del código al perfil, y la validación

`agency_invites` suma dos columnas: **`invitee_phone text`** (E.164 sin `+`) e **`invitee_email text`** (minúsculas, sin espacios).

`generateAgencyInvite` suma los dos parámetros y los escribe. Rechaza crear el código si alguno viene vacío, si el celular no normaliza, o si el email ya tiene cuenta en la agencia.

En `lib/actions/auth.ts`, rama `mode === 'unirme'`:

1. La consulta del invite (`auth.ts:86-89`) pasa a traer también `invitee_name, invitee_phone, invitee_email`.
2. **Si el invite tiene email y no coincide con el del registro** → se corta ahí: *"Este código no corresponde a este email."* No se crea el usuario ni se consume el código.
3. Si coincide, el perfil se arma con `full_name` e `invitee_phone` **del invite**, no de lo que tipeó la persona.

La comparación es sobre el email normalizado —minúsculas, sin espacios—, reusando el `emailNormalizado` que ya existe unas líneas más arriba en el mismo archivo.

En `components/auth-register-form.tsx`, el campo "Nombre Completo" (`:112`) hoy está **fuera** del bloque condicional por modo, así que lo usan los dos. Pasa a mostrarse **solo en modo "crear"**: quien se une con un código ya no lo tipea, porque lo define su inmobiliaria. El modo "crear" —el director que levanta la agencia— no se toca.

### 5.4 Editar los datos de los que ya están

En el panel lateral del asesor en `/director/asesores`:

| Dato | Quién lo edita |
|---|---|
| Email | **Nadie.** Es la cuenta con la que se registró; se muestra en solo lectura |
| Nombre | El director |
| Celular | El director |

Es donde el director carga el celular de los que hoy no lo tienen. Usa el mismo `VerifiedPhoneField`. Queda registro en `equipo_acciones`, igual que pausar y desvincular.

El asesor los ve en su Configuración, en solo lectura, con la leyenda de a quién pedirle el cambio.

### 5.5 Los códigos viejos

Los 2 códigos sin usar que existen hoy (§3.3.1) no tienen email ni celular. **Siguen funcionando exactamente como hoy**: sin email en el invite no hay contra qué validar, así que se comportan como antes de esta rama. El director puede borrarlos y regenerarlos si quiere la validación — son dos.

La regla general: **la validación por email aplica cuando el invite trae email.** Nada de lo viejo se rompe.

## 6. Diseño — Parte B: los documentos del asesor

### 6.1 Las dos secciones

En el panel lateral de cada asesor, solapa nueva **"Documentos"**:

**Sección 1 — Plantillas personalizadas.** Solo `.docx`. Un documento por tipo de plantilla. Muestra qué versión tiene y en qué estado está. Se descarga en Word.

**Sección 2 — Documentos de información.** `.docx` o `.pdf`. Archivos sueltos, sin campos ni versiones. Se suben y se bajan tal cual.

`.doc` (Word 97, binario) **se rechaza en la sección 1** con un mensaje que explica por qué y cómo convertirlo. En la sección 2 entra sin problema: ahí no se rellena nada.

### 6.2 Lo que ve el asesor

`app/asesor/documentos/page.tsx` suma una tercera solapa, **"Mis documentos"**, junto a Biblioteca y Oficiales. Ve **solo sus propias filas**, descarga, y no puede subir ni borrar. Las dos secciones aparecen separadas igual que del lado del director.

## 7. Diseño — Parte C: detección y versionado de plantillas

Solapa nueva **"Plantillas"** en `/director/asesores`, al nivel de la página. Una fila por plantilla: nombre, versión vigente, cuántos asesores la usan, cuántos están en rojo.

### 7.1 Detectar la plantilla (primera vez)

Se habilita con **3 o más** documentos del mismo tipo cargados. Con 1 o 2 no hay con qué comparar: la plantilla queda en `borrador` y no se puede versionar.

1. Se extrae el texto de los N documentos (`mammoth`) y se alinean entre sí (`diff`).
2. Todo tramo idéntico en los N → texto fijo. Todo tramo que difiera → **hueco**.
3. La IA (Gemini, vía `consumeAiCredits`) le pone nombre a cada hueco leyendo el contexto de la frase. **Si falla, salen `CAMPO_1`, `CAMPO_2`** y el director los renombra. La detección no depende de la IA.
4. Se toma el `.docx` de uno de los asesores como **molde** —conserva formato, logo, tablas— y se le reemplazan sus valores por `{{HUECOS}}`.

### 7.2 Revisión obligatoria

Pantalla no salteable antes de guardar: la plantilla con los huecos marcados y una tabla de qué valor le extrajo a cada asesor. Se puede renombrar un hueco, borrar uno mal detectado o marcar uno que se pasó. Nada se persiste hasta el confirmar.

### 7.3 La verificación (la red de seguridad)

Antes de dar la plantilla por buena, para **cada** asesor: se rellena la plantilla con sus datos, se extrae el texto del resultado y se compara contra el texto de su archivo original.

- Idénticos → `ok`.
- Distintos → ese asesor queda **`revisar`** y **la plantilla no se publica**.

Esto existe para atrapar el riesgo real de meter `{{huecos}}` en un .docx: Word parte el texto en *runs* y un "Juan Pérez" puede estar guardado en tres pedazos, con lo cual el reemplazo falla. Cuando falle, va a fallar ruidosamente.

### 7.4 Subir una versión nueva

El director elige la plantilla y sube el `.docx` de la versión nueva.

1. **Se le pide al director que suba la versión nueva ya completada con los datos de UN asesor** que el sistema ya tiene cargado, y que indique cuál. Esto no es un capricho: es lo que convierte la detección en algo determinista. El sistema busca los valores conocidos de esa persona (sabe que el CUIT de Juan es `20-12345678-9`) y los encuentra literales, sin adivinar. Un archivo genérico o con los huecos en blanco **se rechaza** con ese mensaje.
2. Si la versión nueva trae un hueco que antes no existía, avisa: ese campo queda vacío y hay que completarlo por asesor. Si un hueco de la versión vieja **desapareció**, también avisa: ese dato deja de usarse pero **no se borra** de `form_data`, para que volver atrás siga funcionando.
3. Muestra **vista previa del documento de un asesor real** con la versión nueva.
4. Recién con el OK explícito reemplaza los N documentos.

La versión anterior **no se borra nunca**: queda archivada y se puede volver atrás.

### 7.5 Cómo corre el reemplazo

No en un solo pedido. De a un asesor por vez, con barra de progreso y estado por fila, para que uno que falla no voltee a los otros. "Aplicar versión" queda bloqueado mientras corre, para que dos clics no disparen dos procesos.

**Asesores pausados o desvinculados quedan fuera:** sus documentos no se regeneran ni se tocan, quedan archivados como estaban.

## 8. Modelo de datos

Todo aditivo. Nada de lo existente cambia de forma, salvo una columna nueva en `agency_invites`.

### 8.1 `agency_invites` (existente)

```
+ invitee_phone text   -- E.164 sin "+"
+ invitee_email text   -- minúsculas, sin espacios; la llave de validación
```

Las dos nullables, porque los códigos viejos no las tienen (§5.5).

### 8.2 `advisor_doc_templates`

La plantilla, por agencia.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `agency_id` | uuid | FK `agencies` |
| `nombre` | text | "Contrato de Asesor" |
| `estado` | text | `borrador` \| `activa` |
| `version_actual` | int | apunta a la versión vigente |
| `created_by`, `created_at`, `updated_at` | | |

### 8.3 `advisor_doc_template_versions`

Cada versión. **Las viejas no se borran** — de acá sale el volver atrás.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `template_id` | uuid | FK, on delete cascade |
| `version` | int | unique (`template_id`, `version`) |
| `docx_path` | text | el molde con `{{huecos}}` |
| `campos_schema` | jsonb | `[{ nombre, label, orden }]` |
| `origen` | text | `detectada` \| `subida` |
| `notas` | text | |
| `created_by`, `created_at` | | |

### 8.4 `advisor_documents`

El documento de cada asesor. Sección 1.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `agency_id` | uuid | |
| `advisor_id` | uuid | FK `profiles` |
| `template_id` | uuid | FK |
| `version_id` | uuid | FK, qué versión tiene hoy |
| `form_data` | jsonb | sus datos |
| `archivo_original_path` | text | el .docx que subió el director |
| `docx_path` | text | el generado |
| `estado` | text | `ok` \| `revisar` \| `pendiente` |
| `observacion` | text | por qué está en rojo |
| `created_at`, `updated_at` | | |

unique (`advisor_id`, `template_id`).

### 8.5 `advisor_info_documents`

Sección 2. Archivos sueltos.

| Campo | Tipo |
|---|---|
| `id` uuid pk, `agency_id` uuid, `advisor_id` uuid | |
| `nombre` text, `file_path` text, `mime` text, `size` bigint | |
| `created_by`, `created_at` | |

### 8.6 Storage

Bucket `documents` (existente, público), prefijo `asesores/{agency_id}/{advisor_id}/...`. Los moldes de plantilla en `asesores/{agency_id}/_plantillas/{template_id}/v{n}.docx`.

### 8.7 RLS

- **Director de la agencia:** todo lo de su `agency_id`.
- **Asesor:** `select` únicamente donde `advisor_id = auth.uid()`; ninguna escritura.
- **Plantillas y versiones:** solo director. El asesor nunca ve la lista de plantillas, solo su documento.

Se resuelve en la base, no escondiendo botones.

## 9. Lo que queda deliberadamente afuera

### 9.1 El PDF, y el bucket público

**El PDF idéntico al Word queda para la segunda vuelta**, por decisión de Leonardo. Requiere LibreOffice corriendo en un servidor (Gotenberg en el EasyPanel del VPS); Chromium tampoco corre en Vercel, así que la alternativa "como vakdor-pdf" necesita el mismo servidor y da peor fidelidad. El día uno se entrega la descarga en `.docx`.

**El bucket queda público**, por decisión de Leonardo, con el argumento de que las URLs no se van a compartir. Riesgo planteado y aceptado: el link público de Supabase **no vence**, así que un asesor desvinculado —al que `tokens_invalidos_desde` le corta el acceso al sistema— sigue abriendo su documento desde afuera si guardó la URL. En Central esos datos son de los empleados de Víctor.

**Requisito de implementación:** la obtención de la URL de descarga va **en una sola función** (`lib/asesor-docs/url.ts`), de modo que pasarlo a privado sea cambiar `getPublicUrl` por `createSignedUrl` en un lugar, y no un rediseño.

### 9.2 Unificar `ManualContactFields`

`VerifiedPhoneField` nace nuevo y `ManualContactFields` queda intacto. Unificarlos es una rama aparte.

### 9.3 El bucket `contratos`, también público

Descubierto al verificar §3.6: los contratos generados con datos de clientes se leen con la URL sin login. **Es más grave que 9.1 y no pertenece a esta rama.** Queda anotado como trabajo propio.

## 10. En qué orden se construye

Son tres pedazos y **cada uno se puede probar y mergear solo**. El plan de implementación los trata como etapas, no como un entregable único: si la Parte C se complica, las partes A y B ya están en producción y sirviendo.

| Etapa | Qué entrega | ¿Sirve sola? |
|---|---|---|
| **A — El celular** | Formulario unificado, columna nueva, celular editable desde la tarjeta | Sí. Cierra la puerta trasera y llena `profiles.phone` desde el día uno |
| **B — Los documentos** | Las dos secciones en la tarjeta del asesor + la solapa "Mis documentos" | Sí. Los documentos ya viven adentro del sistema aunque todavía se suban a mano |
| **C — Las plantillas** | Detección, revisión, verificación y versionado | Necesita B. Es la etapa con el riesgo técnico real (§7.3) |

## 11. Cómo se prueba

Con la cuenta propia (**PRISMAIA - VAKDOR**). **Central no se toca.** En navegador de escritorio y en celular emulado.

### Etapa A — el código y el celular

1. Generar un código desde Configuración (las dos solapas) y otro desde Asesores. Confirmar que ninguno sale sin nombre, celular y email, y que desde Asesores no hay forma de crear un código de director.
2. Intentar generar un código con el email de un asesor que ya existe → tiene que negarse y decir quién lo usa.
3. **Registrarse con el código pero con OTRO email** → tiene que rechazarlo, no crear el usuario, y dejar el código sin consumir (verificar `is_used = false` después del intento).
4. Registrar una cuenta descartable con el email correcto y verificar que en `profiles` quedaron el celular **y el nombre que cargó el director**, aunque en el registro se haya tipeado otra cosa.
5. Registrarse con uno de los 2 códigos viejos sin email → tiene que seguir funcionando como hoy, sin validar.
6. Confirmar que el modo "crear una inmobiliaria" sigue pidiendo el nombre y funciona igual que antes.
7. Cargarle el celular desde la tarjeta a un asesor que hoy no lo tiene. Verificar el registro en `equipo_acciones`, y que el email se muestre en solo lectura.

### Etapas B y C — los documentos y las plantillas

8. Armar 3 `.docx` del mismo contrato con datos distintos, subirlos, detectar la plantilla, y revisar hueco por hueco que la detección sea correcta.
9. Subir una versión nueva con un párrafo agregado y un campo nuevo. Confirmar: los datos viejos se conservan, el campo nuevo queda pendiente, la versión anterior se puede restaurar.
10. Entrar como el asesor descartable: ve lo suyo y nada más. Probar a mano que no puede llegar al documento de otro asesor desde la app.
11. Romperlo a propósito: subir un `.doc`, subir un `.pdf` en la sección de plantillas, subir un documento de otro tipo, y detectar con solo 2 documentos.
12. Confirmar que un asesor pausado y uno desvinculado quedan fuera del versionado.
