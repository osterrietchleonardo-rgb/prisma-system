# Bitácora de sesiones

> **Para el agente, no para Leonardo.** Se lee al empezar cada sesión para no arrancar de
> cero. Lo entrada más nueva va arriba. Corta: qué se hizo, qué se decidió, qué quedó.
>
> La bitácora del negocio —qué se decidió, con quién se habló, qué se esquivó— va en el
> vault de Obsidian, en `10 Bitácora/`. Esa la lee Leonardo. Esta la leo yo.

## Cómo se usa

- **Al empezar:** leer las últimas 3 entradas. Alcanza para saber dónde quedó todo.
- **Al terminar algo importante:** agregar la entrada del día arriba de todo. Si el día ya
  tiene entrada, se le suma; no se crea otra.
- **Qué NO va acá:** lo que ya está en un archivo propio. Si el Norte cambió, se cambia el
  Norte y acá va una línea que lo dice. Esto es un índice de lo que pasó, no un duplicado.

---

## 2026-08-21

**El link del pipeline lleva al chat, y el Socio aprendió a sacar el contacto de LinkedIn**

Mergeado en `97392dc`. Dos scripts en `.claude/skills/vakdor-socio/scripts/`.

*Lo que se descubrió del CLI de Playwright, que es lo que más va a servir después:*
`playwright-cli open` abre **headless y con `user-data-dir: <in-memory>`**, así que **el login
se pierde entero al cerrar la ventana**. `--persistent` NO alcanza: hace falta `--profile`
apuntando a una carpeta real. Por eso la sesión de LinkedIn apareció caída, el outbound no
pudo correr y Leonardo no veía ninguna ventana (el proceso era `chrome-headless-shell`). Se
comprueba con `playwright-cli list`. El perfil vive en `~/.playwright-perfiles/`, fuera del
repo, porque guarda cookies de sesión.

*Sales Navigator no tiene URL de chat.* Su botón "Mensaje" es un overlay de JS y
`location.href` no cambia — comprobado. El link que sí funciona es
`linkedin.com/messaging/thread/new/?recipient=<publicId>`, y ese `publicId` sale del campo
`flagshipProfileUrl` de la API interna (`/sales-api/salesApiProfiles/(profileId:...)`), que
necesita el header `csrf-token` tomado de la cookie `JSESSIONID`.

*El modal de "Información de contacto" no se abre por URL:* `/overlay/contact-info/` redirige
al perfil. Hay que hacer **click** en el enlace. Y el contenido **no** se lee del `innerText`
del modal, que vuelve vacío: se busca el patrón de email en el HTML completo, filtrando los
dominios de LinkedIn. Rinde ~30% (4 de 14), pero trae mails personales que Apollo no tiene.

*Dos errores de método propios, para no repetir:*
1. **El `date` de Bash miente casi tres horas en esta máquina** (dio 13:08 cuando eran las
   15:44). Va `Get-Date` de PowerShell, siempre.
2. **Se midió el mercado solo sobre Argentina y se dio un consejo estratégico con eso.**
   Argentina: 50 prospectos. LATAM: 427. Un número correcto sobre un recorte equivocado suena
   a dato y es una opinión disfrazada.

*Y un límite del actor de Zonaprop:* en modo `entityType: agencies` el parámetro `location`
**no segmenta** — cinco corridas de cinco zonas distintas devolvieron la misma lista nacional.
Hay que pasar `startUrls`. A favor: ese modo devuelve `listings_count`, o sea la cartera de
cada inmobiliaria, a US$0,002 cada una.

**El recálculo de precios del mapa nunca había funcionado — 10 de 10 corridas fallidas**

Rama `fix/mapa-refrescar-delete-where`. Leonardo avisó que "el git action de mapa da
error". El que fallaba era `mapa-refrescar.yml`, no `mapa-manzanas.yml` (ese va 10 de 10 en
verde). Y no fallaba a veces: **falló las 10 veces que corrió desde el 12/8**. Los colores
y el ranking del mapa quedaron congelados con los números del 15/8; los pines no, porque se
leen en vivo.

Eran **tres** problemas, encadenados de modo que cada uno tapaba al siguiente:

1. **`DELETE requires a WHERE clause` (21000).** El rol `authenticator` tiene
   `session_preload_libraries=safeupdate`, que rechaza el `DELETE` pelado. Las tres
   funciones abren vaciando su tabla. → `DELETE FROM x WHERE true`.
2. **Techo de 8 s.** Ese mismo rol tiene `statement_timeout=8s` y el recálculo tarda ~40 s.
   → el cron dejó de pegarle al endpoint: ahora corre `scripts/refrescar-mapa.mjs` contra
   la base por Management API, igual que `mapa-manzanas.yml`.
3. **`refrescar_precio_m2` no terminaba ni en 2 minutos.** Una subconsulta correlacionada
   recorría las 356.314 filas de `_base` una vez por cada uno de los 4.621 barrios: ~1.600
   millones de filas. Precalculado una vez → **11,4 s**.

**El error de método que hay que no repetir.** Cada migración termina con un
`SELECT refrescar_...()`. Aplicada desde el editor de SQL corre como `postgres`, que no
tiene el seguro, y andaba perfecto. **Se probó por el camino que no es el de producción.**
Quedó la huella en los datos: `mapa_barrios` con fecha 15/8 11:15, que es cuando se aplicó
la migración a mano, no cuando corrió el cron. Una función que se llama por RPC hay que
probarla **por PostgREST**, no por el editor.

**Corrige la memoria de más abajo en este mismo día:** `service_role` **no** está "sin
límite". Su `rolconfig` es `null`, así que por PostgREST hereda los **8 s** del
`authenticator`. Medido: las tres RPC cortaron a los 8,2 s exactos. Lo que no reproduce el
problema es la Management API, que corre como `postgres`.

**Candado nuevo:** si un recálculo devuelve 0 filas, las funciones cortan con `RAISE
EXCEPTION` y la transacción revierte el borrado. Antes, un recálculo vacío dejaba el mapa
en blanco y devolvía `ok`. Se comprobó sin querer en producción: las tres borraron, murieron
por timeout a mitad, y las cuatro tablas quedaron **idénticas**. Antes de tocar nada se
copiaron a `respaldos.*_20260821` (155.848 filas); **ya se borraron** con el OK de Leonardo,
una vez verificado el mapa — los datos del respaldo eran del 15/8, o sea peores que los de
ahora: restaurarlos habría sido un retroceso, no un rescate.

Verificado antes de mergear: Action sobre la rama → **verde en 34,2 s**, los tres pasos OK.
Equivalencia de la reescritura comprobada corriendo la lógica vieja y la nueva sobre los
mismos datos. Y el mapa en el navegador con la sesión real de PRISMAIA - VAKDOR, escritorio
y celular emulado (390×844, iOS UA): colores por manzana, ranking con valores creíbles
(Puerto Madero US$ 5.590 con 1.178 avisos, Barrio Parque US$ 4.564, Palermo Chico
US$ 4.217), Recoleta en rojo y Almagro en verde, **cero errores de consola**.

**Mergeado a main** (`f7bb702`). Después del merge se disparó otra vez desde `main`:
**verde en 50,5 s** con los mismos números que la corrida anterior — 2.814 barrios, 89.956
celdas, 4.891 con precio, 78.780 manzanas—, o sea que el recálculo es determinista.

**Se cerró el bug de Central que llevaba 17 días**

La sugerencia de Carolina Etcheverry del 4/8 ("no puedo ver el link de la propiedad del
colega y no tengo cómo contactarlo"). **La hipótesis de que la propiedad ya no estaba en
roomix era falsa**: existe, `is_active = true`, con teléfono y links cargados, y no se toca
desde el 30/06. Eran **tres problemas distintos**, todos en el Buscador IA.

1. **"Compartir ficha" era una moneda al aire.** Buscaba por `slug` y no había índice: seq
   scan sobre **356.314 filas**, 4.674 ms medidos, y con `select *` arrastraba el embedding
   de 768 dimensiones de cada fila escaneada. Contra el `statement_timeout` de 8 s del rol
   `authenticated` a veces entraba y a veces no. **La prueba:** el 4/8 a las 22:54 ella
   compartió esa misma propiedad con éxito (quedó en `shared_properties`) y a las 23:28
   falló. Índice `idx_roomix_slug` aplicado en producción → **1,4 ms**.
2. **El endpoint ignoraba el error de la consulta.** Un timeout se reportaba como *"No se
   encontró la propiedad o no pertenece a tu agencia"*: falso, y sonaba a permisos. Ahora
   distingue "no pudimos traerla" de "el colega la despublicó".
3. **El botón del link exigía `roomix_agency_source_url`**, que le falta a **50.187**
   propiedades aunque el 100% tenga `canonical_url`. Ahora prioriza el aviso puntual del
   portal, que es el link que sirve.

Además, `phone` y `whatsapp` estaban en `roomix_properties` (**290.040 filas, el 81%**) y
nunca llegaban a la pantalla. Ahora están en la tarjeta y en el detalle.

**La decisión de negocio**

- **La ficha pública no lleva ningún rastro del colega** — ni nombre, ni logo, ni teléfono,
  ni links al aviso. Es la que el asesor le manda a *su* cliente: cualquiera de esos datos lo
  manda directo a la competencia. El contacto vive solo en la tarjeta, que es interna.
  Confirmado por Leonardo. Verificado buscando "CER GROUP", "zonaprop" y el teléfono en el
  HTML crudo de la ficha: cero coincidencias.

**Método que valió la pena**

- El caso se cerró **reconstruyendo la sesión real** desde `consultor_chat_messages` (28
  mensajes) y su `metadata.matchedProperties`, que guarda las propiedades que se mostraron.
  Ahí estaba el `id` exacto de la tarjeta que ella tocó. La captura adjunta a la sugerencia
  daba el mensaje de error literal, y ese `grep` llevó a la línea culpable.
- **Ojo con la hora:** la sugerencia figura como "4/8/2026, 11:31:51" en el admin y la base
  dice `23:31` AR. Es formato de 12 h sin AM/PM. Casi manda la búsqueda al día equivocado.

**Datos que corrigen la memoria**

- `roomix_properties` tiene **356.314 filas**, no 69k. El comentario del código en
  `app/api/ai/consultor/route.ts` y la memoria vieja decían 69k.
- `statement_timeout`: `anon` = 3 s, `authenticated` = 8 s, `service_role` sin límite. Medir
  con la Management API (service_role) **no reproduce** lo que le pasa al usuario.

**Cerrado el mismo día — NO crear tareas de esto**

- **Leonardo le respondió a Carolina y cerró la sugerencia él mismo** (11:23 AR del 21/08;
  `system_feedback.estado = 'resuelta'`, verificado en la base). Nada que hacer acá.
- **Las 3 fichas de prueba de `shared_properties` se dejan.** Decisión suya, no es deuda.

**Quedó pendiente**

- **El crawler tiene el mismo bug de paginación que acabamos de arreglar.**
  `loadExistingMap()` (`roomix-sync/crawler.mjs`, la que usa `main()` para el diff
  incremental) pagina con `.range(offset, offset+999)` sobre `roomix_properties`. Es el
  patrón que ya causó `canceling statement due to statement timeout` (documentado en
  TECNICO §11.3/§11.5) y ahora sabemos que el riesgo sobre esta tabla es real, no teórico:
  son 356.314 filas, muy por encima de las ~100k donde el patrón empezó a romperse. Está
  anotado como "candidato a revisar" desde ago-2026 y sigue sin confirmar en vivo. **La
  forma correcta es paginar por clave** (`id > último`), como ya hace
  `backfill-faltantes.mjs`.
- Las fotos de roomix se sirven desde `cdn.roomix.ai`, así que ese dominio se ve en el código
  fuente de la ficha pública. No identifica a la inmobiliaria; sacarlo obliga a re-hostear.
- Sigue pendiente lo de los audios/imágenes/videos del cliente que no se ven en el chat
  (Meta manda `media_id`, no URL) y los trámites de DNDA e INPI.

---

## 2026-08-20 (cierre del día)

**Qué se construyó**

- **El Socio se mergeó a `main`** (12 archivos, 1.502 líneas, cero borradas). Vivía solo en
  `feat/socio-agente-autonomo`, así que al pasar a `main` desaparecían del disco los scripts y
  `scratch/clickup-ids.json`, y `/socio` no arrancaba. Las dos ramas no compartían ni un
  archivo: el merge fue aditivo. Red de seguridad en `respaldo/main-antes-del-socio` (f8af8d8).
  **Sin pushear** — sube cuando otra terminal lo haga.
- **El enfoque de engagement de LinkedIn** para la extensión de Chrome, en el vault:
  `20 Frentes/engagement-linkedin.md`. Redacta el comentario y **no lo envía**.
- **Los mensajes de seguimiento** con la técnica de la pregunta que se contesta con un "no".

**Tres decisiones**

- **El pipeline dice la verdad aunque el número quede peor.** De cinco "esperando respuesta",
  tres eran descartes por perfil. Quedaron dos conversaciones vivas. Un pipeline inflado no
  sirve para decidir.
- **La apertura no entra nunca por WhatsApp.** Reduce PRISMA a un chatbot. Se entra por el
  core: romper la dependencia operativa. Dicho por Leonardo, guardado en la memoria del eje.
- **La decisión sobre el agente de seguimiento no se toma sin leer el plan.** Bloque agendado
  el lunes 24, 09:00-10:30, solo para leer.

**Errores propios**

- **Se le dijo que venía pateando a Héctor Sapriza hace 60 días. Era falso:** ya había hablado
  con él por WhatsApp. El recolector lee **solo las bandejas de LinkedIn**, y un hilo mudo ahí
  no prueba nada. Regla: antes de acusarlo de estar pateando algo, descartar los otros canales.
- **Se le dijo que eran las 18:20 cuando eran las 15:26.** Se leyó el reloj UTC del recolector
  como si fuera hora local. Se le estaba dando el día por terminado con dos horas por delante.
- **Se abrió por "cómo manejan los WhatsApp".** La memoria del eje ya decía desde el 11/07 que
  al director le interesa recuperar el control, no el software. Se fue igual a la función más
  fácil de explicar.
- Un `grep -r` sin filtros sobre el repo entero se colgó a los 120 s. Para buscar en el
  código va la herramienta de búsqueda, no `grep` recursivo desde la raíz.

**Límite nuevo del sistema**

- ClickUp devuelve `FIELD_033: Custom field usages exceeded for your plan` al escribir campos
  personalizados en tareas **ya existentes** (al crearlas sí funciona). *Veces postergada*,
  *Último toque* y *Motivo de pérdida* no se pueden actualizar. **Workaround:** todo va en la
  descripción, que no tiene tope. No rompe el outbound diario: excluye por nombre, no por fecha.

**Quedó pendiente**

- El bug urgente de Central (link de la propiedad del colega) lleva **15 días**. Movido al
  viernes 21/08 09:00. Si se vuelve a mover, es un patrón.
- Los audios, imágenes y videos que manda el cliente no se ven en el chat. Meta manda un
  `media_id`, no una URL, y nadie lo baja. El reproductor ya existe.
- Registrar PRISMA en la DNDA (obra) y la marca Vakdor en el INPI: **son dos trámites
  distintos**, en dos organismos distintos.

---

## 2026-08-20

**Qué se construyó**

- `outbound-diario.mjs`: entra a Sales Navigator con la sesión real, lee la búsqueda
  guardada con paginación y deja **10 candidatos del día en "sin contactar"** en el
  pipeline, con link al perfil y el motivo de la elección. Nunca manda mensajes.
- Se versionó `scratch/clickup-ids.json`: los dos scripts dependen de él y estaba solo en
  el disco, dentro de una carpeta gitignoreada.
- Se escribieron 4 memorias de proyecto (el Socio, el Norte, el outbound y el vault). Antes
  la memoria entre sesiones no sabía que nada de esto existía.

**Tres decisiones**

- El filtro del outbound **no usa la marca "Guardado"**: se cruza contra las dos bandejas
  reales. Guardar un lead no es escribirle, y estaba escondiendo a los mejores.
- **Un saludo no cuenta como contacto.** Los que solo tienen "me alegro de que hayamos
  conectado" o una felicitación suben al principio de la lista.
- Se descarta por **sub-rubro**, no por cargo: gerentes y socios entran; desarrolladoras,
  constructoras, tasadoras y cámaras no, porque no tienen equipo de asesores.

**Errores propios**

- Un reemplazo automático escapó todas las letras "s" y "d" del script y lo rompió. Se
  restauró de Git y se reescribió entero. Causa raíz: `\s` dentro de un template literal
  llega al navegador como `s`. Todo el código que va al navegador usa `String.raw`.
- Se cambiaron los estados de la lista de ClickUp con tareas adentro y quedaron huérfanas
  (la lista decía 5 y ninguna consulta las traía). Orden correcto: primero los estados,
  después las tareas.

**Hallazgos que valen plata**

- 5 CEOs de inmobiliaria (SkyOne, BRIKSS, R&R, Döst) solo habían recibido una felicitación
  de aniversario. Nunca la propuesta.
- **Beatriz Carámbula es presidenta de la Cámara Inmobiliaria Uruguaya** y es contacto de
  primer grado. No es clienta: es la red de todo el país.
- Tres personas mostraron interés y nunca recibieron respuesta: Cristian Ascanio (43 días),
  Héctor Sapriza (60) y Leandro Mugianesi (14).

**Quedó pendiente**

- Marcelo Quispe y Yani Jacobi pidieron el material el 6 de agosto. Siguen sin seguimiento.
- La búsqueda guardada se agota: de 340, ya hay ~90 contactados. Habrá que ampliar filtros.

---

## 2026-08-19

**Qué se construyó**

- **La sesión de fundación** → `00 Norte/Norte.md` con los números reales, sacados de
  producción y no de memoria. Ver la memoria [[norte-vakdor-numeros-reales]].
- El vault de Obsidian con sus hubs y la skill `vakdor-obsidian` con la regla de estructura.
- Se conectaron Buffer (por el CLI oficial) y NotebookLM (28 notebooks).
- Se re-priorizaron las 76 tareas contra el Norte: 7 bajaron a "baja" por ser módulos
  nuevos, que este año no se construyen.

**Decisiones de fondo**

- **Escalonado, no 50k en 12 meses:** 5-6 clientes y US$20-25.000/mes a 12 meses; el
  producto que escala viene después.
- **Posicionamiento: complemento del CRM, nunca reemplazo.** A priori solo Tokko.
- La jornada real es de 6 horas: 9-10:30, 11-13 y 15-17:30. **Las 13 a 15 son de su familia
  y no se agenda nada, nunca.**

**Errores propios**

- Se reportó un fallo del bot que Leonardo ya había arreglado: el recolector pedía los
  últimos errores de n8n **sin filtrar por fecha**. Ahora la ventana es de 48 h.
- El token de Buffer siempre estuvo bien; fallaba la query GraphQL escrita a mano.

---

## 2026-08-18

**Qué se construyó**

- Se conectaron ClickUp, Zoho Mail, Notion, MailerLite y Composio.
- Se diseñó el Socio (spec en `docs/superpowers/specs/`), el recolector y el comando.
- Se limpió MailerLite: 102 rebotados borrados, 136 importados en cuarentena. La lista
  tenía 40% de rebote y podía quemar el dominio.
- Se extrajeron **69 compromisos** de 10 notas de reunión de Gemini y **se verificó cada
  uno contra el código y producción**: 16 ya estaban hechos. Ver
  `docs/interno/verificacion-compromisos-2026-08-18.md`.

**La regla que salió de ahí**

- **Verificar antes de crear.** Un grep positivo no alcanza: hace falta el archivo, la
  columna o filas reales. Crear una tarea ya hecha destruye la confianza en el sistema.

**Errores propios**

- Se mandó un mail a `@keymexchile.cl` cuando la dirección real era `.com`. Se leyó la
  dirección truncada en vez de verificarla en el hilo. Regla: confirmar la dirección exacta
  en el hilo antes de escribir.
