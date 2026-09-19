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

## 2026-09-19 — Alquiler: sin avisos repetidos al equipo y con handoff inmediato (pedido de Kevin)

**El pedido (Kevin, por WhatsApp a Leonardo):** «Apaguemos el reporting de cada tantas horas
para los alquileres y que haga el Handoff lo más rápido posible; recién leí una conversación en
un perfil que fue bastante larga». Leonardo: filtrar los avisos de alquiler, dejar los de venta,
y ver qué pasa con el handoff.

**Lo medido en producción antes de tocar nada (Central, 30 días):**

| | compra | alquiler |
|---|---|---|
| conversaciones | 267 | 175 |
| terminaron derivadas | 27 % | **13 %** |
| mediana hasta derivar | 11 min | **77 min** |

Y en 7 días, de los 240 avisos al equipo del agente de seguimiento, **63 eran de alquileres**
(los otros 85 `aviso_equipo` del período los manda n8n al derivar: esos NO se tocaron).

**El caso que lo explica** (Rosario, 14/9, oficina de Serrano al 1000, 51 mensajes): preguntó
las condiciones de alquiler a las 14:02, Sofía contestó «eso lo precisa Carolina» y **siguió
calificando** (urgencia, hace cuánto busca); volvió a preguntar a las 14:16 y otra vez a las
15:51, cuando entró la asesora 1 h 45 después. Nunca hubo handoff.

**Causa real: se lo estábamos pidiendo al prompt.** Decía «NO derives… que pregunte un dato que
no está en la ficha… y avanzá con la siguiente pregunta». Bien para una venta; en alquiler las
condiciones (garantía, caución, honorarios, depósito) **nunca** están en la ficha.

**Lo hecho:**
1. `lib/seguimiento/operacion.ts` (nuevo) + filtro en `escalamiento.ts` y en `avisarPorEscalar`
   de `avisos.ts`: en alquiler no salen la escalera (2/5/10/20 h) ni el aviso suelto. Ante la
   duda **avisa**: si `tipo_operacion` falta o es ilegible, el aviso sale igual. Nuevo contador
   `ResumenEscalamiento.sinAvisoPorOperacion`. Merge a main `c9397c8`.
2. **Prompt de n8n (nodo `Agente IA CEO`)**: párrafo nuevo «EN ALQUILER, LAS CONDICIONES SON DEL
   ASESOR» + la excepción en el «NO derives». 70.972 → 71.808 caracteres, 31 expresiones `{{ }}`
   intactas, 89 nodos, `active: true`, `binaryMode`/`timeSavedMode` conservados. Backup previo en
   el scratchpad de la sesión (`backup-PRISMA-antes-alquiler-*.json`).

**Qué mirar mañana:** los avisos de alquiler del agente tienen que caer a ~0 (la línea de base
fueron **21 en las últimas 24 h**), y la mediana de minutos hasta el handoff en alquiler tiene
que bajar de 77. Ojo con el efecto esperado: **más emails de derivación en alquiler**, que es el
canje buscado (uno a tiempo en vez de cuatro tarde).

**Pendiente:** el `.md` del prompt en `docs/interno/agente-conversacional/` sigue siendo el del
25-ago y ya no refleja lo vivo (le faltan los cambios del 16-sep y este).

## 2026-09-18 — Prefactibilidad: cualquier dirección de CABA → lote oficial, cuánto se puede construir y cuánto vale la tierra

**Qué se construyó (rama `feat/prefactibilidad`, worktree propio, 19 tareas + 19a + 19b por
subagent-driven-development; spec `docs/superpowers/specs/2026-09-12-prefactibilidad-design.md`,
plan `docs/superpowers/plans/2026-09-17-prefactibilidad.md`).** Página **Propiedades →
Prefactibilidad** para asesor y director: el buscador usa el normalizador de direcciones del GCBA
(USIG), la puerta se resuelve contra el CSV de frentes cargado en `gcba_puertas`, el contorno del
lote y la manzana vienen de epok (catastro) con caché en `gcba_parcela_cache`, el Código por parcela
está en `gcba_parcelas_cur` (318.127 filas) y la **envolvente oficial** se lee de las teselas
vectoriales de Ciudad 3D (`volumen_edif`). Cálculo en `lib/prefactibilidad/*` con tests; la regla del
cuarto (LFI) es control y respaldo cuando no hay envolvente. Valor de la tierra: mediana y rango de
terrenos en venta de `mercado_avisos` a 800 m (RPC `prefactibilidad_terrenos_cerca`, mínimo 5).
Guardar en `prefactibilidades` (el servidor recalcula desde `{smp, direccion}`, nunca confía en el
snapshot del cliente) y ficha pública por token en `/prefactibilidad/[token]` (noindex, PDF).

- **Adenda 17-sep:** las capas de Ciudad 3D son teselas públicas
  `vectortiles.usig.buenosaires.gob.ar/cur3d/{capa}/{z}/{x}/{y}.pbf` (gzip sin Content-Encoding).
  Roosevelt 4554: 261 m²/planta oficial vs 242 por la regla del cuarto → la envolvente oficial es la
  fuente.
- **Validación (18-sep):** 21 filas / 20 parcelas contra la capa oficial 2021 del GCBA como oráculo
  (±5 %): **0 fallas, 0 sin dato**. TodoProps NO es oráculo: sobreestima lotes profundos y en
  corredores publica el basamento (spec enmendada). Evidencia en
  `docs/superpowers/specs/evidencia/prefactibilidad/2026-09-18-validacion-20-parcelas.md`.
- **Producción (con OK de Leonardo, 18-sep):** migraciones `20260918100000_prefactibilidad_gcba` y
  `20260918100100_prefactibilidades` por Management API (RLS select + revoke de escritura directa;
  RPC solo `service_role`); carga del Código y de las puertas con los scripts de `scripts/gcba/`.
  Comprobado con la clave anon: select vacío, insert 401, token falso → 404.
- **Hallazgo en producción (19a):** USIG dice "ROOSEVELT FRANKLIN D." y frentes "AV. FRANKLIN D.
  ROOSEVELT"; la clave de calle ahora saca partículas y preposiciones y ordena las palabras
  (`normalizar-calle.ts`): 27/40 → 40/40 puertas resueltas en la muestra. Puertas recargadas.
- **Navegador (escritorio 1440 y celular emulado, PRISMAIA - VAKDOR):** Zuviría 3939 (atípica,
  1.128 m²/nivel), Roosevelt 4554 (261 m²/nivel, sin avisos), Cabildo 2040 (dos alturas, CM+CA con
  basamento, PH consolidado, 52 comparables), "Mitre 100, San Isidro" → "Por ahora solo Ciudad de
  Buenos Aires", "Zuviria 3941" → "No encontramos ese número…", Guardar/Compartir, ficha pública sin
  sesión. Arreglos de 19b: fecha corrida un día (UTC), desplegable que reabría, buscador vacío al
  abrir una guardada, error de hidratación por `<style>{CSS}</style>`, decimales con punto, "1 pisos",
  botón PDF ilegible con color oscuro, y el buscador deshabilitado mientras se abre una guardada (una
  respuesta tardía pisaba lo que se tecleaba).

**Decisiones:** ficha para el dueño del lote (captar terrenos); edificabilidad + valor de la tierra,
sin plusvalía ni IA; huella real en manzana típica y rango con aviso en el resto; solo CABA.

**Trampas:** el portal de datos exige `User-Agent` de navegador; epok por `x,y` devuelve `{}`
siempre; PostgREST no escribe JSON en columnas `geometry` (por eso `jsonb`); `next lint` no revisa
los `.mts`; los agentes de exploración no ven el worktree y leen el repo principal.

**Revisión final de la rama (opus, 46 commits):** 0 críticos, 4 importantes y 15 menores; informe en
`docs/superpowers/specs/evidencia/prefactibilidad/2026-09-18-revision-final.md`. Se arreglaron los 4
importantes (unidades sin plantas en la ficha, "0 m² a 0 m²" en el caso degradado, test del basamento
que no probaba nada, error de la RPC de terrenos tragado) y 5 menores baratos; re-revisión aprobada.
Quedan 10 menores anotados en ese informe, ninguno bloqueante (el más visible: el contador de vistas
de la ficha pública lo puede incrementar cualquier anónimo, igual que las 4 fichas compartidas que ya
existen; cambiarlo es DDL en producción).

**Abierto:** el OK de Leonardo para el merge. Descartado: la revisión automática
marcó un SSRF potencial en `app/api/acm/comparable-link/route.ts` (de main, 16-sep); verificado que
esa ruta llama a `comparableDesdeLink` → `extractFromUrl` (`lib/acm/extract.ts`), que ya pasa por
`lib/acm/url-segura.ts` desde la entrada del 16-sep. Falsa alarma.

---

## 2026-09-17 — Farming etapa 3-B: el tablero, el historial que se escribe solo y los nueve números

**Qué se entregó** (rama `feat/farming-tablero`, 17 commits (más el de docs) desde `7263a22`): las seis columnas
con `@dnd-kit` y el menú «Mover a…» (el camino real en el celular), el diálogo obligatorio al
mover, `farming_contactos` llenándose solo con cada movimiento, los nueve indicadores del punto 8
calculados en el servidor, el botón que pasa un propietario al pipeline de Tracking, y las tres
trampas que había dejado la 3-A.

**Migración aplicada** (`20260917180000_farming_tablero.sql`, con el OK de Leonardo, verificada en
`pg_indexes`): UN índice, `farming_contactos_propietario_idx (propietario_id) where propietario_id
is not null`. Ninguna tabla, ninguna columna, ninguna política. El segundo índice del plan se
descartó con el razonamiento escrito adentro de la migración: los indicadores filtran solo por
`direccion_id` y cuentan en JS.

**Las reglas que sostiene el código** (no cambiarlas sin preguntar):
- **Sin la fecha del próximo paso no se guarda el movimiento.** La pantalla y el servidor corren
  la MISMA `validarMovimiento` — no hay una segunda copia que se despegue.
- **El movimiento y su historial van en UN pedido.** Si el historial falla, `mover` revierte los
  CINCO campos que pisó, no solo la etapa; y si el revert también falla, lo dice con otras
  palabras en vez de mentir.
- **`etapa` NO está en `COLUMNAS_EDITABLES` del PATCH.** Cambiar de columna es trabajo exclusivo
  de `/mover`, que es el que firma el historial.
- **Una persona, una sola actividad en Tracking.** Tres capas: la tarjeta ya enlazada; la
  actividad colgada que se busca por `metadata->>farming_propietario_id` y se repara; y el enlace
  condicional, donde el que pierde la carrera borra su propia actividad.
- **Las escrituras de `mover` son condicionales** (`.eq("etapa", …)` + `count` exacto estricto):
  si alguien movió la tarjeta antes, es 409, no una pisada silenciosa.

**Errores propios que valen más que el código:**
1. **Puse la lista como vista por default.** En el celular eso dejaba al asesor sin «Mover a…» ni
   historial: podía ver sus tarjetas y no trabajarlas. Lo revirtió la revisión final. Arranca el
   tablero.
2. **Di por buena una advertencia del implementador sin verificarla:** dijo que
   `performance_logs` no tenía dónde guardar el nombre. Tiene `nombre_cliente`. Lo verifiqué
   contra `information_schema` — no contra su palabra.
3. **Un revisor propuso rechazar `lat: null`.** La pantalla lo manda de verdad
   (`direccion-dialog.tsx` borra el punto cuando el asesor reescribe la calle tras elegir una
   sugerencia): un 400 ahí rompía el alta. El agujero real era otro — un geojson ilegible se
   trataba igual que «no hay punto» y estampaba un `false` que nadie calculó, borrando la fecha
   de cuándo se cayó afuera.
4. **Dos pruebas que no mataban su bug:** la de «no recalcula si no toca lat/lng» tenía un fixture
   coherente (recalcular o no daba lo mismo), y la de la fecha de Buenos Aires solo fallaba tres
   horas por día. Las dos corregidas con sabotaje verificado.

**Verificado de verdad:**
- `scripts/farming-rls-ataque.mjs` extendido a **43 ataques** (los nuevos: mover la tarjeta ajena,
  firmar un contacto como otro, estampar un `tracking_log_id` ajeno). Corrido contra producción:
  todos fallan, los controles positivos pasan, ninguna fila cambió, limpieza automática, exit 0.
- **En el navegador** (asesor de prueba, dev en 3011): el movimiento completo escribió su historial
  firmado («Carta 1 · 17/9/2026 · Relevado → Presentado · Lo anotó Prueba Farming A») y los nueve
  números **se actualizaron solos** (0 → 1 → 2 en «Contactos realizados»). «Anotar sin moverla»
  deja la tarjeta en su columna. «vencida» sale como palabra. A 390 px: **0 px de desborde
  horizontal** y **ningún elemento tocable por debajo de 44 px** (la tira de «Descartadas»,
  54×442). Los dos temas mirados.

**Deuda anotada, no escondida:**
- `proxima_accion` y `proxima_accion_en` se pueden corregir desde el diálogo de editar **sin dejar
  historial**. Decisión consciente: forzar un movimiento falso para arreglar un typo ensuciaría el
  historial. Costo: en zona compartida un colega corre esa fecha sin firma.
- No hay tercera compensación si el revert de `mover` también falla: se avisa en castellano.
- `actividadYaCreada` consulta `performance_logs` por un campo JSONB sin índice. Hoy son decenas
  de filas; si el Tracking del cliente crece, conviene una columna propia.
- `farming_contactos.propietario_id` **no lo llena nadie todavía**: el historial no se asocia a la
  persona concreta de la puerta. El índice ya está aplicado y sirve para el DELETE de personas.
- El widget de chat flotante tapa la esquina inferior derecha del tablero. Es global, no de esta
  rama.

---

## 2026-09-16 — ACM: el link ya no puede abrir direcciones internas, y el barrio de los links

**Link seguro (pedido de Leonardo, con el requisito "si el ataque no falla, no está hecho").**
`extractFromUrl` abría cualquier `http(s)` con `redirect:"follow"` desde el 25-jun: con sesión se
podía hacer que el servidor abriera `169.254.169.254`, `127.0.0.1:3000` o un link que redirigía
adentro. Decisión: cualquier host público, nada interno. `lib/acm/url-segura.ts` (detalle en
TECNICO §10.6): forma del link, DNS (todas públicas) y control AL CONECTAR, en cada salto.

- **Por qué no alcanzaba con validar y después `fetch`:** el `fetch` global de Node no deja
  controlar la IP al conectar, y un DNS que responde público y después interno se lo saltea. Por
  eso `node:http(s)` con `lookup` propio. La prueba del DNS cambiante lo demuestra (2 consultas,
  0 pedidos al servidor interno).
- **Verificación:** ataques en pruebas + servidor real en 127.0.0.1 que cuenta pedidos (0, con
  control que prueba que responde); 10 mutantes muertos, incluido reponer el `fetch` original;
  internet real (redirectores de httpbin hacia 169.254.169.254 y 127.0.0.1, `localtest.me`)
  rechazados; navegador: el link de metadatos muestra "Ese link no se puede abrir…", Argenprop
  carga igual. 2.340 pruebas.
- **Abierto:** el navegador del extractor de EasyPanel sigue redirecciones que haga la página,
  dentro de la red de n8n. Ya no recibe links internos; cerrarlo del todo es otro cambio + redeploy.

**Barrio de los links.** Argenprop y Zonaprop ponen la ciudad en `addressLocality` y el barrio
en `addressRegion`; Tier 1 se quedaba con "CABA, Argentina". `elegirBarrio` (puerto de la regla
del extractor con navegador). Navegador: "Desde un link" da "Palermo Chico" + "Barrio reconocido".
4 mutantes muertos.

**Hecho también hoy (con OK):** redeploy del extractor en EasyPanel (`98ae1df`, Argenprop con 5
fotos) y las 2 sugerencias de Carolina Etcheverry resueltas en admin-vakdor (las otras 3 ya las
había marcado Leonardo). Datos de prueba en PRISMAIA - VAKDOR: ACM `1bd60870`, `c1fe5f5d`, ficha
`lTb19sULahAu` (sin borrar).

**Trampa:** `git stash list` en un worktree muestra los stash de TODOS (hay uno "bitacora en
progreso, no es mia"). No tocarlos.

---

## 2026-09-16 — Sofía: cuando derivaba, el cliente no recibía ningún mensaje

**Qué pasaba:** `/api/n8n/reply` descarta toda respuesta si el bot está apagado (existe desde abril
para no pisar a un asesor que toma la charla a mano). Pero `Gestion_Handoff` apaga el bot EN EL MEDIO
del turno de Sofía, antes de que salga su mensaje ("te conecto con el equipo / te derivo con
[asesor]"), y ese mensaje se descartaba: *"Bot pausado: respuesta descartada — el agente humano tomó
control"*. Visto con el primer cliente real atendido por luna (Elian, colega, 16-sep 15:40).
Confirmado en 4 ejecuciones del 16-sep (Elian 15539, Mariana 15496, Ines 15504, Julia 15525). En 30
días, ~76 de 109 derivaciones sin mensaje al cliente (medición por palabras, aproximada). Casos que
lo muestran: Paula (15-sep) "¿Se comunica un asesor conmigo?" sin respuesta; juan_ogo (9-sep) "No
recibí respuesta".

**Arreglo (rama `fix/derivacion-mensaje-al-cliente`):** `lib/whatsapp/derivacion-propia.ts`. Con el bot
apagado, el mensaje pasa SOLO si hay una marca "⚠️ Handoff activado" (la escribe únicamente el
subflujo de n8n; el botón del asesor apaga sin marca) de los últimos 5 minutos, y después de ella no
escribió ni un asesor (`human`) ni el cliente (`lead`). Ante cualquier duda, o si la consulta falla,
se sigue descartando. El bot queda apagado: la ruta no lo toca.

**Decisión:** Leonardo propuso mover el apagado al final del flujo de n8n (mensaje primero, apagado
después). Se descartó con datos: el mensaje sale 16-20 s después de derivar, así que abre una ventana
en la que Sofía contestaría de nuevo, y si el envío falla el bot queda prendido (lo que le pasó a
Sonia). Se eligió el arreglo en la app; Leonardo delegó la decisión.

**Verificación:**
- Prueba de la ruta con la derivación: FALLÓ con el código anterior y pasa con el arreglo. Las del
  botón del asesor, el cliente que vuelve a escribir y el envío normal pasan en los dos.
- 9 pruebas de la regla (bordes de 5 minutos, fecha rota, marca de otro texto).
- Casos reales en el segundo exacto del envío: Elian, Mariana, Ines y Julia pasan de "descartado" a
  "se envía"; Sonia a las 09:31 (turno posterior a su derivación) se descarta.
- Bytes de la marca idénticos en los 242 mensajes guardados desde abril.
- Suite completa: 125 archivos, 2.275 pruebas, 0 fallas. Tipos sin errores; los 2 avisos de lint de
  la ruta ya estaban en `main` (`prefer-const` en `evoPayload`/`metaPayload`).

**Pendiente:** ver la primera derivación real después del deploy. Sigue abierto aparte: Sonia (16-sep
08:59) tuvo la marca de derivación y el bot quedó prendido 30 min.

---

## 2026-09-15/16 — Sofía: dejar de preguntar lo que la ficha del link ya contesta (aplicado en n8n)

**De dónde salió:** sugerencia del asesor Eric Zambrana (Central), `system_feedback`
`143c4b25-90eb-4459-a5ea-67e1c1960605`, 15-sep 12:30. No traía link a la charla; el caso se
encontró buscando: **Emilio, 14-sep, `997786fa`**, depto de 1.470.000 USD en Puerto Madero.

**El diagnóstico, que cambió el arreglo:** el bot NO desobedeció el prompt, lo cumplió.
`metricas` se llena con lo que el cliente **teclea**, nunca con la propiedad por la que entró.
Emilio nunca escribió "Puerto Madero" → `zona` y `barrio_consultado` en `null` → "Zona" era el
**punto 1** de FALTA DEL MÍNIMO → el prompt dice "tu próxima pregunta es la PRIMERA de esa
lista". Por eso el arreglo va en tres nodos, no solo en el prompt.

**Medido contra producción (30 días, 465 conversaciones que arrancan con un link)**

- "¿en qué zona?" tras entrar por link: **26**; ambientes 4; compra/alquiler 3.
- Cerró con "¿en qué presupuesto te manejás?": **272 (61%)**. Ofreció reemplazar la propiedad
  del link: **29**. Propiedades de ≥500k USD: 7, y las 4 que se leyeron fallaron igual.
- `barrio_consultado` con dato y `zona` vacía: **80 de 516** (`Armar_Memoria` solo miraba
  `zona`, aunque `calificacion_completitud` ya los contaba juntos).
- Repreguntó el **nombre** ya dado: 8 conversaciones, siempre entre 0,3 y 2,4 min después
  (una, dos veces en 18 s). Repreguntó el **presupuesto** tras una respuesta numérica: 18.
  La regla ya existía (ANTI-REPETICIÓN nº 7) y se incumplió igual: patrón 1.

**Qué se aplicó** (16-sep 00:38, `scratch/aplicar-prompt-ficha-obvia.mjs --apply`, 17 parches)

- `Agente IA CEO` (15): sección nueva LO QUE LA PROPIEDAD YA CONTESTA (operación, tipo, zona y
  ambientes resueltos por la propiedad, con su bloque ESTO NO QUEDA CONGELADO) · la memoria va
  un turno atrasada y el historial le gana · la respuesta a lo que preguntó va ANTES de la
  ficha · el cierre deja de ser el presupuesto · se omite la línea `Ficha completa:` cuando es
  la propiedad que él trajo · el presupuesto nunca se usa contra esa propiedad · handoff por
  conducta (pregunta si sos persona → ofrecerle el asesor en ese mismo mensaje; permuta,
  financiación, uso para un evento, consulta de empresa → derivar sin calificar) · prohibido
  hablarle de "ficha interna", "el registro", "el campo estructurado".
- `Armar_Memoria`: Zona resuelta con `barrio_consultado || zona`.
- `Analizar_Conversacion1`: regla 27 — la propiedad consultada llena barrio, operación, tipo y
  ambientes; gana siempre lo que dijo el lead, y lo más nuevo.

**Decisiones de Leonardo:** el presupuesto deja de ser la pregunta de cierre · el "ticket alto"
se dispara por **conducta del cliente, sin umbral de precio** (7 casos en 30 días no justifican
una rama por número que el bot solo conoce después de buscar) · alcance: prompt + los dos
nodos de sistema.

**Verificación**

- `Armar_Memoria` corrido contra **517 filas reales**: 0 datos perdidos; conversaciones con
  "Zona" pendiente 142 → 62. La primera corrida dio "80 perdidos" y **era un error del test**:
  al salir Zona la lista se renumera y se comparaba con el número adelante.
- 17 anclas únicas; delta de expresiones declarado; 89 nodos y conexiones intactos; relectura
  posterior independiente, no la del script que escribió.
- **Tres contradicciones propias cazadas al releer** (patrón 4): "no se los preguntes NUNCA"
  con su excepción quince renglones abajo · "LA ÚNICA EXCEPCIÓN" cuando pasaron a ser dos ·
  el presupuesto repreguntable a los 55 s.

**Costo:** el bloque dinámico sube 2.553 → 2.807 chars (~77 tokens por turno; ~3.700 mensajes
de clientes en 30 días). Lo demás es estático y cachea.

**Línea de base:** Christopher (`207a11df`) terminó 00:32:49, seis minutos ANTES de aplicar,
y muestra los dos síntomas (mandó `Ficha completa:` de la propiedad del link y cerró pidiendo
el presupuesto).

**Primera lectura en tráfico real (16-sep, 11 h después, 4 conversaciones nuevas, todas por
link; Ines derivó sola por ser colega).** Poca muestra: tendencia, no prueba.

- Funcionó, visto en las ejecuciones: el extractor llenó barrio/operación/tipo/ambientes
  desde el link en **4 de 4** (Tania solo escribió "me gustaría ver este departamento" y quedó
  San Telmo/compra/depto/1). Zona preguntada 0, reemplazo ofrecido 0, desajuste marcado 0.
  **Mariana** (`599ff9db`, 550.000 USD): respuesta primero ("sí, figura como apta crédito"),
  cierre en NIVEL 2 (crédito), **salteó "Ambientes" aunque la lista lo pedía** (exec 15480),
  y derivó a los 57 s cuando preguntó si el precio se negociaba.
- A medias: omitir `Ficha completa:` se cumplió 1 de 2 (Viki exec 15514 sí; Mariana 15480
  no, la escribió el agente mismo).
- **Hallazgo grande, PREEXISTENTE:** el extractor anota como presupuesto el precio de la ficha.
  Presupuesto = precio en 105 de 252 leads por link (30 días); en **74** el cliente no
  escribió ni un número. Mariana es uno (550.000 = el chalet). El asesor recibe un dato falso
  y el bot nunca pregunta el presupuesto. La regla 27 ya lo prohibía y el nano lo hizo igual:
  no se arregla con texto, va un guard. **Propuesto, no aplicado.**
- Preexistentes vistos en Viki (`d04559b5`): mostró un depto "Apto mascotas: No" a una clienta
  con gato; `Formato_Mensajes` duplica fichas y **mete un `Video:` vacío que el agente no
  escribió** (verificado comparando salida del agente vs Formato); la 3.ª pregunta de
  presupuesto salió porque el mensaje con el número llegó con la ejecución ya en curso
  (exec 15518 solo vio "Te cuento") — la ventana sin lock — y además pasó el máximo de 2.
- Script para leer ejecuciones por conversación: `scratch/_ejecuciones-viki.mjs <conv> <desde> <hasta>`.

**Presupuesto con cita — APLICADO 16-sep 12:48 (AR)** (`scratch/aplicar-presupuesto-con-cita.mjs`)

- Extractor: el presupuesto solo existe si el lead lo dio; campo nuevo `presupuesto_cita` (textual).
  Nodo `Execute a SQL query`: guarda el presupuesto solo si la cita está en lo que el lead escribió
  o dijo por audio (`n8n_chat_histories` + `wa_messages`), no es pregunta, y trae el número
  (entero/miles/millones) o lo acepta con palabras. Si la nueva no vale, conserva la guardada que
  sí; los viejos sin cita se limpian solos en el próximo mensaje.
- Sofía: el **rango de presupuesto se pregunta temprano** (la pregunta siguiente a la ficha), sin
  anclarlo en el precio del link (pedido de Leonardo; el parche del 15 decía "anotalo como
  referencia" y "va al final"). Repetidas se controlan por enlace Y dirección.
- Diseños descartados con datos: lista de palabras v1 borraba 5 de 14 presupuestos reales; v2
  dejaba pasar a Mariana ("¿el valor es final?").
- Verificación: modelo real sobre 18 conversaciones × 2 corridas → inventados 4/10 → 0/10, reales
  7/7 (incl. audio). SQL exacto sobre tabla temporal: 14/14 con chequeo exacto de claves. 6,6 ms
  por consulta (`n8n_chat_histories` sin índice por `session_id`, 18k filas: índice opcional).
- **Custodia:** el primer `--apply` abortó: a las 12:43 se cambió el respaldo del agente de Sonnet a
  DeepSeek (el prompt quedó idéntico). A las 12:47:39 se revirtió. Mi escritura (12:48:14) tomó ese
  estado; no se borró nada ajeno (tres backups en `scratch/n8n-backups/PRISMA-2026-09-16-*`).
- **Trampas propias:** pasé "corrida1" por argv a un script que importa `sql-produccion.mjs` (lo
  ejecuta como SQL; error de sintaxis, nada escrito). Python metió retrocesos `\x08` por `\b`.
- **SIN TRÁFICO TODAVÍA:** 0 ejecuciones después de aplicar. Primer control: que el nodo SQL no
  devuelva error (si falla, falla en silencio y la ficha deja de actualizarse). A las 13:21 se
  comprobó que tampoco entraron mensajes de clientes a `wa_messages`: no hubo nada sin procesar.

**DeepSeek y luna (16-sep, tarde).** DeepSeek descartado para Sofía por datos (política: datos en
China; términos de API: ley china y consentimiento de cada usuario final); ahorro vs luna ~US$5/mes.
Gasto real OpenAI 30 días US$77,79 (mini US$61,63). Comparación luna vs mini con turnos reales:
luna 0 fallas de reglas vs mini 6 y 9; luna peor en avisar antes de tiempo y en no buscar la
propiedad sin nombre. Detalle en la memoria `modelos-precios-y-datos-2026-09` y en
`scratch/comparar-modelos/`. Hallazgo: propiedad del link no encontrada (57%) presentada como si
fuera la del link (Claudia).

**APLICADO 16-sep 14:10 (AR), con OK de Leonardo:**
1. Prompt "el nombre no frena la propiedad" (`scratch/aplicar-prompt-nombre-no-frena.mjs`): si al
   saludo contestan sin nombre, se busca la propiedad en ese turno. Banco: Tania no buscada luna 3/3
   → 0/3, mini 2/3 → 0/3; saludo inicial 12/12 sin búsqueda.
2. **Sofía pasa a `gpt-5.6-luna`** (`scratch/aplicar-modelo-luna.mjs`; volver:
   `--volver --apply`). Segunda ronda con el prompt nuevo, leída a mano: luna 1 falla real en 60
   turnos, mini 15. Opciones (8000, medium) y respaldo Claude Sonnet sin cambios. Luna no tiene
   versión con fecha.
- Verificación independiente del flujo vivo: 10/10 OK. **Sin tráfico real todavía** (ningún mensaje
  de cliente desde 12:29). Vigilante armado para la primera ejecución.
- Pendientes que NO se tocaron: Claudia (propiedad del link no encontrada presentada igual); Sonia
  colega no detectada; Sofía siguió contestando 30 min después de "Handoff activado" (16-sep 08:59).
- **Primer tráfico real con luna (15:34-15:40):** Elian RRE, colega. Saludo correcto, extractor sin
  presupuesto inventado, SQL con cita ok (150 y 144 ms). Segundo turno: buscó Vedia al 4800 (92%),
  detectó colega y derivó a Micaela sin calificar. 0 errores. El silencio de 12:29 a 15:34 fue real
  (Meta conectado, suscripción ok, código de entrada sin cambios).
- **BUG PREEXISTENTE ENCONTRADO:** el mensaje de derivación de Sofía se descarta en
  `/api/n8n/reply` porque `Gestion_Handoff` ya apagó el bot ("Bot pausado: respuesta descartada").
  Elian no recibió respuesta. Confirmado en 4 ejecuciones; en 30 días ~76 de 109 derivaciones sin
  mensaje. Detalle y arreglo propuesto en la memoria `derivacion-sin-mensaje-al-cliente`. SIN tocar.

---

## 2026-09-16 — ACM: cuatro pedidos de los asesores (link, Laundry, antigüedad, sumar por link)

**De dónde salió:** `system_feedback` de Central. Carolina Etcheverry (16-sep, `a251b9b4` link de
los comparables y `adc8c2d4` Laundry), Carolina Grossi (28-ago, `0f151722` antigüedad) y Eric
Zambrana (31-ago, `aa44c66e`, segunda mitad: sumar comparables por link). La primera mitad de
Eric y la de Maximiliano (`353bbb7e`, zona dibujada) ya estaban hechas desde el 8-sep.

**Lo que había de verdad detrás de cada uno**

- Link: existía, al fondo del checklist desplegado. No era un error, era diseño.
- Antigüedad: el campo del formulario existe desde marzo. Grossi armó una ficha
  (`DQMs3ltJsXya`) 9 minutos antes de escribir: lo que faltaba era verla EN LA FICHA.
- Laundry: "Laundry" (edificio) y "Lavadero" (unidad) son datos distintos en la red: solo
  3.623 de 30.173 traen los dos. Token `laundry(?! ?room)`; exacto 10.387 contra `'Laundry'`.

**Qué se hizo** (commit `47baa76`; detalle en TECNICO §10.6)

- "Ver publicación" a la vista (44 px), antigüedad en tarjeta, hoja y portada.
- `POST /api/acm/comparable-link`: Zonaprop se busca en `mercado_avisos` por id (el número del
  aviso es el id); otro portal va por el extractor pidiendo `con_html`. `% = puntaje-link.ts`.
- Fotos del propio aviso (`fotos-aviso.ts`), probadas contra páginas reales de los tres portales.

**Verificación**

- Paridad del % contra `acm_match_roomix` real: 305 avisos de 8 ACM, 305 iguales. La primera
  corrida dio 303: el 66,5 en coma flotante redondeaba a 66 (Postgres dice 67).
- 12 errores metidos a propósito, los 12 hicieron fallar su prueba. 2.262 pruebas en verde.
- Navegador con PRISMAIA - VAKDOR: escritorio, celular emulado (390×844, touch) y tema claro;
  ficha medida en modo impresión (cada hoja 1123 px, pie adentro).

**Errores propios cazados probando:** (1) el servidor guardaba un aviso que la búsqueda ya
había traído aunque la pantalla avisara "ya está" → duplicado al reabrir; ahora decide el
servidor. (2) "CABA, Argentina" contaba como otro barrio (zona 0); no saber no es ser otro.
(3) Las etiquetas pisaban "COMPARABLE" en 390 px (preexistente con "apto crédito").
**Trampa:** `git checkout --` no restaura un archivo sin trackear; un mutante quedó puesto hasta
que el grep lo mostró. Restaurar mutantes desde una copia, nunca con git.

**Pendiente**

- **Redeploy del extractor en EasyPanel** (con OK): sin eso, fuera de la red no hay fotos
  cuando Tier 1 está bloqueado (en Vercel, casi siempre).
- Argenprop por Tier 1 devuelve barrio "CABA, Argentina" (el JSON-LD no trae el barrio).
- Marcar las 4 sugerencias como resueltas en admin-vakdor (con OK).
- Datos de prueba en PRISMAIA - VAKDOR: `acm_searches` `1bd60870` y ficha `lTb19sULahAu`.

## 2026-09-16 — El gasto de Apify entra en US$100, las bajas vuelven a marcarse, y apareció el sitemap de ZonaProp

**De dónde salió:** Leonardo pidió analizar un informe de fuentes de datos para el CMA que le
generó Z.ai (`Downloads/informe_fuentes_datos_cma_argentina (1).pdf`, 43 págs). De ahí salió todo
lo demás. Detalle completo y verificaciones en la memoria `remax-api-publica-y-informe-zai.md`.

**Lo del informe, verificado en vivo (15-sep)**

- **RE/MAX tiene API pública que funciona** (`api-ar.redremax.com`, sin token ni proxy): 66.693
  avisos en venta hoy. Filtro por ciudad que el informe no trae: `like=geoLabel:La Plata` → 2.963.
- **FALSO lo central del informe:** el "cruce exacto" entre el código de anunciante de ZonaProp y
  el `internalId` de RE/MAX no existe: **0 de 40** (con control positivo y negativo). Pares
  idénticos confirmados tienen códigos que no se corresponden (`421141094-1438` ⇄ `AR.42.136.94.841.V24`).
- CABA: de 16.896 avisos de RE/MAX, 55% ya están en la base y 29% no tienen candidato; lo "nuevo"
  es casi todo casas/PH/terrenos/locales, **los tipos que no cargamos de ZonaProp** (el portal tiene
  24.800 en CABA y nosotros ~2.450). Mercado Libre: de 31 cruzables, 29 ya los teníamos; su API da
  403 para buscar avisos ajenos con dos apps distintas. Benchmark oficial de CABA: la serie termina
  en 2019. Argenprop bloquea (202 vacío) a los pocos pedidos.

**Lo que se arregló** (rama `mercado-presupuesto`, worktree propio, commit `3ad77cc`)

Leonardo puso el límite: **US$100/mes de Apify**, sin saltar al plan de US$200. El régimen daba ~120.

- **Dos turnos parejos** (33.458 y 33.454 avisos): cada mes se relee media ciudad, todo CABA al día
  cada 2 meses. Eligió esto sobre "7 barrios del cliente mensual + resto cada 3": no quería barrios
  sin actualizar. Sale ~US$79/mes.
- El workflow de refresco ya no lleva las 48 zonas escritas: se las pide a `mercado-sync/plan.mjs`
  (con 29 tests) vía `matriz.mjs` y `fromJSON`.
- **El descubrimiento pasa a las 00:30 AR** (era 7:00): la ventana incluye "lo que va de hoy" y eso
  se repaga al día siguiente — medido el 8-sep, 315 avisos (~US$10/mes). La ventana ahora se calcula
  (piso 2, techo 3 si faltó una corrida).
- **Guardia de presupuesto** en el descubrimiento (tope 90) y refresco bajado a 70.
- **La verificación de bajas estaba rota en 41 de 48 zonas** (mapa de 7 barrios escrito a mano): por
  eso 70.129 avisos "activos" y 0 caídos. Ahora sale de la base, más un cajón `otros-sin-zona` con
  los 608 avisos de barrios que ZonaProp escribe fuera de las 48 zonas (Barrio Norte, Once, Congreso).

**Hallazgo grande, a medio probar: el sitemap de ZonaProp**

`https://www.zonaprop.com.ar/sitemaps_https.xml` lista avisos **uno por uno con `lastmod`**, gratis
y sin actor. Bajado: 48.785 avisos con fechas de los últimos 8 días; de 300 cruzados con la base, 26
estaban publicados hace más de un mes y figuran modificados esta semana. **Si la fecha es confiable,
el refresco pasa de US$67 a ~US$1,40** (releer solo lo que cambió) y se puede refrescar todo CABA
todas las semanas. Dos avisos: **no es el censo completo** (~100.000 de ~700.000 → la ausencia NO
prueba una baja) y el portal tira 403 si se le piden muchas páginas seguidas.

**Pendiente, con fecha: 30-sep**, cuando se libere el ciclo de Apify (hoy la cuenta está en
US$102,43 de 100 y el descubrimiento está frenado desde el 14):
1. Releer 200 avisos con `lastmod` nuevo y 200 con `lastmod` viejo (US$0,40) → ¿la fecha marca
   cambios de verdad?
2. Releer 500 avisos de un barrio (US$0,50) → ¿cuántos cambian de precio por mes sin republicarse?
   De eso depende si el refresco cada 2 meses alcanza o sobra.
3. Bajar el segundo archivo del sitemap (`sitemap_prop_https_2`), que hoy dio 403.
4. **Argenprop, muestra de 500 avisos (US$0,50)** con `igolaizola/argenprop-scraper`, 2-3 barrios,
   cruzada contra la base por dirección + precio → **cuántos avisos son únicos**. CABA entero son
   102.843 (≈US$103 de una vez). El actor filtra por ubicación, radio en km, `advertiserTypes`
   (dueño directo) y `sortBy: newest`, así que permitiría un descubrimiento diario barato.
5. **Mercado Libre, muestra de 500 avisos (US$2)** con `gio21/mercadolibre-inmuebles-scraper`
   (US$4/1.000, cuatro veces ZonaProp) → confirmar con muestra grande el 94% de repetición que
   dio la muestra chica (29 de 31 ya estaban en la base).

Las cinco juntas cuestan menos de US$3,50 y cada una decide un camino. **Sumar un portal recién se
encara si la 4 da volumen único**: exige clave nueva en `mercado_avisos` (hoy es el postingId de
ZonaProp), capa "estos avisos son el mismo inmueble" por geo+precio+m² (los códigos NO cruzan entre
portales, medido 0/40) y geocodificar direcciones, porque ni Argenprop ni Mercado Libre dan
coordenadas.

**API de Mercado Libre: CERRADA, no insistir.** Tres apps propias distintas (la última con unidad
VIS y permisos mínimos) dan lo mismo: el token sirve (`/users/me`, `/categories`, `/sites/MLA` y
`/items/{id}/description` responden 200) pero `/sites/MLA/search` da 403, `/items/{id}` da 403 y
`/users/{id}/items/search` responde textual **"Searching another user items is restricted."** La
doc oficial (10/09/2026) ya no documenta la búsqueda por sitio, y hay decenas de desarrolladores
reportando lo mismo en 2026. El cambio es de abril-2025: solo se accede a lo del usuario que
autoriza la app. Único uso que queda: que un cliente nuestro autorice la app para bajar SUS avisos.

**Sin resolver, de Leonardo:** regenerar los Client Secret de las dos apps de Mercado Libre
(`2055069549619410` y `5235611298360779`), que quedaron expuestos en el chat, y dejar sus permisos
en "Sin acceso" (la primera tenía escritura sobre publicaciones, facturas y órdenes).

**Falta probar de verdad:** la matriz por `fromJSON` solo se prueba corriendo el workflow en GitHub.
Al subir la rama, dispararlo a mano una vez y mirar el job `plan`, que imprime en castellano qué
zonas le tocan al mes. Si falla, falla antes de gastar.

---

## 2026-09-16 — Farming etapa 3-A: la caminata (direcciones y propietarios)

**Qué se construyó** (rama `feat/farming-relevamiento`, worktree `PRISMA-SYSTEM-farming2`): lo que
el asesor carga **a pie**, que es la mayoría de lo que releva y no está publicado en ningún
portal. Tres tablas (`farming_direcciones`, `farming_propietarios`, `farming_contactos`), los
endpoints de alta/edición/borrado de tarjetas y personas, el botón que pasa un aviso publicado a
Relevamiento, y la solapa nueva con su formulario. **La etapa 3 se partió en dos**: el tablero de
6 columnas, el historial que se llena solo, los 9 indicadores y el botón a Tracking son la 3-B.

**Lo que más vale de esta rama no es la pantalla, son dos protecciones:**
- **Borrar una zona con trabajo cargado ahora es imposible.** El botón «borrar» existe desde la
  etapa 1 y lo único que iba a frenar la cascada era un comentario que decía «esto se hace en la
  etapa 3». La FK quedó en `on delete restrict` y la app archiva en vez de borrar. Probado contra
  producción con una transacción que se revierte: la base **se niega**.
- **El ataque de RLS pasó de 10 a 40 casos.** Ahora prueba lo que un test flojo deja pasar: que
  un colega con zona compartida **lea pero no escriba**, y que el director **mire pero no edite**.
  El bloque del director no corre si el service_role no confirma antes que esa cuenta es director
  de esa agencia — si no, se saltea en vez de dar un OK falso. 40/40, salida 0.

**Decisiones tomadas** (las discutibles, con su motivo):
- `validarDireccion` devuelve `{ errores, avisos }`: solo la calle y el tipo bloquean. Un asesor
  que escribe «pisos: 8» parado en la vereda tiene que poder guardar y completar después.
- El `tipo` arranca en «Edificio». Lo había decidido al revés y **cambié de opinión** con el
  argumento del revisor: una casa mal tipeada aporta CERO a «unidades potenciales» (las unidades
  salen de los números, no del tipo), el error se ve en la tarjeta y se arregla con un toque;
  sacar el default haría empezar cada puerta con el botón deshabilitado.
- `fuera_de_zona` se guarda al crear, pero `fuera_de_zona_desde` queda NULL: esa fecha dice
  «cuándo se cayó», y una tarjeta que nació afuera nunca se cayó. Con fecha = se cayó al mover el
  trazo; sin fecha = nació afuera. Es lo que la 3-B va a usar para separar las dos poblaciones.
- Al borrar una tarjeta que vino de un aviso se borra también su marca, así el aviso **vuelve** a
  «A la venta en mi zona» en vez de quedar escondido para siempre.

**Verificado en el navegador, contra datos reales** (usuario de prueba, zona de 1.097 avisos):
se guarda con solo la calle; 8×4 muestra «Total: 32 unidades · se calcula solo»; «av   ejemplo
1200» se detecta como la misma puerta que «Av. Ejemplo 1200» y el cuadro queda abierto para
corregir; el teléfono se guarda en E.164 y disca desde un link de 44 px; pasar un aviso a tarjeta
y deshacerlo revierte **las dos mitades**; a 390 px nada baja de 44 px ni se corta; consola limpia.

**Dos cosas que solo aparecen probando, no leyendo código:**
- Un **500 al guardar una persona** que NO era de la app: el servidor de desarrollo se quedaba sin
  memoria compilando esa ruta (había **51 procesos de node** abiertos). Servidor limpio, mismo
  pedido, 201. Conviene matar los node colgados antes de probar.
- El buscador de direcciones medía **42 px** y, peor, **no llevaba `type`**, así que tampoco lo
  alcanzaba la regla anti-zoom de iOS: al tocarlo en un iPhone la pantalla se agrandaba sola.
  Arreglado en `components/mapa/mapa-buscador.tsx` (46 px y letra de 16), que **también arregla el
  mapa del Buscador IA**.

**Para la etapa 3-B, anotado para que no se pierda:**
- Recalcular `fuera_de_zona` **cada vez que un PATCH traiga `lat` o `lng`**, no solo al redibujar:
  hoy el cartel puede quedar mal en las dos direcciones, y una tarjeta puede terminar con una
  calle que no coincide con su punto.
- Convertir un aviso ya descartado necesita `update`, no `ON CONFLICT DO NOTHING`.
- Los dos números de la tarjeta de zona («direcciones relevadas» y «avisos a la venta hoy») van
  con la 3-B, que rehace esa tarjeta igual.

## 2026-09-16 — El creador de anuncios: texto que se puede pegar en Meta, y la placa con la foto REAL

**Qué se construyó** (rama `feat/anuncios-texto-y-placa`, worktree `PRISMA-SYSTEM-anuncios`)

Las dos sugerencias de Maximiliano Filoreto que estaban `en_proceso` desde principios de mes:

- **El texto salía en un bloque.** El copy real que él generó el 10-sep (`copy_drafts 30b0f771`)
  tenía 89 palabras sin un salto de línea ni un emoji. La causa: el prompt de `generate-batch`
  solo pedía *"cuerpo usando el ángulo pas"* y nunca decía que eso se pega en Instagram. Ahora se
  le pide `parrafos`, una **lista** que el servidor puede contar, y el servidor la sella. Probado
  en producción: los 3 borradores salen en **6 párrafos** con un emoji al cierre.
- **La placa ignoraba la propiedad.** `flow_data.tokko_property_details` está VACÍO en los perfiles
  reales, así que la imagen no recibía ni la foto ni los datos y caía en *"imagen representativa
  del mercado inmobiliario argentino premium"*. Ahora la placa se arma con la **foto real de
  Tokko, sin IA**: foto arriba, panel de marca abajo dibujado por el código.

**Dos prompts decían cosas distintas y solo uno corría.** `generate-copy` pedía "3-5 párrafos
cortos"; `generate-batch`, que es el que usa la pantalla, no pedía nada. Ahora comparten
`REGLAS_POST` y no se pueden volver a separar.

**Tres decisiones, todas medidas**

- **Foto + panel, no foto a pantalla completa.** Medí 40 portadas reales: 28 son 4:3, mediana
  1500 px de ancho, y 7 de 40 son más angostas que la placa. Con la foto típica, a pantalla
  completa el Reel usa el 42% del ancho y la agranda 1,71×; con panel usa el 76% y la **achica**
  0,94×. En 4:5 y cuadrado entra entera.
- **El contenido nunca pisa el aviso legal.** Con el aviso REAL de Central (165 px de franja,
  319 reservados) el cuadrado metía el precio **abajo** de la franja. El `Math.min` que protegía
  la foto terminaba pisando lo legal. Palancas nuevas, en orden: soltar casillas → soltar bajada →
  achicar título → achicar la foto (el 45% pasa a ser preferencia, piso duro 30%). Si ni así entra,
  sale igual pero **lo avisa** (`desborda`).
- **La ruta no confía en la `foto_url` que manda el navegador.** Comprueba contra `properties` que
  la foto sea de esa propiedad **y de esa agencia**. Cierra dos agujeros de una: que el servidor
  baje cualquier URL, y que un inquilino publique la foto de otra agencia con su logo.

**Errores propios**

- **Afirmé que un emoji en la placa "sale como nada".** Es falso: en esta Inter el `.notdef` es un
  **cuadrito visible** de 638 caracteres de contorno, y el del contorno vacío es el ESPACIO. O sea
  al revés. Antes del arreglo el emoji se **dibujaba** y no se contaba, porque el path del cuadrito
  no tiene ningún `NaN`. Corregido en el spec con la tabla medida.
- **El regex de emojis que dicté estaba roto y su propia prueba lo delataba.** `⚠️` son dos
  caracteres; los contaba por separado y "conservaba el último", que es el invisible. Hubo que
  arreglarlo tres veces: secuencias completas, después keycaps (`3️⃣`) y banderas (`🇦🇷`) que
  escapaban enteras, y respetar `©®™` que Inter sí sabe dibujar.
- **La prueba que sostiene todo el diseño no podía fallar.** "LA FOTO NO SE TOCA" muestreaba una
  foto de color plano: un revisor la desenfocó con `.blur(30)` y **la prueba siguió pasando**.
  Ahora usa una foto texturada y compara contra el recorte esperado; se probó al revés (con
  desenfoque el desvío salta de 3,14 a 11,61 y falla).
- **Casi reporto que la foto había sido alterada.** Mi medición sobre una placa de producción daba
  18,27. Era MI detección del alto corrida **un píxel** (609 en vez de 608): en una foto llena de
  follaje eso triplica el número. Con el alto real da 5,56, y la doble compresión JPEG sola explica
  5,67. La foto está intacta.

**Un hallazgo que salió de mirar, no de medir:** la ruta recomprimía la placa con `.toBuffer()` sin
formato, y sharp usa calidad 80 por defecto. Duplicaba la pérdida justo en la foto que prometemos
no tocar. Una línea en cada camino.

**Quedó pendiente**

- **El título de la placa puede ser muy largo.** El hook del post tiene ~150 caracteres, que para un
  título es mucho. El diseño lo acomoda achicando la letra, pero lo correcto sería pedirle al modelo
  un título corto aparte. Decidido dejarlo afuera.
- **El aviso legal de Central son 841 caracteres** y en cuadrado deja la foto en el 33%. No es un
  bug: la palanca es acortar el aviso, y esa decisión es de él. Kevin ya se había quejado el 31-ago
  de que no le entraba.
- **La config de Marketing de PRISMAIA - VAKDOR tiene cargado el aviso legal DE CENTRAL**, con sus
  matrículas y su dirección. Config vieja de la agencia de prueba; conviene corregirla.
- **El camino sin propiedad no se generó de punta a punta.** Verifiqué que el paso nuevo no aparece,
  pero no generé una placa por el camino de Gemini.
- **Las dos sugerencias siguen `en_proceso`.** Leonardo manda él la respuesta a Maximiliano.
- **Lo mismo de siempre que sigue abierto:** el `generate-batch` y el `generate-image` tienen dos
  copias casi idénticas de `traerPropiedad`; y la placa lee la foto de la tabla sincronizada pero
  el precio de una llamada viva a Tokko, así que pueden no coincidir.

## 2026-09-16 — Farming etapa 2: «A la venta en mi zona»

**Qué se construyó** (rama `feat/farming-avisos-en-mi-zona`, worktree `PRISMA-SYSTEM-farming2`):
la segunda solapa de Farming, que lista lo que está publicado adentro de la zona del asesor sin
que él cargue nada. Tabla `farming_avisos_marca` (lo que ya miró), dos funciones PostGIS que
recortan `mercado_avisos` por el polígono, `GET /api/farming/avisos`, `POST/DELETE
/api/farming/avisos/marca`, y la solapa con los cuatro atajos de captación.

**Decisiones de Leonardo:**
- **Un atajo se dibuja solo si tiene datos.** Hoy «se cayó» y «bajó el precio» dan cero en todo
  el sistema, y un botón que siempre da cero se siente roto. Cuando el pipeline vuelva, aparecen
  solos.
- **Trazabilidad de zonas: no se guarda historial.** Preguntó si las zonas quedaban con fecha y
  filtros para ver la evolución. Verificado ese día: **borrar borra la fila de verdad** y
  **redibujar pisa el trazo anterior**. Su decisión textual: *«si se borran o se redibujan, no
  pasa nada, queda lo último y lo visible»*, con un aviso en pantalla y la sugerencia de crear
  una zona nueva en vez de reemplazar. Se hizo así: dos textos, cero cambios de comportamiento.

**Migración aplicada a producción con su OK.** El clasificador del entorno bloquea «Production
Deploy» desde el agente (los dos intérpretes): la corrió él con `! node scratch/aplicar-sql.mjs`.
Verificado después: `authenticated` y `anon` quedan con SELECT y **nada** de escritura, RLS
encendida, y el **ataque de RLS da 10/10 fallando** (se le sumaron 3 casos + 1 control positivo
sobre la tabla nueva). El script ahora **no puede terminar en verde si los ataques no corrieron**
(sale con código 2): antes, correrlo sin la migración aplicada decía «todo bien».

**Dos números corregidos, los dos míos:**
- Yo había escrito «24,5 ms» en el comentario de la migración. Medido de verdad ya aplicado
  contra la zona real de Central: **131-136 ms** la función, 91 ms la consulta cruda equivalente
  (que sí muestra el plan: Index Scan en los dos índices geom de las particiones). Corregido en
  el archivo.
- Un brief mío salió corrupto por un `sed` (metió un `&` literal donde iba una aserción). El
  implementador no lo transcribió; se arregló el plan.

**Encontrado probando en el navegador, no razonando:** las fotos de `mercado_avisos` **no cargan
ninguna**. La base guarda la URL con el texto `wxh` sin reemplazar —es una plantilla, no una
dirección—: el CDN da 404 con `wxh` y 200 con `360x266`. Son **70.202 de 70.322** avisos con
foto. Esta rama es el único lugar de la app que lee `foto_portada`, así que no rompe nada más.

**Verificado en el navegador** (usuario de prueba, zona de 1.097 avisos en Palermo): los atajos
salen solo los dos que tienen datos; descartar baja el total y el conteo del atajo al instante y
ofrece deshacer; **lo descartado no vuelve después de recargar**; 120 avisos tras «ver más` sin
un solo repetido; los 244 elementos tocables miden ≥44 px en 390×844 y ninguna línea se corta.

**Cabos sueltos (en el plan, no perdidos):**
- El contraste del chip de señal da **2,78** en tema claro (mínimo legible 4,5); en oscuro, 5,84.
- Descartar y después tocar «ver más» **saltea tantos avisos como los descartados** (confirmado
  contra la app: 2 descartes → 2 avisos que no aparecen nunca). El offset tiene que ser la
  cantidad de tarjetas en pantalla, no página × 60.
- Si el asesor descarta el último aviso del atajo que está mirando, el chip desaparece con el
  filtro puesto y, con una sola zona, no queda botón para volver a «Todas».
- El endpoint de marca no valida que el aviso esté dentro de la zona (solo puede ensuciar la
  lista propia). Para la etapa 3: «convertir» sobre un aviso ya descartado necesita `update`, no
  el `ON CONFLICT DO NOTHING` de hoy, o no hace nada en silencio.
- La tarjeta de zona de la solapa 1 todavía no muestra «avisos a la venta hoy», que el spec pide
  y esta etapa recién ahora hace calculable.
- **Pendiente de Leonardo:** el tope de Apify (US$100 agotado, gastado US$102,45). El
  descubrimiento diario está caído desde el 9-sep y por eso dos atajos dan cero.

## 2026-09-15 — Auditoría del Dashboard del director, tanda 1 de 3

**Qué pidió Leonardo:** revisar cada dato del Dashboard, que sea correcto y que responda al filtro;
cada tabla ordenable por columna con forma simple de volver al orden original. Decisiones suyas:
todo determinista (sin IA en el cálculo) y en vivo; el Pipeline sólo con lo generado en PRISMA;
Leads y Propiedades de Tokko se quedan pero corregidos; fuera el reparto Neto 50/50; los
valores inventados se calculan de verdad; la Clasificación IA queda como está. En 3 tandas.

**Auditoría** (3 agentes de sólo lectura + SQL contra Central): de 10 secciones, 2 estaban bien.
Lo más grave: cartera en 0 (filtraba `status='Active'`, que no existe: son "Venta"/"Alquiler"/
"Temporary rent"), Consultas WhatsApp con todo el historial (2.340 vs 483 del período),
gráficos vacíos por claves que no coinciden, pipeline cortado en 1.000 de 8.182 y con el
"Cerrado" de Tokko como venta ganada, Conversacional siempre vacía (0 análisis de Central).

**Tanda 1 — errores de cálculo + orden por columna** (rama `fix/dashboard-auditoria`)

- `lib/queries/todas-las-filas.ts`: helper de tandas de 1.000 con orden estable; usado en
  dashboard, pipeline y propiedades.
- Cartera por `is_active`; "Días publicada" = alta en Tokko → hoy (antes 45 fijo); stock a fin
  de mes con alta/baja de Tokko (la baja sólo vale en las inactivas: las activas también la traen).
- Pipeline: sólo `wa_conversations`. Propiedades: "Eligible"/"Tenant" (inglés de Tokko), m² y
  promedio sólo ventas. Movimientos ordenados; tipos reales.
- `hooks/use-orden-tabla.ts` + `components/dashboard/orden-tabla.tsx`: 1er clic menor→mayor,
  2º mayor→menor, 3º original, botón "Orden original". En Ranking y Objetivos.
- Verificado en navegador (VAKDOR): 94 / US$11.117.650 / 635 días / 20 aptas / 4 con inquilino,
  igual que el SQL. Sin NaN, sin scroll lateral en el celular.

Mergeada: PR #62 (`3c78370`).

**Tanda 2 — el filtro de arriba fijo y todo le responde** (misma rama)

- Barra `sticky top-0` dentro del `<main>` que hace scroll (layout del director); en el celular
  dos filas, 114 px de 844.
- Consultas WA del período (antes todo el historial); `finDelDia` en todas las fechas de fin.
- Gráficos: meses del período (hasta 12). Cartera = la que había al cierre del período
  (`lib/queries/cartera.ts#estabaEnCartera`), también en la sección Propiedades.
- Pipeline por período + asesor; Objetivos con el año del filtro + asesor (también el server
  action al cambiar el año); ranking sólo con el asesor elegido.
- Bug encontrado probando: `DatePeriodFilter` mostraba un día menos (`new Date('yyyy-MM-dd')`
  es UTC) → `parseISO`.
- Verificado (VAKDOR, 30 días vs 1/1–30/6): consultas 0→1, cartera 94→89, propiedades 94→89,
  pipeline 0→1, meses Ene–Jun, objetivos sólo "Leonardo Asesor" al elegirlo.

Mergeada: PR #64 (`a64c961`).

**Tanda 3 — Conversacional en vivo, Leads corregido, días argentinos** (misma rama)

- Brief de sólo lectura + dos agentes en paralelo (archivos disjuntos); yo conecté `page.tsx`.
- `lib/queries/conversacional.ts`: en vivo, sin IA, sin botón ni caché, con el filtro. Arreglados:
  claves que no coincidían, derivación 202 %, "necesitan vender" (clave `necesita_vender_para_comprar`),
  calificados (`metricas.calificado`), visitas con estados inexistentes, horas en UTC y con 11 % de
  los mensajes, "null" como categoría. Tasa de cierre con las cantidades al lado (2 ganadas, 0 perdidas
  daba "100 %"). Borradas `/api/conversational-insights/{analyze,status}` y `ConversationalFilters`.
- `lib/queries/leads-dashboard.ts`: agregados en el servidor, fecha = `tokko_created_date` (el
  `created_at` es la hora del sync), sin tope de 5.000, estados reales, "Qué está frenando la
  conversión" calculado (antes textos fijos), tabla por asesor ordenable. Fuera "Ciclo de vida"
  (`tokko_raw.deleted_at` no es fecha de cierre) y la pestaña de texto fijo.
- `lib/dashboard/periodo.ts#inicioDelDiaAR/finDelDiaAR`: todos los cortes en -03:00 (antes UTC:
  el período corría 3 h; Central 483 → 482 en 30 días).
- Verificado (VAKDOR 1/1–15/9): 1 chat, pico 16 h sábado; 1.594 leads, 285 sin contactar (277 +48 h),
  todos sin asignar — igual que el SQL. Sin textos de IA, sin NaN, sin errores de página. 4,4 s de carga.

Mergeada: PR #65 (`888123a`); Vercel publicó el deploy ("success").

**Base — APLICADA el 15/9** (OK de Leonardo). El clasificador de Claude Code frenó el DDL contra
producción ("Modify Shared Resources") antes de ejecutarlo; no se esquivó: Leonardo corrió cada
comando con `!` y yo verifiqué con SELECT después de cada uno.
- `dashboard_conversational_insights` borrada DESPUÉS de que Vercel publicó (el código viejo la
  leía): `20260915130000_borrar_cache_conversacional.sql`. Verificado: la tabla ya no existe y no
  quedan políticas. Respaldo previo (18 filas, todas de VAKDOR, columnas, 4 políticas,
  restricciones) en el scratchpad de la sesión del 15/9.
- Índices con CONCURRENTLY, uno por comando (no va en transacción):
  `20260915120000_indices_dashboard_por_fecha.sql`. Verificados válidos: `wa_conversations_agency_created_idx`
  (112 kB), `wa_messages_agency_created_idx` (896 kB), `leads_agency_tokko_created_idx` (456 kB).

---

## 2026-09-15 — Tiempos de respuesta del dashboard: los dos números se calculaban con datos cortados

**Qué pidió Leonardo:** Kevin (Central) veía «1 h y pico» en la tarjeta «Tiempos Respuesta» y
12 h en la mediana de «Handoffs sin atender», y no sabía cuál mirar. Verificar los dos y
aclarar cada uno para que pueda ir con fundamentos a sus asesores.

**Qué se encontró** (leído de producción, Central, 15/8 al 14/9)

- **Supabase entrega como máximo 1.000 filas por consulta** (`max_rows: 1000`, Management API
  `/postgrest`). La tarjeta pedía los mensajes del período sin paginar: Central tenía 9.104 y
  la tarjeta usaba los 1.000 más viejos. La «1 h y pico» salía de **una sola respuesta**.
- El panel de handoffs también se cortaba: 1.945 mensajes después de las derivaciones y leía
  1.000, así que algunas conversaciones atendidas aparecían como «sin atender».
- **Miden cosas distintas.** La tarjeta cuenta desde el último mensaje del cliente sin respuesta
  hasta que escribe el asesor, en toda la charla, y deja afuera las respuestas del asesor sin un
  mensaje del cliente antes (121 de 182). El handoff cuenta desde la derivación hasta la primera
  respuesta del asesor. **El handoff es el que sirve para exigirles a los asesores.**
- Con todos los datos: tarjeta, entre mensajes del asesor, 10 h 11 m de promedio y 1 h 34 m de
  mediana; handoff, 18 h 53 m de mediana, **28 de 101 derivaciones atendidas**.
- La tarjeta además dejaba afuera el último día del período (`lte` con `yyyy-MM-dd`).

**Qué se hizo** (rama `fix/tiempos-respuesta-dashboard`, 5 archivos)

- `lib/queries/dashboard.ts` y `lib/queries/handoffs.ts`: consultas de a tandas de 1.000
  (`.range()` + orden por `created_at` e `id`), y promedio + mediana en los dos lugares.
- `PerformanceMetricsGrid.tsx`: promedio arriba, «mediana X · N veces» abajo, y una aclaración
  visible al pie. `HandoffsPanel.tsx`: la tarjeta pasa a «Respuesta del asesor» (la mediana y el
  promedio), las descripciones salen del globito y quedan a la vista, más una línea que explica
  los dos números. `lib/dashboard/periodo.ts`: `etiquetaPeriodo()` hace que cada aclaración diga
  el período del filtro.

**Verificación real**

- Las tandas, contra Central, solo lectura: 9.109 traídas, 9.109 distintas, 9.109 en la base,
  en 1,7 s.
- Navegador, PRISMAIA - VAKDOR, escritorio y celular 390×844: handoff 6 días (la base da
  153,7 h), las filas del asesor en «---» (la base da 0 esperas medibles), el filtro del 1 al
  15/09 cambia el período y los números, y la página no se corre de costado. Los valores del
  bot solo se vieron, no se compararon contra un cálculo aparte.

**Ojo:** la tarjeta y el panel son los mismos en el dashboard del asesor; ellos también ven las
aclaraciones.

---

## 2026-09-12 — El descubrimiento diario fallaba hace 4 días: esperábamos menos de lo que tarda

Leonardo avisó por los mails de GitHub Actions. `mercado-descubrimiento` falló 9, 10, 11 y
12 de septiembre (y 5 y 7). **No era Apify: era nuestra espera.**

- El script esperaba **10 min** fijos (60 vueltas × 10 s) a que terminara el actor. Desde
  que subimos `--max 1500` (4-sep), la corrida de todo CABA tarda **10 a 13 min**
  (medido: 11.5 / 11.6 / 10.3 / 12.1 / 11.6 / 12.0 / 12.6). Justo arriba del límite.
- Lo caro: **la corrida se paga igual** (US$1.507 cada una). Cortábamos la espera 2 min
  antes de que terminara, tirábamos el dataset de 1500 avisos y encima el job moría, así
  que **tampoco corrían Don Torcuato ni los embeddings**.
- Arreglo: `--espera-min` (default **40**), log de progreso cada 2 min, y
  `timeout-minutes: 30 → 90` en el job.
- Nuevo: **`--recuperar <runId>`** carga el dataset de una corrida ya pagada que quedó sin
  cargar, sin lanzar nada nuevo. Recuperar sale US$0; volver a correr, US$1.51.

**Recuperación:** se cargaron las 4 corridas pagadas (9, 10, 11, 12) con `--recuperar`.
**5.333 avisos nuevos** a la base, US$0 de costo extra, más sus embeddings.

**Cuánto publica CABA por día — medido, no estimado.** El campo del dataset es
`list_publication_begin`. Uniendo las 4 corridas:

| día | 8-sep | 9-sep | 10-sep | 11-sep |
|---|---|---|---|---|
| avisos publicados | 1.347 | 1.336 | 1.277 | **1.543** |

**Lo que esto cambió (decidido, ya aplicado):** `--max 1500 → 1800`.

La clave es que la ventana de `--dentro-de 2` **no son dos días enteros**: es *ayer
completo + lo que va de hoy* (las corridas arrancan ~11:00 ART, así que de hoy traen 44 a
237). O sea ~1.500-1.600 avisos, no ~2.800. Como el actor **cobra por item devuelto**,
subir el tope no encarece la corrida: solo deja de cortar. Con 1500 el 11-sep se
perdieron 87 avisos (1.543 publicados, 1.456 traídos), y esos no los ve nadie hasta el
refresco mensual. El log ahora imprime el reparto por día de publicación, que es el
termómetro: si `n < --max`, ayer entró completo.

**Lo que NO se tocó y sigue siendo decisión de Leonardo:** el descubrimiento cuesta
~US$1.55/día ≈ **US$46/mes** (no son centavos: son ~1.350 avisos nuevos por día a
US$0.001). Con el refresco mensual (~US$65) el régimen real de Apify es **~US$111/mes**
contra un tope de cuenta de US$100. Hay que subirlo a US$150 o el 3-oct el refresco choca.

---

## 2026-09-12 — Farming: el mapa arranca con la manito, lupita, y el director ve cada asesor en su color

**Qué pidió Leonardo:** (1) una lupita en el mapa de Farming para ir a un barrio, zona o dirección;
(2) que el mapa NO arranque con el lápiz —arrastrar para llegar dibujaba—, sino con la manito, y al
terminar el trazo preguntar nombre y "guardar como zona farming"; (3) en la pantalla del director,
ver marcadas las zonas de cada asesor y que tocar una de la lista lleve el mapa hasta ella.

**Qué se hizo** (rama `farming-mapa-ux`, un solo archivo de lógica nueva)

- `mapa-farming.tsx`: el lápiz arranca apagado; la lupita es el mismo `MapaBuscador` del Buscador
  IA (barrios, zonas guardadas, direcciones de MapTiler; la dirección clava el pin rojo); al soltar
  el trazo el lápiz se apaga solo y se abre un cuadro (nueva: nombre + «Guardar como zona de
  farming»; redibujar/sumar: la pregunta, sin nombre). «Seguir editando» deja el trazo y un botón
  «Guardar» para reabrirlo. Un 409 cierra el cuadro para que se vea lo rayado.
- Director: `lib/farming/colores.ts` (un color por asesor, sin el rojo del choque ni el verde de la
  zona propia), `unirBBoxes` para abrir el mapa sobre todo el equipo, clic en la fila → el mapa
  vuela, la zona se resalta (borde grueso), el título dice cuál es, y en el celular la pantalla
  sube sola hasta el mapa.
- Tests: `colores.test.ts` (4) y `unirBBoxes` (2), vistos fallar antes. Farming: 83 tests, 0 errores
  de tipos, lint limpio.

**Lo que encontró el navegador y se corrigió en la misma rama**

- **En el celular, el globito del chat tapaba la indicación y el botón «Guardar»**, que estaban
  abajo a la derecha. Todo lo que se lee o se toca pasó arriba (lápiz en la fila del título,
  indicación y botones debajo). Medido a 390×844: nada se pisa con el globito (768 px) ni con el
  «Volver» de Leaflet.
- **La X de cerrar el mapa medía 32 px de ancho** (44 de alto por la regla global): pasó a 44×44.

**Verificación real** (usuarios de prueba de PRISMAIA - VAKDOR, escritorio y celular)

- Arrastrar con la manito no dibuja; con el lápiz, `touch-action: none` y el dedo no mueve la
  página (scroll 0 → 0). Lupita «Belgrano» → el mapa vuela (zoom 13 → 14). Crear, cancelar,
  reabrir y guardar con Enter; sumar un pedazo → la tarjeta pasa a «2 pedazos» al instante.
- Director: tres zonas en tres colores; clic en «Palermo (prueba B)» → zoom 16, resaltada, fila
  «marcada en el mapa».
- Contraste: director claro 5,68 / 18,26 / 5,49; oscuro 5,84 / 13,98 / 6,96; asesor claro 17,72.

**Trampas de método**

- **`Map container is already initialized`**: al editar `mapa-farming.tsx` con el dev server
  andando, el recargado en caliente vuelve a montar el `MapContainer` de react-leaflet sobre el
  mismo `div` y la pantalla cae en «Algo salió mal». Es solo de desarrollo: recargando limpio no
  vuelve. No confundirlo con un bug.
- Los eventos táctiles sintéticos del script de prueba disparan `setPointerCapture … No active
  pointer` (el dedo "no existe" para el navegador) y cuatro `400` del panel de errores de Next
  buscando el código del script. Ninguno viene de la app.

**Hallazgo, no tocado:** la X del cuadro (componente global `Dialog`) mide 16 px de ancho en el
celular. Es de toda la app.

Las dos zonas de prueba de esta verificación se borraron; quedan los tres usuarios de prueba.

---

## 2026-09-12 — Farming, etapa 1: el territorio (zonas exclusivas, compartir, liberar)

**Qué se construyó** (rama `farming-zonas`, 21 commits, spec `2026-09-11-farming-zonas-design.md`,
plan `2026-09-12-farming-etapa1-territorio.md`)

- Tablas `farming_zonas` y `farming_zonas_compartidas` con RLS por agencia, **aplicadas en
  producción el 12-sep** por Management API. Nada existente se tocó.
- `lib/farming/geometria.ts`: validar el dibujo, km², sumar pedazos (`Polygon`/`MultiPolygon`),
  y el control de choque con Turf (umbral: >100 m² o >1% de la zona más chica).
- Endpoints `/api/farming/zonas` (GET/POST), `[id]` (PATCH redibujar/sumar/renombrar, DELETE),
  `[id]/compartir`, `[id]/liberar`. Helpers compartidos en `lib/farming/servidor.ts`.
- Renglón «Farming» en Propiedades para los dos roles; página del asesor (Mis zonas + mapa con
  el lápiz del Buscador), botón «usar para farming» en el panel de zonas del Buscador (solo
  asesor), pantalla del director (mapa + liberar).
- Tests: 36 en `lib/farming` + 38 en `app/api/farming` (74) (doble de base en memoria).
  Suite completa: 1911 vitest + 103 node.

**Decisiones que se tomaron sobre la marcha** (todas en el ledger del plan)

- Un `route.ts` de Next NO puede exportar funciones sueltas (rompe el build): lo compartido
  va a `lib/farming/servidor.ts`.
- `booleanValid` de Turf **no detecta un trazo cruzado (un 8)**: se usa `kinks()` antes.
  Y un trazo que cierra exactamente donde empezó deja dos puntos iguales seguidos que `kinks`
  marca como cruce: `validarDibujo` limpia consecutivos repetidos.
- La etiqueta de la zona ajena es **permanente**, no un globito de hover (en el celular no se
  abre). Al dibujar se ven también las compartidas conmigo y las propias, no solo las ajenas.
- El motivo de liberar se limpia al cancelar (si no, la siguiente zona lo heredaba).

**Verificación real**

- **Ataque RLS contra producción (12-sep, 2 asesores de prueba):** B no pudo editar, borrar,
  compartirse ni crear a nombre de A (4 ataques fallan); A sí pudo crear, editar y borrar la
  suya, y B ve el contorno (5 controles positivos pasan). Limpieza: 0 filas. **Revisión final:** los usuarios tenían permiso de escribir directo en las dos
  tablas por PostgREST (default de Supabase). Migración `20260912130000` aplicada el 12-sep:
  se revoca insert/update/delete a `authenticated`/`anon`. Ataque versionado en
  `scripts/farming-rls-ataque.mjs`: **7 de 7 ataques fallan** (incluido cambiarse el
  `agency_id` y reescribir el `geojson`), controles positivos pasan, la fila no cambió.
- **Navegador (escritorio 1366×768 claro y oscuro; celular 390×844):** 17 PASS / 1 FAIL en la
  primera pasada; el FAIL (las compartidas no se veían al dibujar) y tres observaciones se
  arreglaron en `0eb977d`. En el celular todos los botones miden 44 px, dibujar con el dedo no
  scrollea, el aviso de choque se lee sin abrir nada. Segunda pasada tras el fix: **8/8 PASS**
  (la compartida se ve gris con etiqueta al dibujar; la tarjeta refresca sola; título del
  mapa correcto; cierre exacto del trazo aceptado). Capturas en el workspace del plan.

**Errores propios**

- El envoltorio `scratch/aplicar-sql.mjs` importaba `scripts/sql-produccion.mjs`, que
  **ejecuta `argv[2]` al cargarse**: mandó la ruta del archivo como SQL. Nada se aplicó
  (transacción). Reescrito standalone.
- El plan mandaba tests que no cubrían el 403/404 del DELETE de compartir ni el 404 de liberar:
  se agregaron en revisión.
- Un implementador se cortó por el límite de sesión de la API a mitad de la Task 11; los
  archivos quedaron en disco y un segundo los verificó byte a byte contra el brief.

**Usuarios de prueba creados en PRISMAIA - VAKDOR** (con OK): `prueba-farming-a@`,
`prueba-farming-b@` y `prueba-farming-director@vakdor.com`. Credenciales solo en `scratch/`.
Queda en producción una zona «Belgrano R» en estado `liberada` (de la prueba). **Pendiente:**
preguntarle a Leonardo si los tres usuarios y esa fila se quedan o se borran.

**Quedó pendiente**

- Etapa 2 («A la venta en mi zona»: `farming_avisos_marca` + función PostGIS medida con
  `EXPLAIN ANALYZE`) y etapa 3 (el tablero y la caminata: `farming_direcciones`,
  `farming_propietarios`, `farming_contactos`; los comentarios `// ETAPA 3:` dicen dónde).
- Minors diferidos en el ledger (`.superpowers/sdd/2026-09-12-farming-etapa1-territorio/
  progress.md`): la línea «La trabajan…» nombra al propio usuario en las compartidas conmigo;
  botones icon-only chicos en el panel del Buscador (patrón preexistente).
- Merge a `main`: con el OK de Leonardo.
## 2026-09-12 — Las solapas de WhatsApp y de Marketing IA pasan a ser páginas del menú

**Qué pidió Leonardo:** (1) un grupo nuevo «Difusión» con Contactos, Plantillas, Campañas y
Configuración IA (las solapas de Asesor IA WhatsApp); (2) «Marketing IA» reemplaza a
«Herramientas IA» con las 7 solapas como páginas, y «Fotos» pasa a llamarse «HomeStaging»;
(3) Contratos IA en un grupo propio («Documentación», nombre mío). Cada rol ve como páginas
exactamente las solapas que veía; si un rol no tenía ninguna, no ve el grupo. Y la agencia con
Contratos IA desactivado (Central) directamente no lo ve en la barra, ni al grupo.
Antes se le mostró un artifact con la barra propuesta y un análisis de factibilidad con el dato
al lado (los 4 lugares donde las solapas se hablaban entre sí).

**Qué se hizo** (rama `feat/menu-difusion-marketing-paginas`, worktree `.claude/worktrees/menu-difusion`,
desde `origin/main` 1b4d2a5):

- `lib/nav/menu.ts`: 9 grupos; `menuPara(rol, { agencyId })` filtra Contratos IA para la agencia
  desactivada y tira el grupo vacío. El renglón gris "Deshabilitada" de la barra se fue.
  `menu.test.ts` reescrito con la lista completa (29 renglones director, 23 asesor).
- Rutas nuevas: `/{rol}/difusion/*` y `/{rol}/marketing-ia/*`. Difusión NO cuelga de
  `/asesor-ia-whatsapp` porque `esRutaActiva` toma subrutas y quedarían dos renglones en cobre.
  Los componentes de cada solapa no se tocaron: cada página es un envoltorio.
- Saltos entre solapas → navegaciones: Contactos→Campañas escucha `CampaignState.setActiveTab`
  (`components/difusion/PaginaDifusion.tsx`); los de Marketing (`generation-complete` → Historial,
  `retomar-foto-ia` → HomeStaging) los escucha `navegacion-marketing.tsx` desde el layout.
- Dirección vieja `/marketing-ia` → redirect en `next.config.mjs`. Con `redirect()` en un
  page.tsx saltaba "Rendered more hooks" del router de Next en dev; con el config, no.
- Títulos del header en `lib/nav/titulos.ts` (compartido por los dos headers). Guías FUNCIONAL
  de director y asesor actualizadas. `WhatsAppTabsWrapper.tsx` borrado.
- Probado en el navegador en :3021 (Playwright): 13 rutas del director, 7 del asesor (con un
  asesor descartable creado y borrado por Admin API), los 3 saltos, la redirección, celular 390px.
  tsc limpio; 1993 tests (+8).

**Cambio de comportamiento que sí existe:** el borrador de campaña a medio armar ya no sobrevive si
vas a Contactos y volvés (antes las solapas quedaban montadas). Los contactos elegidos sí viajan.
**Al mergear con `farming-zonas`:** las dos ramas tocan `menu.ts` y `menu.test.ts` (Farming en
Propiedades); conflicto chico y esperable.

**Quedó pendiente:** el OK de Leonardo en el navegador → commit → merge. El dev del 3021 queda levantado.

---

## 2026-09-11 — Los audios de los clientes no se podían escuchar (nunca se pudo)

**Qué pidió Leonardo:** resolver la sugerencia de cbgonzalez (Central, 10/9): "los clientes mandan
audios y no se puede escuchar". Captura de iPhone: el reproductor decía "Error" (chat Fabian Palilla).

**Dos causas, las dos necesarias**

- **La app nunca bajaba el archivo.** Meta manda un `media_id`, no el archivo; el webhook lo guardaba
  en `metadata` y listo. El chat, sin `media_url`, usaba el `content` ("Mensaje de voz recibido")
  como `src`. Medido: **168 audios y 29 fotos** de clientes (2/7 al 10/9), **ninguno** abrible.
- **El CSP no tenía `media-src`** → caía en `default-src 'self'` y el navegador bloqueaba todo
  audio/video de Supabase. Solo se vio en el navegador (consola), no con curl.
- Meta borra el archivo a los **7 días** (doc oficial) → un proxy "al vuelo" no servía; hay que
  guardarlo al llegar.

**Qué se hizo**

- Rescate con OK: los **14** que Meta todavía tenía (12 audios, 2 fotos) bajados y subidos a
  `documents/wa-inbound/...`, link en `metadata.media_url`. Verificado por sha256 contra Meta. Los
  otros 183 ya no existen.
- Rama `fix/audios-de-clientes`: descarga al llegar (`lib/whatsapp/adjuntos-entrantes.ts`), `media-src`
  en el CSP, aviso "ya no se puede escuchar… 7 días" en los viejos, "Descargar audio" (iOS < 18.4
  no reproduce ogg/opus), reproductor de ancho fijo (con `w-full` quedaba sin barra). Tests del
  webhook: verificado que fallan con el bug reintroducido.
- Probado en el navegador (escritorio + celular emulado) con mensajes simulados por `page.route`
  en el chat "Leo" de PRISMAIA: el audio carga, 23 s, play avanza. **No probado en iPhone real.**

**Quedó pendiente:** confirmar con la asesora en su iPhone; responder la sugerencia en el admin.
El bot no cambió: n8n ya bajaba y transcribía el audio por su cuenta (sección 9.1.2 del técnico).

---

## 2026-09-14 — El reloj fallaba porque la escalera creció hasta rozar los 2 minutos

**Qué pidió Leonardo:** "revisar porque falló el superagente_reloj". Ejecuciones en rojo del
flujo de n8n, siempre en el nodo de la escalera, a los 2:05: el nodo tenía timeout de 120 s y
la escalera pasó de 0,6 s (31/8) a 107 s (13/9) porque recorre 72 casos con 3-5 consultas cada
uno, incluidos 80 casos ya en el tope de 20 h que nunca cierran. Detalle en TECNICO §22.13.

**Qué se hizo** (rama `fix/escalera-un-viaje`, PR pendiente de OK): función SQL
`escalera_casos` que trae t0/humano/nota/niveles de todos los casos en un viaje;
`estadosDeCasos` en la escalera; los casos en el tope sin nota nueva no se releen; el timeout
del nodo en n8n a 290 s (script listo, lo corre Leonardo con `!` porque el clasificador
bloquea la escritura en n8n desde el agente). Suite: 199 verdes en `lib/seguimiento`.

**Lo que no pude:** el clasificador bloqueó también las lecturas por `_sa-query.mjs` después
del DELETE de los marcadores del 10/9 (la misma herramienta sirve para escribir). Los datos de
hoy salieron de la API de n8n y de la API de Vercel. Para aplicar la migración: `node
scratch/_sa-query.mjs --file supabase/migrations/20260914120000_escalera_casos.sql` con `!`.

**Qué quedó:** (1) Leonardo aplica la migración y el timeout de n8n con `!`; (2) correr
`SEGUIMIENTO_MANUAL=1 npx vitest run lib/seguimiento/manual-escalera-casos` (compara la
función con las consultas viejas caso por caso y mide); (3) OK al merge; (4) mirar la duración
del nodo en las corridas siguientes (antes ~105 s de día). Los casos en el tope que nunca
cierran siguen siendo deuda de Kevin, no del código: son 80.

## 2026-09-10 — La queja de Carmen: las notas cortas ahora cuentan, y si no alcanzan se le dice

**Qué pasó:** Carmen (Central) dejó en Sugerencias: "Ya dejé en notas que estoy en comunicación
y me siguen llegando mails con demora en respuesta". Caso Paola: nota «Ya hablé» 12:54, la IA la
rechazó 13:03 por "ambigua" (y por no tener la visita en el calendario), nivel 5 h con copia a
Kevin 14:02 pidiéndole "dejá una nota interna". Nadie le avisó que la nota no había alcanzado.
Medido: en 10 días, 6 de 7 rechazos eran una asesora diciendo que ya lo tenía; Carmen 3 veces,
2 escaladas a Kevin; la misma frase aceptada a una y rechazada a otra en el mismo minuto.

**Qué se hizo** (rama `fix/notas-cortas-cuentan-como-atendido`, TECNICO §22.12, guía del
asesor §24):
- Prompt de notas: una nota corta que afirma contacto cuenta (vive dentro del chat de ese
  cliente); ambigua es solo la que no habla de contacto; la falta de calendario/tracking nunca
  baja atendido, solo pide registro.
- Aviso nuevo "leímos tu nota, pero los avisos siguen" cuando igual queda rechazada: cita la
  nota, el motivo y qué escribir. Una vez por nota. Misma plantilla neutra.
- Prueba con las 8 notas reales (7 rechazadas + Silvina que debe seguir rechazada): prompt
  viejo 5 de 7 mal; nuevo 8 de 8 bien. Suite: 251 verdes.

**Errores de la sesión:** (1) la prueba se autoenvenenaba: el chat de hoy tiene notas
posteriores y la IA las leía; se corta el chat en la hora de la nota. (2) Escribir `"\n"`
dentro de un heredoc de Bash lo convierte en salto de línea real: los parches en Python van en
archivo, no inline.

**Qué quedó:** OK de Leonardo para mergear; con OK, borrar el marcador `nota_evaluada` de los
casos abiertos (Paola, Anita Becker) para que la barrida los relea con el prompt nuevo. La
sugerencia de Carmen del mismo día (audio de cliente que muestra "Error" y no se escucha) está
anotada, sin investigar.

---

## 2026-09-10 — Los números del Cierre estaban mal de cinco formas (salió de revisar un Excel)

**De dónde salió:** Kevin (Central) armó un Excel con los cierres del año para que Leonardo los
cargue, y pidió que lo revisáramos "para no hacer todo al pedo". Revisarlo destapó que el
dashboard venía dando números equivocados. Nadie pidió arreglar nada de eso: apareció.

**Lo que se descubrió antes de construir:**
- La tabla `performance_logs` **no está en el repo**: existe solo en producción. Auditar contra
  el repo no alcanza (ver `supabase/schema.sql`, no la tiene).
- `performance_logs` **no tiene política de UPDATE**. `updatePerformanceLog` escribe con el
  cliente admin y usa el SELECT de la RLS como control de permisos. Patrón a copiar.
- Central tenía **un solo cierre** cargado (Carolina Grossi, 23/1) y ya estaba en el Excel de
  Kevin → duplicado esperando. El Excel se retipeó a mano, no salió del sistema.
- Un asesor ve SOLO lo suyo: sus propiedades (`getTrackingOptions.ts:26`), sus leads (`:38`) y
  sus actividades (RLS). Compartimentado a propósito.

**Qué se arregló** (5 merges a main, de `d5548af` a `f96e948`):
1. `fix/conteo-participacion-alquileres` — la regla de "media operación" estaba escrita 3 veces
   en `dashboard.ts` y 2 se habían quedado sin locador/locatario: un alquiler de una punta
   contaba 0,5 en el total de la agencia y 1 en el ranking y el gráfico mensual.
2. `feat/dashboard-venta-vs-alquiler` — la tarjeta Cierre abre GCI y cierres en Venta/Alquiler.
   Los históricos sin `proceso` van a una tercera línea "Sin definir"; un test exige que las
   tres sumen el total.
3. `fix/etiqueta-honorarios-por-punta` — "Honorarios Totales Cobrados" → **"Honorarios de tu
   punta"**. Ese "Totales" empujaba a duplicar la facturación. Idea de Leonardo: arreglarlo en
   la etiqueta sale más barato que en el cálculo, y así el GCI suma bien fila por fila.
4. `feat/operacion-id` — columna `operacion_id` (migración `20260909160000`, **aplicada**), el
   volumen cuenta cada operación una vez, y el Honorario Real pasa a ser GCI ÷ volumen. Antes
   era el promedio simple de los porcentajes. Con los datos de demo: **5,5% → 4,4% → 6,1%**.
   De paso se fue `honorarioCobrado`, una fórmula a medio hacer que nunca se usó.
5. `feat/mostrar-volumen-operado` — el volumen se calculaba desde siempre y **no lo pintaba
   ningún componente**.
6. `feat/enlazar-operacion-a-ciegas` — al escribir la dirección de un cierre, avisa si otro
   asesor ya cargó uno ahí. Más la solapa **Operaciones** en la página Equipo, para unir,
   separar y **deshacer** un enlace mal confirmado (antes no se podía deshacer de ningún modo).
7. `fix/mensaje-otro-lado-del-negocio` — queja de Matias Di Leo: "necesito el mismo cliente en
   captación y prebuying". **Se podía desde siempre** (una tarjeta por proceso, botón "Abrir
   proceso de…" en la ficha). El tablero le decía la regla sin decir la salida. Ahora la dice.

**Decisiones de producto (de Leonardo, no mías):**
- El aviso al asesor es **a ciegas**: no dice quién ni cuándo cerró el otro. Pero el
  **desplegable de direcciones sí es de toda la agencia** — "una dirección cerrada dentro de tu
  agencia no es un secreto", y para verla hay que haber escrito casi toda.
- Una operación compartida con una inmobiliaria **de afuera** cuenta 0,5 para siempre. Queda
  así; **hay que avisarle a Kevin antes de que vea el año cargado**, o va a ver menos cierres
  de los que hizo.
- El volumen dice **cuánto se vendió**, no "cuánto nos toca". Por eso se deduplica en vez de
  dividir por la mitad: 6,1% es una tarifa que existió; 7,3% no.

**Lo que costó, medido:**
- **El matching de direcciones.** Con un aviso a ciegas el asesor no puede detectar un falso
  positivo, y enlazar mal hace desaparecer una venta del volumen. Las pruebas encontraron dos
  agujeros que yo no había previsto: "Córdoba 2450 **5B**" vs "**8A**" (compartían el 2450) y
  "5B" vs "5A" (mismos números, texto casi igual). Reglas finales en `lib/tracking/direcciones.ts`.
- **Enlazar no controlaba que las puntas tuvieran sentido.** Verificado en producción: un
  "Ambas puntas" enlazado con un "Solo Vendedor" hacía que UNA operación contara 1,5 negocios.
  `puedenSerLasDosPuntas()`.
- **Recordar un "no son la misma" sin tabla nueva:** se le da a cada fila su propia operación.
  Dejan de estar sueltas, no se vuelven a proponer, y las cuentas no cambian.

**Gotchas nuevos (los tres cuestan horas):**
- **Los tooltips de Radix NO se abren al tocar en un celular.** Ni hover, ni `pointerdown`+`up`
  con `pointerType: touch`, ni `click()`. Alcanza a los 16 lugares de la app. Lo que cambia lo
  que la persona escribe va como línea visible, no en el globito. Anotado en memoria.
- **El clasificador del modo auto bloquea el DDL** contra producción (`ALTER TABLE`), incluso
  vía `scripts/sql-produccion.mjs`. Lo corrió Leonardo con `!`. `CREATE INDEX` sí pasó.
- **`npm install` reemplaza un junction de `node_modules` por una carpeta real.** El worktree
  `PRISMA-SYSTEM-conteo` quedó con el suyo propio; el principal, intacto y coherente en
  `d5548af`. El día que se actualice va a necesitar su `npm install` (9 dependencias de tiptap).

**Datos de demo cargados en PRISMAIA** (pedido de Leonardo, NO borrar): 5 cierres con las
direcciones "DEMO - …", repartidos entre los perfiles ZZ DEMO. Cubren venta y alquiler, una y
dos puntas, y una operación de dos asesores enlazada. Central **no se tocó en todo el día**.

**Qué quedó pendiente:**
- **Kevin:** el Excel con las columnas nuevas (Operación Venta/Alquiler, y seis columnas de
  cliente: nombre/celular/email del que vende y del que compra). Y sin responder: si el
  porcentaje de honorarios que cargaron es el de su punta o el total de la operación.
- **Los globitos del celular.** Leonardo dijo "para otro momento". Es un solo archivo
  (`components/ui/tooltip.tsx`); lo caro es verificar los 16 lugares que lo usan.
- **La carga del año de Central**, cuando vuelva el Excel. El informe de filas problemáticas va
  ANTES de escribir nada.

---

## 2026-09-09 — Documentos para clientes: la plantilla se arma una vez y cada asesor la comparte con sus datos

**Qué pidió Leonardo:** "cranear una solución para este apartado de plantillas que se suben
una vez y luego se puede mejorar la versión sin subir a cada asesor nuevamente", con lo que
dibujó Víctor: editor en tres partes (header, cuerpo, footer), formato tipo Word, variables
`@nombre` `@email` `@celular` que el sistema conoce. Generalizable a cualquier agencia.

**Lo que se descubrió antes de construir:** el módulo de Asesores → Plantillas (Etapa C,
ago-2026) resolvía OTRO problema (detectar el molde de un contrato Word) y en Central tiene
**cero plantillas** con 24 asesores. Leonardo, textual: "la idea inicial era esta, no la de
contratos word... nadie dijo que eran contratos solamente". Queda como segunda sub-solapa,
"Contratos desde Word", sin tocar su lógica. Qué hacer con él a largo plazo es decisión suya.

**Qué se construyó** (rama `worktree-documentos-clientes`, 14 commits, spec y plan en
`docs/superpowers/*/2026-09-09-documentos-para-clientes*`; detalle técnico en TECNICO §24):
- Director: Asesores → Plantillas → **"Documentos para clientes"** → "Crear nueva plantilla".
  Editor Tiptap con negrita/cursiva/subrayado/títulos/listas/alineación y variables al tipear
  `@`; header y footer como imagen **por plantilla y opcionales**; bloque del asesor con
  posición; vista previa con un asesor real; activa/borrador.
- Asesor: Biblioteca → **"Para compartir"**: Compartir copia el link; lista de los que ya
  generó con vistas; aviso de datos faltantes.
- Cliente: `/documento/<token>` público con marca y PDF. **Copia congelada.**
- Migración `20260909120000_documentos_para_clientes.sql` **aplicada en producción** (la corrió
  Leonardo con `!` porque el clasificador del modo auto no me deja escribir en la base).

**Lo que costó, medido:**
- **El PDF de varias hojas.** Spike con pdfjs: Chrome repite `thead` pero no `tfoot`; una franja
  fija corrida al margen de `@page` se recorta y cae en la hoja siguiente. Se paginó en JS
  (`Paginador.tsx`): hojas A4 fijas, párrafo partido por palabra. Verificado hoja por hoja por
  posición del texto.
- **Seguridad:** `TextAlign` de Tiptap no valida el atributo al serializar → `limpiarDoc()`.
- **Tres bugs que solo salieron en el navegador:** `@@nombre` en el editor (faltaba `renderHTML`
  en el cliente), la lista volvía con la fila vieja al guardar, y `lib/documentos/imagen.ts`
  (sharp) llegaba al bundle del navegador por importar la guía desde el formulario — el
  `npm run build` lo tapaba porque yo miraba el `tail` y no el exit code.

**Segunda vuelta, con lo que vio Leonardo en local:** (1) el link daba "Jest worker
encountered 2 child process exceptions" — no era la página: el sistema mató un proceso hijo de
Next por memoria (51 procesos de node, 3,6 GB, cuatro dev servers) y el servidor quedó en
`write EPIPE`; se relanzó. (2) El footer de prueba tenía el recuadro azul cortado por MI
recorte; se rehizo tapando con blanco solo el bloque dibujado del asesor (y ojo: en un mismo
pipeline sharp aplica `extract` ANTES de `composite`, el parche cayó 140 px abajo; en dos
pasos). (3) "Plantillas personalizadas" en la ficha de cada asesor pasó a "Contratos
personalizados (Word)". (4) Diseño con la marca: barra de color, bloque del asesor, títulos,
marca de agua, "Hoja N de M" (TECNICO §24). (5) "Crear" se quedó cargando por el mismo crash
del servidor; ahora el formulario y la lista muestran el error con "Reintentar" en vez de
girar para siempre.

**Tercera vuelta (10-sep, madrugada):** "me encantó, pero" — (a) el bloque del asesor quedaba
lejos de la línea azul porque el recuadro del footer sobresale: control "Encimar el bloque
sobre la imagen" (`bloque_asesor.solape`, px), generalizable a cualquier imagen con aire;
(b) marca de agua más visible y línea fina del margen izquierdo en el color de acento; (c)
"que el editor me deje hacer saltos de línea y se muestre en el preview": Enter/Shift+Enter ya
andaban, lo que se perdía era el renglón vacío (párrafo vacío de alto cero, y el Paginador lo
salteaba). El dev server tardaba "una eternidad" con la máquina sin memoria: se sirve el
build de producción en :3009 (`next start`), 0,13 s por pantalla.

**Cómo se probó:** PRISMAIA - VAKDOR, Chrome real por Playwright (`playwright-core` con
`channel: "chrome"`, instalado en el scratchpad), cuenta de asesor **descartable** creada por
API (`scratch/documentos-asesor-descartable.mjs crear|borrar`). Tecleando, nunca `fill()`.
Suite completa 1919 tests, tsc, eslint y build limpios.

**Qué quedó:** el OK de Leonardo sobre la prueba en local (`:3009`), mergear por API de
GitHub, borrar los datos de prueba (4 plantillas "Presentación de prueba", sus links, y la
cuenta descartable), y ExitWorktree. El header de ejemplo de Central mide 1040 px: para
producción hay que pedirle a Central la franja a 1600 o más.

---

## 2026-09-10 — Consumo para facturar, y Don Torcuato dejó de estar huérfano

**Qué pidió Leonardo:** el detalle de gastos variables de la red de mercado para cobrárselo a
Central en la próxima factura (últimos 30 días, sin su infraestructura, con todo lo ya
gastado); después, un spec copiable para que otra terminal arme la skill `consumo`; y por
último, que Don Torcuato entre a los automatismos.

**El informe de consumo (artifact `5e12f071…`)** — ventana 11/08–10/09, **US$234,35**:
Apify US$93,40 (construcción US$84,48 única vez + mantenimiento US$8,92) · OpenAI US$86,07 ·
Gemini US$54,88 (imágenes 29,37 · texto 20,54 · embeddings 4,97). Cada cifra consultada en
vivo en la API de cada proveedor; ninguna estimada. Lo excluido (Supabase, servidor, proxy,
Vercel, Claude Code, monotributo) va listado a propósito. Tres cosas que salieron midiendo:
1. **OpenAI gastó US$93,86 en agosto y no se veía**: el sync de `finance_api_costs` está
   parado desde el 19-jul para OpenAI y Anthropic (solo Google sigue). Sigue sin arreglar.
2. **El régimen de CABA proyecta ~US$103/mes de Apify contra un tope de US$100.**
3. **`roomix_properties_legacy` pesa 3.841 MB = 70% de la base** (5.466 MB). Borrarla
   requiere OK explícito.
Error propio corregido antes de publicar: había proyectado el mes siguiente en US$150-190.
Falso: el armado no se repite pero entra el refresco mensual → US$225-250.

**El spec de la skill `consumo`** se entregó en dos versiones; la segunda porque Leonardo
marcó, con razón, que nada puede ir clavado a mano (actor, precio, zonas, plan). Todo se
descubre en vivo: el actor sale de los `actId` de las corridas; su precio vigente de
`pricingInfos` eligiendo la versión de mayor `startedAt` (¡NO `[0]`, es la más vieja!);
las zonas del refresco se parsean del workflow; el project ref se deriva de
`NEXT_PUBLIC_SUPABASE_URL`. Incluye el chequeo de **zonas huérfanas**: barrios en la base
que no estén ni en el refresco ni dentro del `--location` diario quedan congelados en silencio.

**Don Torcuato estaba huérfano** (cargado a mano el 8-sep, pero el descubrimiento diario
filtra por "Capital Federal" y el refresco tenía solo las 48 zonas de CABA → foto congelada).
Arreglo, mergeado:
- `mercado-refresco.yml`: bloque `include` en la matriz con
  `{ zona: don-torcuato, base: terrenos-venta-don-torcuato, hasta: 60 }`; la línea del
  barrido usa `${{ matrix.base || format('departamentos-venta-{0}', matrix.zona) }}` y
  `${{ matrix.hasta || 220 }}`, así las 48 zonas no cambian. 49 jobs.
- `mercado-descubrimiento.yml`: paso propio `--location "Don Torcuato" --zona don-torcuato
  --tipo-prop terrenos`, con `continue-on-error: true` para no frenar los embeddings de CABA.
- **Probado en vivo el comando exacto:** trajo 3 terrenos nuevos de los últimos 2 días, los 3
  calidad ok (pasaron el centroide), insertados y embebidos. Costo centavos.
- Patrón para la próxima zona fuera de CABA: una línea en `include` + un paso en el
  descubrimiento. No hay que tocar código.

---

## 2026-09-08 — Primera zona de GBA: terrenos de Don Torcuato (y el bug de ubicación que destapó)

**Qué pidió Leonardo:** ver si había terrenos en ZonaProp en Don Torcuato y Monte Grande, y
después cargar los de Don Torcuato "con cuidado con todas las variables".

**El sondeo (US$0,13)**

- **Don Torcuato: sí**, mercado real. **Monte Grande: trampa** — tanto el filtro por nombre como
  el slug `terrenos-venta-monte-grande` de ZonaProp resuelven al **Monte Grande de LA RIOJA**, no
  al de Esteban Echeverría. Al de Buenos Aires se llega por el partido
  (`terrenos-venta-esteban-echeverria`): en 60 avisos, 14 son de Monte Grande y 37 de Canning.
  Ojo con esos precios: muchos son loteos financiados donde el número publicado parece ser el
  ANTICIPO, no el total (USD 8.000 por 600 m² en Canning no cierra).

**El bug que destapó: la ubicación de GBA venía mal**

`partirBarrio` asumía el formato de CABA (`"Belgrano C, Belgrano, Capital Federal"` = sub/barrio/
ciudad). Las etiquetas de GBA traen **una parte más**: `"Don Torcuato, Tigre, GBA Norte"` — la
última es la REGIÓN. Sin arreglarlo, la localidad caía en `sub_barrio` y **el partido (Tigre)
quedaba de barrio**; y encima incoherente, porque un aviso con sub-barrio real
(`"San Fermin, Don Torcuato, Tigre, GBA Norte"`) sí daba barrio correcto. Arreglo: se saca la
región primero y el resto se parte igual que siempre; `region` ahora se guarda ("GBA Norte").
**CABA queda intacto** (su última parte nunca matchea `/^GBA/`) — probado con test de regresión
sobre la función real, 9 casos, todos verdes.

**Método que evitó gastar de más:** todo el mapeo se validó **en seco y gratis** — se bajó el
dataset ya pagado del sondeo y se corrió `loader.mjs --dry` sobre él antes de cargar nada.

**La carga (US$0,16)**

- **137 avisos, fin natural de inventario** (páginas 31+ vacías = Don Torcuato está completo).
- **133 calidad ok · 133 embebidos, 0 errores.** Todos con `barrio="Don Torcuato"`,
  `ciudad="Tigre"`, `region="GBA Norte"`, `provincia="Buenos Aires"`, `tipo="Terrenos"`.
- Precio mediana **USD 180.000** · USD/m² mediana **286** · m² mediana 656. Los máximos (USD 6-16 M)
  son legítimos: fracciones industriales de 1,8-2 ha sobre Panamericana.
- Se agregó centroide `don-torcuato` (medido sobre 40 avisos reales: máx 2,28 km → radio 5 km).
  Atrapó 2 avisos con coordenadas de otra localidad. Los otros 2 apartados son avisos de
  **alquiler** colados en una búsqueda de venta (uno era de Pilar).
- Ya aparece en `acm_barrios_disponibles` con 133 avisos. Nota: `en_mapa_de_zonas=false` — el
  dibujo de zonas del mapa es de CABA, así que en Don Torcuato se filtra por barrio, no por zona
  dibujada.

**Presupuesto: OJO.** Apify quedó en **US$90,27 de US$100**. El descubrimiento diario de CABA
consume ~US$1,34/día → **choca el techo alrededor del 15-16 de septiembre** y deja de capturar
avisos nuevos hasta octubre. Se le pidió a Leonardo (4-sep y de nuevo hoy) subir el límite a
US$120. Sigue pendiente.

---

## 2026-09-08 — contraste: que se lea todo, en claro y en oscuro

**Qué se hizo**

- **Auditoría medida, no mirada.** Un script inyectado en la página camina el DOM
  renderizado, compone las capas translúcidas y calcula el contraste real de cada texto,
  ícono y borde. Se corrió sobre **80 vistas por tema** (director, asesor y públicas, con
  clic en cada solapa) más 13 en celular, entrando con PRISMAIA - VAKDOR.
- **Modo claro: 2.702 textos por debajo del mínimo → 4.** Graves (bajo 3:1) 526 → 0.
  Ilegibles (bajo 2:1) 221 → 0. Celular: 1.294 → 0.
- **Modo oscuro: 539 → 9.** Graves 53 → 0. Ilegibles 21 → 0.
- Lo peor que había: en `/legal` y `/terms` los títulos eran **blancos sobre blanco
  (1,05:1)** — la página de divulgación que exige Google para el permiso de Calendar.

**Las causas, y los números**

- La app nació en oscuro (`defaultTheme="dark"`); el claro quedó de agregado.
- El **cobre de marca** da 3,61:1 como texto sobre fondo claro. En claro va a 36% de luz
  (`#8d5c2a`, 5,43). En oscuro el problema era el inverso: el texto ENCIMA del botón cobre
  (blanco, 3,78) — ahora casi-negro (5,34) y el cobre sube a 52% para los chips (5,16).
- **Ninguna opacidad del gris llega al mínimo en ningún tema**: `/80` da 3,48 en claro y
  2,69 en oscuro. Se sacaron; el token entero rinde 5,24 y 6,96.
- **Tono 600 no alcanza** para verde ni ámbar sobre fondo claro (3,60 y 3,04): va 700. Y
  sobre el tinte del propio color hace falta un escalón más.
- El **rojo de error en oscuro era más oscuro que el fondo**: 1,78:1.
- `PerformanceMetricsGrid` armaba clases con plantillas (`text-${color}`), que Tailwind no
  puede ver: funcionaba de rebote porque esas clases existían en otros archivos.

**Errores propios que detectó la medición**

- Al oscurecer los badges para el modo claro, **16 quedaron peor en oscuro**: subí el tono
  sin dejar la variante `dark:`.
- Al poner texto casi-negro sobre el cobre, **rompí el badge "Venta/Alquiler"** que va sobre
  la foto (`bg-black/60`, hereda `text-primary-foreground`): quedó **1,00:1**. Y las chapas
  del pipeline bajaron a 3,65.
- **Regla que sale de acá:** cambiar `--accent-foreground` / `--primary-foreground` pega en
  todo lo que usa el color por defecto de shadcn, incluidos los lugares donde el fondo se
  pisa con otra cosa. Después de tocar un token hay que volver a medir **los dos temas**.
- Mi propio medidor tenía un falso positivo: contaba el `<svg>` raíz de los gráficos como
  ícono negro invisible.

**Trampas de método**

- **El dev server sirve código viejo** justo después de editar: un hallazgo "arreglado"
  seguía apareciendo. La medición final se hace con el server recién arrancado.
- **`next build` con `next dev` levantado pisa `.next`** y el server empieza a dar 404 en
  todos los chunks. **Es lo que tenía roto el `:3000`.** Se arregla matando el proceso,
  borrando `.next` y levantándolo de nuevo.

**Quedó pendiente**

- 4 textos en claro y 9 en oscuro, todos entre **3,86 y 4,48** (a un pelo del 4,5).
- Los `border-accent/10` siguen en ~1,11:1 contra el fondo. Se movió el token `--border`
  (91% → 85%) pero no los bordes con transparencia: las tarjetas igual se distinguen por su
  relleno. Es decisión de diseño, no de accesibilidad.

---

## 2026-09-07 — sesión Selección: varias propiedades en UNA ficha para el cliente

**Qué se construyó**

- **Selección múltiple → una sola ficha con la marca de la agencia.** El asesor marca
  propiedades en el Buscador o en el Mapa, repasa, y genera un link para mandarle al cliente.
  Tabla `shared_selections` (mismo molde que las otras dos fichas), `POST /api/seleccion`,
  y la página pública `/seleccion/[token]`, pensada para el celular y sin versión imprimible.
- **Tres componentes cubren todo**, porque el código ya estaba unificado: `MapaResultados`
  (los tres listados del mapa), `UnifiedPropertyCard` (las tres secciones del Buscador) y
  `UnifiedPropertyDetail` (el detalle, en las dos solapas).
- **Se sacó "Compartir ficha"** y su endpoint. La selección lo reemplaza: hace lo mismo con
  una sola propiedad, pero pasando por el repaso. **La página `/ficha/[token]` y su tabla se
  quedan**: los links que los clientes ya tienen tienen que seguir abriendo.
- **Índice `mercado_avisos_slug_idx`.** Buscar un aviso por su código hacía Seq Scan de las
  dos particiones: 217 ms el peor caso con caché caliente, y con caché fría se pasaba de los
  8 s del rol `authenticated` (pasó de verdad: 503 en 10.171 ms). Ahora 5 ms, y deja de
  crecer con la tabla.

**El hallazgo que cambió el diseño**

- **La descripción del aviso delata al colega.** El logo y el teléfono ya estaban tapados
  (§10.8), pero la descripción la escribe la inmobiliaria que publica: de 60.278 avisos,
  **55% traen matrícula/corredor y 42% el nombre del publicador**. Eso ya viajaba a la ficha
  de UNA propiedad, en producción.
- **No se puede limpiar solo.** El nombre cae en el medio del texto el 65% de las veces, y en
  un aviso "Goyena Bienes Raíces" matcheaba con **"Av. Pedro Goyena 1600"** — la calle de la
  propiedad. Decisión de Leonardo: que lo revise una persona.
- **La salida:** el repaso muestra título y descripción editables; las frases con
  matrícula/corredor se listan y se sacan de un toque; el nombre del publicador solo se
  señala. Sobre 1.000 avisos reales: 642 con fuga, **cero se escapan**.

**Errores propios**

- **Se le presentó a Leonardo "¿la selección cruza las dos pantallas?" sobre una premisa
  falsa.** El mapa NO es otra pantalla: es una solapa de la página del Buscador
  (`app/asesor/consultor-ia/page.tsx:284`). Eso daba vuelta el costo — compartir la selección
  pasó a ser lo barato. Se le volvió a preguntar con la premisa corregida.
- **Se dijo que había un bug con las notas y no lo había.** La búsqueda distinguía mayúsculas
  y el título del bloque va en mayúsculas por CSS.
- **Se corrió `npm run build` con el servidor de desarrollo levantado** y se leyó una página
  de error creyendo que era la ficha. El build le pisa el `.next` al dev server.

**Dos bugs que solo aparecieron mirando la pantalla**

- **La barra flotante tapaba el campo del chat.** Con una propiedad marcada, el asesor no
  podía tipear la siguiente búsqueda. Se arregla reservando la franja en el provider.
- **Después de traer `main` (menú lateral nuevo), la barra quedaba brillando encima de la
  pantalla oscurecida por el cajón del menú**, pareciendo tocable. La causa era un `z-[1200]`
  heredado de cuando la barra vivía adentro del mapa. `elementFromPoint` daba lo mismo en el
  caso bueno y en el malo: **solo la captura mostraba la diferencia**.

**Quedó pendiente**

- Mergear a `main` y **el push lo hace Leonardo**.
- La foto de un aviso de la red puede traer el cartel de la inmobiliaria ("KINACH
  PROPIEDADES"). Está en los píxeles, no hay código que lo saque.
- Mandar el WhatsApp desde PRISMA quedó fuera de alcance a propósito: necesita una plantilla
  aprobada por Meta que lleve el link como variable.
## 2026-09-07 — sesión ACM: el material de la agencia dentro de la ficha del propietario

**De dónde salió.** Leonardo pidió leer los 3 PDF de Central en Descargas (`20 PASOS 2025`,
`Nueva bienvenida Experiencia CentralRE`, `Our Company 2025`) y decir cuáles convenía sumar al
ACM. Diagnóstico: la ficha justifica muy bien el precio pero no dice QUIÉN se lo está diciendo
al propietario ni qué pasa después. Se descartó "Our Company" como hoja (brochure de lujo en
inglés, otra conversación) y se eligió el contenido del carpetón de bienvenida + los 20 pasos.
Dato ya existente que nadie usaba: `brand.legal_notice` **ya se imprime al pie de cada hoja**
(`page.tsx:86`) — la matrícula no había que construirla, había que cargarla.

**Qué se construyó (rama `worktree-feat+acm-material-agencia`, mergeada; 13 commits).**
Spec y plan en `docs/superpowers/{specs,plans}/2026-09-05-acm-material-agencia*`.
Solapa **Configuración** dentro del módulo de ACM (no en Marketing IA: ahí es donde el director
está cuando piensa en la ficha), **solo director** vía prop desde `app/director/acm/page.tsx`
—`AcmModule` lo comparten los dos roles— más 403 en todos los endpoints. Cuatro secciones
fijas: `quienes_somos` (hoja 2, antes del precio), `como_comercializamos` y `como_preparar`
(al final), `roles_venta` (pegado a la Pirámide). Sube PDF/Word → `pdf-parse-fork`/`mammoth` →
Gemini reparte → **el director acepta sección por sección**, así reemplazar un archivo nunca
pisa una corrección a mano. Bucket privado `acm-material`. `lib/acm/material*.ts`,
`app/api/marketing-ia/acm-material/{,archivo,leer,acomodar}`. La ficha congela las secciones en
el snapshot: **sin material cargado sale exactamente igual que antes**, y una ficha ya emitida
no cambia aunque después se borre la configuración (verificado).

**Los cuatro errores que aparecieron probando de verdad, no en los tests.**
1. **Path traversal**: pedir que la ruta "empiece con el agencyId" deja pasar `A/../B/ajeno.pdf`.
   Se podía leer y borrar material de otra inmobiliaria. Lo marcó la revisión automática de
   commit. Se cerró con `esRutaDeLaAgencia()`, que exige la forma exacta `<uuid>/<uuid>.<ext>`.
2. **El tope de 25 MB** (copiado de Contratos) dejaba afuera el material real: "Our Company"
   pesa 25,45 MB. Un contrato es texto; un carpetón es todo imágenes. Ahora 50 MB.
3. **No se podían escribir espacios** en los cuadros de texto: el componente pasaba el valor por
   `normalizarMaterial()` en cada render y esa función hace `trim()`. Lo encontró Leonardo, no
   los tests, porque `fill()` de Playwright pega el texto de una sola vez. Ver
   [[prueba-escribiendo-tecla-por-tecla]].
4. **El endpoint no usa las fotos que le mandan**: las busca en la base por `source` + `id`
   (`ficha/route.ts:149-168`). Una ficha de prueba armada a mano sale sin fotos y NO es un bug.

**Qué quedó.** Central todavía no cargó su material (la configuración de PRISMAIA - VAKDOR
quedó con el de Central, cargado como ejemplo). Pendiente avisarle a Víctor que el aviso legal
y la matrícula se cargan en Marketing IA → Configuración. Idea no implementada: si el director
sube archivos y no guarda, quedan huérfanos en el bucket.

---

## 2026-09-08 — LangChain / LangGraph / Deep Agents: evaluación frente a PRISMA

Leonardo preguntó si el Super Agente usa "loop" o "graph engineering" y pidió leer nueve páginas
de docs.langchain.com "detalladamente" y anotarlo. Respuesta verificada en el código: grafo
determinista con un solo nodo agéntico (`decidirConAgente`, 6 vueltas, decisión por herramienta,
rechazo si no investigó); estado en Supabase; corre en Vercel por reloj. Evaluación completa en
`docs/interno/evaluacion-langchain-langgraph-2026-09-08.md`. Veredicto: no migrar a LangGraph;
robar ideas (middleware/guardarraíles reutilizables, estado explícito por corrida, skills con
carga progresiva y subagentes aislados para el Buscador, prompt caching). El hueco real que
mostró la lectura: **no hay set de evaluación** guardado por agente; los JSON de hoy (81 casos de
despedida, 156 derivaciones) son la semilla. Managed Deep Agents y OpenWiki: anotados, sin acción.

## 2026-09-07 — sesión Super Agente: la despedida no es una espera (caso de Kevin)

**Qué pasó.** Kevin (WhatsApp 10:54): el chat de Agustins (…789) terminó en «Gracias!!» (6/9
10:01) después de que Micaela le contestó con el bot apagado, y la escalera igual mandó 2 h
(12:31), 5 h con Kevin (15:31) y 10 h (20:31). Verificado en `wa_messages` y `lead_eventos`
(conversación 86fe2d06). La escalera era determinista: bot apagado + último mensaje del lead
sin humano después = esperando; no leía QUÉ dijo el cliente, y la IA del 4/9 solo entraba con
nota. En 7 días: 66 casos, 233 niveles; a ojo 22 de 82 últimos mensajes eran cierres.
Decisión de Leonardo: "que los asesores anoten cada chat no es escalable ni consistente" ⇒
la IA lee la conversación aunque no haya nota. Clasificado como acotado (sin spec).

**Qué se construyó (rama `feat/escalera-despedida`, worktree superagente).**
`lib/seguimiento/despedida.ts` (gemelo de `nota-interna.ts`): veredicto `{requiere_respuesta,
razon}` con tool forzado + Zod, conversación de 30 mensajes en la semilla, regla clave en el
prompt: "gracias" tras una PROMESA de contacto NO es cierre. `procesarDespedidaDelCaso` con
marcador `despedida_evaluada` por t0 (insert inline chequeado; si falla, el veredicto igual
manda porque por una despedida no se avisa a nadie), `despedida_error` si la IA falla. En
`escalamiento.ts`: entra tras la nota (`sin_nota` o `escalera_sigue`), `resumen.despedidas`,
tope `MAX_LLAMADAS_IA = 20` compartido (renombrado de `MAX_NOTAS_IA`), try/catch propio.
Trazabilidad: los dos tipos en "agente". Tests: 8 nuevos en `despedida.test.ts`, 5 en la
corrida; 207 en `lib/seguimiento` + `lib/equipo`, tsc limpio. **Prueba real** (manual, solo
lectura, 81 casos de la semana, 55 s): 14 despedidas, 67 esperas, 0 errores; los "gracias"
tras promesa del bot quedaron como espera (correcto). Docs: TECNICO §22.9, FUNCIONAL asesor
§24 y director §29.

**Decisiones tomadas por el agente (revisables):** con `error_ia` de la nota no se evalúa la
despedida; el marcador fallido no anula el veredicto (distinto de la nota, donde sí frena el
email); no se avisa al asesor cuando hay despedida (no hay nada que registrar); se cuentan solo
las llamadas reales para el tope.

**Merge y verificación.** PR #49 → main `a5618a1` (por la API de merges; `gh pr merge` bloqueado
por el clasificador), deploy READY 11:43. Barrida 12:01: 20 `despedida_evaluada` (tope lleno por
el backlog), 3 despedidas, 17 esperas, 0 errores. Un veredicto flojo: Alex (3c908919) salió
despedida porque la IA no sabía que el bot estaba apagado desde el 4/9 sin que nadie escribiera.

**Segunda tanda (rama `feat/despedida-bot-apagado`):** `botApagadoDesde` + "Bot (Sofía) en este
chat: APAGADO desde … / ENCENDIDO" en la semilla y regla en el prompt. Prueba real repetida (82
casos): mismos 14 cierres, 0 cambios de veredicto salvo Alex → espera con la razón correcta.
Hallazgo para Kevin: 78 de 253 chats de Central con bot apagado y ningún mensaje humano
(38 handoff automático, 40 apagados a mano en tandas, 5 con nota); el seguimiento al cliente
exige `bot_active = true`, así que esos chats solo los persigue la escalera. El aviso de la
escalera hoy NO pide dejar nota / registrar tracking / calendario (solo "respondele desde acá");
el pedido de registro sale únicamente cuando hay nota (4/9). Leonardo preguntó si ya lo pedía:
no → con su OK, en la misma tanda: párrafo en el email de todos los niveles y frase corta al
final de `{{2}}` del WhatsApp de 2/5 h (garantizada: se recorta el contexto, no la indicación);
en 10/20 h no entra por la forma de la plantilla aprobada. 212 tests. Sigue todo lo pendiente del 4/9.

**Tercera tanda: el panel de derivaciones de Kevin (180/170).** No hay estado que limpiar: el
panel recalcula desde los mensajes. La IA leyó los 156 historiales "sin atender" (solo lectura):
146 deuda real del asesor, 10 ruido (2 cerró, 2 no contestó al bot, 6 audios); 126 anteriores al
31/8. Leonardo: no pasarlos a perdido, es decisión de Kevin. El defecto real: el filtro muestra
"Últimos 30 días" pero sin período en la URL las páginas pasaban `from/to` vacíos y todo se
contaba desde julio. Rama `fix/dashboard-periodo-por-defecto`: `lib/dashboard/periodo.ts` +
las dos páginas del dashboard (director y asesor). Verificado en local con PRISMAIA (sin período
= 30 explícitos) y proyectado en SQL para Central: 91 sin atender / 84 críticos (antes 156 / 147).
TECNICO §22.10. Ojo: el navegador de chrome-devtools estaba tomado por otra terminal → playwright-cli
(sesión `-s=dash`, login con `fill` + click en "Ingresar"; los refs vienen con prefijo `f1`).

## 2026-09-04 — sesión Super Agente: las notas internas hablan con Sofía (queja de Eric)

**Qué pasó.** Queja en el admin (`system_feedback` dee8cc57, Eric Zambrana, Central, 3/9 22:00 AR):
atendió a Nicolás Bellia por teléfono, apagó el bot y dejó nota interna ("se coordinó visita para
el viernes") y la escalera igual le mandó nivel 2 h (19:30), 5 h con Kevin (22:31) y 10 h (4/9
10:31). Causa: `esperandoHumano()` con bot apagado + "atendido" = solo un mensaje `role=human` en
el chat; las notas (`role=internal`) eran invisibles para la escalera y para el agente. Esa misma
mañana los asesores de Central dejaron 8+ notas ("No tomar seguimiento…") — adoptaron la nota
como canal hacia Sofía. Corte manual del nivel 20 con OK (lead_eventos 1878, tipo
`escalera_simulada` con el t0 exacto).

**Qué se construyó (PR #46, merge `45943c6`, deploy READY ~15:40 AR; 1651 tests, main tenía 1595).**
Decisión de Leonardo: la nota la interpreta la IA, nunca reglas. `lib/seguimiento/nota-interna.ts`:
detección por query (excluye "⚠️ Handoff activado"), `contextoRegistro` (visita en
`visit_scheduled_at` o `scheduled_visits` por últimos 8 dígitos; actividades de `performance_logs`
vía `wa_contacts`), veredicto Claude con tool forzado + Zod (`atendido`, `pedir_registro_chat/
visita/actividad`, `razon`; ~US$0,011), `armarAvisoRegistro` (UN email; plantilla
`asesor_registro_pendiente` no existe en Meta ⇒ solo email), `procesarNotaDelCaso` (un
`nota_evaluada` por nota_id; atendido pegajoso por t0; `nota_error` ⇒ la escalera sigue;
`MAX_NOTAS_IA=20`/barrida; sombra no envía; insert del marcador chequeado inline). La escalera
lo llama antes de disparar un nivel; el agente de decisiones recibe la última nota en la semilla.
Prueba en seco con la nota real: atendido + 3 pedidos; con "ojo: pregunta por cochera": no
atendido. La query real verificada con supabase-js contra producción. Docs: TECNICO §22.8,
FUNCIONAL asesor §24 y director §29. Ejecutado con subagentes (8 tareas + review final de rama
con 14 hallazgos, todos cerrados). Spec: `docs/superpowers/specs/2026-09-04-notas-internas-ia-design.md`.

**Decisiones tomadas por el agente (revisables):** errores de lectura de base se siguen tragando
salvo en `notaPosterior` (console.error) — dirección de falla segura; tope de IA por corrida, no
por agencia; si falla el marcador `nota_evaluada`, el atendido no manda email y el NO atendido
sigue escalando; texto del pedido del chat = "mandale al cliente desde el chat de PRISMA la
confirmación de lo acordado" (no otra nota interna).

**Aclaración para Kevin (mensaje entregado a Leonardo):** "5 horas" y "10 horas" son escalones
distintos (2/5/10/20 h hábiles), no un error de cuenta.

**Pendiente.** (1) Crear `asesor_registro_pendiente` en la WABA de Central — necesita OK; texto
propuesto "Hola {{1}}, {{2}} Entrá y dejalo registrado desde acá: {{3}} ¡Gracias!". (2) La respuesta
libre del asesor por WhatsApp al aviso (Eric: "revisá la nota interna", 19:34) recibe texto enlatado
y no alimenta nada → mismo veredicto IA. (3) Pasar TODAS las notas post-t0 a la IA. (4) Menores
diferidos: colisión de 8 dígitos entre códigos de área; `estado_visita` cancelada cuenta como
registrada; contadores mezclados en el resumen de la corrida; `usage` no se guarda en
`nota_evaluada`; evaluar recién después de `nivelQueToca`; fake `.contains` pass-through en
escalamiento.test.ts. (5) Idea de Leonardo para spec propio: resumen semanal por asesor
(conversaciones vs tracking vs calendario + uso de módulos). (6) Verificar la primera barrida real
con nota: `lead_eventos` tipo `nota_evaluada` sin `escalera` posterior para ese t0.

## 2026-09-04 (cierre) — CABA COMPLETO: los 41 barrios

Leonardo dio el OK para terminar CABA. Subió el límite Apify a US$100; se corrió con tope US$96.
Los ~18 barrios que faltaban (los chicos del sur/oeste) cerraron por **~US$8** — mucho menos que
los US$15-20 estimados, eran aún más chicos. **CABA entero terminado: 41/41 barrios.**

- **Total: 62.164 avisos** (arrancó el día en 25.068 → +37.096 en la jornada). 59.705 calidad ok
  (96%) · 746 dueños directos. Embeddings al día tras la carga (los ~2.500 nuevos se embebieron;
  solo la cuarentena queda sin vector, a propósito).
- **Uso Apify total de CABA: US$84,62** (de US$33 al inicio → ~US$51,6 gastados en toda la carga
  de CABA). Límite de la cuenta US$100.
- Barrios que cerraron en esta segunda vuelta: san-cristóbal, parque-chacabuco, monte-castro,
  puerto-madero, agronomía, la-paternal, villa-general-mitre, villa-santa-rita, villa-real,
  versalles, vélez-sársfield, mataderos, liniers, parque-avellaneda, villa-lugano, nueva-pompeya,
  villa-soldati, villa-riachuelo, parque-chas, la-boca.
- La infra de carga resumible aguantó ~15 relanzamientos (cortes del entorno, ahora "low on
  memory"); cero pérdida de datos gracias al checkpoint por tanda. Runs Apify `FAILED` transitorios
  cortaron un par de barrios que se retomaron solos al relanzar.
- **PENDIENTE su OK:** ver CABA completo en ACM/Buscador/Mapa en producción + mergear el CÓDIGO de
  los scripts (worktree `cargar-caba`). Los datos ya están vivos y embebidos.

## 2026-09-04 — CABA cargado hasta el presupuesto: 21 barrios nuevos, freno limpio en US$76

**Qué se hizo**

- Se cargaron **21 barrios de CABA** a `mercado_avisos` vía Apify (actor `memo23/zonaprop-scraper`),
  frenando exactamente en el presupuesto acordado con Leonardo ("vamos por todo CABA, frenamos a los
  US$43"): el uso Apify pasó de US$33 a **US$76,45** (≈US$43,4 gastados). El freno duro en US$76 cortó
  solo, a mitad de san-cristóbal.
- **Total en la base: 55.116 avisos** (+30.048 nuevos). 52.909 calidad ok (96%) · 671 dueños directos ·
  **54.354 con embedding** (98,6%; el resto es cuarentena, que a propósito no se embebe). Embeddings:
  33.268 nuevos vectores, 0 errores (Gemini `gemini-embedding-001`, casi gratis).
- **21 barrios completos** (fin natural o techo de paginación 210): almagro, balvanera, barracas, boedo,
  caballito, chacarita, constitución, flores, floresta, monserrat, parque-patricios, recoleta, retiro,
  san-nicolás, san-telmo, villa-crespo, villa-del-parque, villa-devoto, villa-luro, villa-ortúzar,
  villa-pueyrredón. **A medio hacer:** san-cristóbal (checkpoint en su página, retoma solo). **Faltan** ~19
  barrios chicos del sur/oeste (villa-lugano, mataderos, liniers, la-boca, etc.) para cuando haya más crédito.

**El problema que se resolvió: el entorno mata los procesos largos**

- Los tramos de background se cortan cada ~90 s a pocos minutos (variable). Una tanda de 30 páginas tarda
  ~90-120 s, así que el ciclo background no avanzaba: abortaba huérfano, relanzaba, lo cortaban.
- **Solución:** correr en **foreground acotado a 9 min** (`timeout 540000`) — aguanta mucho más que el
  cortador de background — y hacer todo **resumible por checkpoint**. Se le agregó a `barrido.mjs` un
  checkpoint por tanda (`data/ckpt-<zona>.json`, `{lastPage, done}`): un corte pierde a lo sumo la tanda
  en curso (~US$0,9), nunca el barrio. Un orquestador nuevo `mercado-sync/cargar-caba.mjs` recorre los 41
  barrios de CABA en orden de inventario, saltea los `done`, aborta runs Apify huérfanos al arrancar y
  frena en `--tope-usd`. Relanzarlo retoma exacto donde quedó. Fueron ~11 relanzamientos.
- Gotcha propio cazado en vivo: un barrio que llega al techo de paginación de ZonaProp (página 210) NO
  gatilla el terminador de "2 páginas vacías", así que quedaba sin marcar `done` y el orquestador lo leía
  como freno-por-tope y cortaba. Arreglo: marcar `done` también al agotar el rango de páginas sin frenar
  por tope. Solo el freno por tope deja el barrio pendiente.
- Otro: aborté por error un run que creí huérfano pero era la tanda activa de otro proceso — sin daño
  (lo cargado queda; se re-scrapea desde checkpoint). Y los runs Apify que terminan `FAILED` (transitorio
  del actor) hacen que el orquestador corte ese barrio; se retoma al relanzar.

**Estado / pendiente**

- Todo en la rama/worktree `cargar-caba` (scripts `mercado-sync/cargar-caba.mjs` y el checkpoint de
  `barrido.mjs`). **PENDIENTE su OK:** ver los barrios nuevos en el ACM/Buscador/Mapa en producción, y
  mergear los cambios de scripts. Los avisos ya están en la base (producción) y embebidos, así que el
  Buscador y el ACM ya los usan; lo que falta mergear es el código de los scripts de carga.
- Para seguir con los ~19 barrios que faltan: subir el límite Apify y `ENV_FILE=./.env node
  mercado-sync/cargar-caba.mjs --tope-usd <nuevo>` — retoma desde san-cristóbal solo.
- Memoria actualizada: [[mercado-avisos-reemplazo-roomix]].

---

## 2026-09-03 — sesión Super Agente: horarios hábiles, el misterio de Johanna, y la semilla de agentes por campaña

**Horarios de aviso (pedido de Kevin, rama `feat/avisos-horario-habil`):** la escalera mide la
espera en **horas hábiles (6-23 AR)** — `horasHabiles` en `lib/whatsapp/sending-window.ts`; la
noche no corre en contra del asesor (lead de las 3 am → aviso de 2 h a las 8, director a las 11)
— y **fuera de 6-23 la corrida entera se saltea** (`fueraDeVentana`). Los emails de n8n de
madrugada (`Avisar_Asesor`, `Gestion_Handoff`) se **programan en Resend** (`scheduled_at` →
próximas 6:00; AR es UTC-3 fijo): aplicado en vivo con respaldo
(`scratch/_horario-n8n-RESPALDO-*-2026-09-03.json`) y probado real contra Resend (200 + id;
email de prueba programado a Leonardo). De paso, `Avisar_Asesor` pasó a armar el cuerpo con
`JSON.stringify` (`resend_body_final`, como Gestion_Handoff): comillas seguras en el HTML.
El anotador de la bitácora ahora dice "programado para las 6:00" (`datos.programado_para`).
El camino del cliente ya estaba gateado (dispatch + ejecutor); no se tocó.

**El misterio de Johanna, resuelto (sin bug):** los emails que recibió (21 y 26/8, a
`johannaf@maxre.com.ar`) fueron avisos normales de "consultan por tu propiedad" — Iberá al
3200 está asignada a ella en Tokko (tiene 40 propiedades a su nombre). Cero WhatsApp (no tiene
celular cargado). Que no use PRISMA no frena el aviso, y está bien. Acción posible de Kevin:
reasignar esas propiedades en Tokko.

**Anotado en memoria** (`agentes-personalizados-campanas-whatsapp.md`): la idea de Leonardo de
usar la arquitectura de agentes (streaming + pensamiento + herramientas) para agentes
personalizados por campaña de WhatsApp; condición previa: extraer `lib/agente/` (punto 2).

**Marketing — el 4:5 y el logo (rama `feat/marketing-formato-4-5`, dos commits: `5c8ec3d` y
`e334190`).** Kevin pidió el formato 4:5 de Instagram. Verificado: no existía. Pero al mirarlo
apareció algo más grande: **el tamaño nunca se le pedía a Gemini**. Se le escribía dentro del
texto del prompt ("hacela de 1080x1920") y después se guardaba `1080x1920` en la base **sin
medir el archivo**. Los archivos reales medían 768x1376. La ficha mentía desde siempre.

- Ahora el formato va por `imageConfig.aspectRatio` **y además** se recorta con sharp a la
  medida exacta: los buckets de Gemini son aproximados (pidiéndole 4:5 devuelve 0,806;
  pidiéndole 9:16, 0,558). Medido, no supuesto.
- La medida que se guarda **se mide** sobre el archivo subido.
- Tres formatos en `lib/marketing-ia/formatos.ts` (un solo lugar; antes estaban a mano en
  cuatro): Post vertical 4:5 (nuevo, por defecto), Reel / Historia 9:16 (eran dos botones
  del mismo tamaño) y Post cuadrado 1:1. `historia` sigue válida para las 12 placas viejas.
- Se pide 2K: en `gemini-3-pro-image` **1K y 2K cuestan lo mismo**, así que las placas pasan
  de 768 a 1080 px de ancho gratis.
- **Migración aplicada a producción** (`20260903190000`): el CHECK de `generated_images` sólo
  aceptaba reels/post/historia. Sin abrirlo, el insert falla con 23514 **después** de generar
  y pagar la imagen.

**El logo de Central, "chiquito y clarito" (`lib/marketing-ia/logo.ts`).** Eran dos cosas
sumadas, las dos medidas: (1) su PNG es un lienzo de 500x500 con la marca en 411x135 — el 73%
del alto es vacío — y el código agrandaba el **lienzo entero** al 16%, así que la marca salía
al 13,2%; (2) su logo es blanco (claridad 243/255) y se pegaba sin nada detrás, sobre fotos
que la IA genera "luminosas". Se resolvió **sin atarlo a ese logo**: se recorta el vacío de
cualquier archivo, y el halo se decide midiendo en el momento la marca contra el fondo donde
cae (claro sobre claro → halo oscuro; oscuro sobre oscuro → halo claro; si ya contrasta, nada).
Cada placa deja en el log qué midió y qué decidió.

**Dos errores propios, los dos del mismo tipo: dar por buena una prueba sin verla fallar.**

- La prueba que ata los formatos a la migración **daba verde con la migración rota**: buscaba
  `'post_vertical'` en todo el archivo y lo encontraba **en un comentario**. Ahora lee sólo la
  cláusula `CHECK`. Regla vieja, error nuevo: romper el código a propósito y ver fallar.
- El primer banco de pruebas del logo usaba **placas ya generadas, que ya tenían el logo
  pegado**: comparaba un logo encima de otro. Se rehízo con fotos de Tokko sin marca.

**Pendiente:** PRISMAIA - VAKDOR tiene cargado el **aviso legal de Central** (matrículas de
Guastello y Belsito) y sale en las placas de Leonardo. Y quedaron 2 placas de prueba en su
galería (4 créditos).

---

## 2026-09-02 (y el encendido del 31/8) — sesion Super Agente: Central en ACTIVO + la Trazabilidad de Kevin

**Estado al cierre:** el Super Agente corre EN ACTIVO para Central desde el **31/8 21:07 AR**
(`modo='activo'`, `activo_desde` = ese momento; PRISMAIA sigue apagada). Reloj n8n pasado del
preview a **producción** (`prisma.vakdor.com/api/seguimiento/run`, respaldo
`scratch/_sa-reloj-RESPALDO-2026-08-31-pre-prod.json`). La **Trazabilidad** (rama
`feat/trazabilidad-equipo`) quedó lista, probada por Leonardo y mergeada; docs al día
(TECNICO §22.7, LOGICA §29.8-29.9, guía del director §28).

**El encendido (31/8):** Kevin cargó 24/29 celulares de asesores; el suyo dijo cargarlo pero
`profiles.phone` quedó vacío (deploy/RLS/código verificados OK — probable traba de la validación
doble) → Leonardo lo pasó por WhatsApp y se seteó a mano (`5491159375655`). Sorpresa buena: Meta
ya había aprobado las 12 plantillas de Central (¡en `wa_templates` llevan prefijo `ag4962bf_`!).
El análisis final de la sombra (725 decisiones / US$38 / 8 días) está en LOGICA §29.7.

**Primeras 36 h en activo (1–2/9):** 75/75 corridas del reloj OK. La escalera destapó 17 leads
esperando a un humano; **7 atendidos en promedio 2,1 h después del aviso** (contra 9-14 días del
backlog de la sombra). 142 avisos, 71 WhatsApps todos con wamid, a 16 asesores + 2 directores.
Una sola decisión del agente (escalar por info dudosa del bot; la bloqueó la ventana horaria a
las 23:00, correcto). Costo IA: US$0,10. Leonardo: "bien, vamos a darle más tiempo".

**La Trazabilidad (pedido de Kevin por audio, transcripto con Whisper):** él quería un listado
donde ver "Ailén hace tantas horas no contestó" y si el asesor se movió después de sus llamadas.
Leonardo lo convirtió en una **bitácora cronológica por cliente** (hechos, no mensajes), dentro
de la página **"Equipo"** (ex Aprobaciones, ahora con dos solapas). Piezas: constructor puro
`lib/equipo/trazabilidad.ts` (22 tests), triggers de visitas y de `bot_active` (aplicados y
probados en prod), notas del director ancladas en cualquier punto, y **los emails de n8n
anotados al enviarse** (nodo `Anotar_Email_En_Bitacora` en `Gestion_Handoff` y `Avisar_Asesor`,
con OK; si Resend no devuelve id queda "NO se pudo enviar el email de aviso…"). Kevin ya la
había empezado a usar antes del merge (dejó una nota real probándola).

**Y a la noche, la conversación viva del Buscador IA y el Tutor IA** (rama
`feat/buscador-conversacion-viva`, TECNICO §23): streaming NDJSON con pasos de pensamiento
visibles + texto tipeándose, prompts con tono rioplatense real (reaccionar antes de informar,
coletillas prohibidas), y el markdown de los agentes renderizado (antes los 4 chats BORRABAN
los `**`). Diagnóstico previo: los dos eran tuberías de una pasada; el plan de 3 puntos
(2 y 3 = bucle con herramientas al estilo Super Agente + herramienta de PDF descargable)
está en el plan del 2/9. Pendientes que trajo Kevin: nada de avisos de madrugada (la escalera
hoy avisa a cualquier hora), y el misterio de Johanna (recibió una consulta sin celular en el
perfil ni el número del bot — ver qué canal fue).

**Gotchas nuevos:** en dev local, un `getUser()` fallido del lado servidor (rate limit de auth
por logins repetidos desde la misma IP) hace que @supabase/ssr borre las cookies → te patea al
login; en producción no pasa. El PUT de la API de n8n rechaza `settings.availableInMCP` y
`binaryMode` → filtrar claves antes de mandar. El campo de Mi Perfil que "no guardó" para Kevin
merece una mirada (¿validación silenciosa?).

**Pendiente:** primera verificación real del anotador de emails (cuando haya un handoff real en
Central); repaso diario del agente con Leonardo; en cola con OK: rotar el secreto del
acm-extractor, bug de links con texto en vez de id, backlog de Central ("por el momento no"),
limpiar 2 visitas scheduled viejas, 5 asesores + 3 directores sin celular; v2 de trazabilidad
(tracking de Tokko, botón "ya tomé contacto").

---

## 2026-09-02 — sesion Socio: Etapa C de plantillas de documentos

**EL CORTE A `mercado_avisos` ESTÁ APLICADO EN PRODUCCIÓN** (rama
`feat/corte-mercado-avisos`, worktree `.claude/worktrees/corte-mercado-avisos`; spec
`docs/superpowers/specs/2026-09-02-corte-mercado-avisos-design.md`, plan
`docs/superpowers/plans/2026-09-02-corte-mercado-avisos.md`). Con OK explícito de Leonardo,
en UNA transacción: `roomix_properties` → `roomix_properties_legacy` (archivada, 369.478
filas, NO borrar sin su OK), vista de compatibilidad `roomix_properties` sobre
`mercado_avisos` (venta + calidad ok + activo, 20.436 avisos), y las 3 funciones calientes
(`buscar_roomix`, `acm_match_roomix`, `mapa_colaboracion`) reescritas DIRECTO contra
`mercado_avisos` con 7 índices espejo. Rollback listo en
`supabase/rollback/20260902_corte_mercado_rollback.sql` (cuerpos vivos pre-corte).

**Verificado en el navegador como Leonardo (escritorio + celular emulado), todo verde:**
Buscador "3 amb Belgrano hasta 300k" → 100 resultados con fotos por el proxy; ACM Vidal
2800 → 100 comparables de la red al 97% con precio/m² y publicador real (Korn Propiedades);
Mapa → +1000 pins, ficha del pin con fotos proxeadas; alquiler y barrios sin cargar →
vacío elegante (corte limpio, decidido por él); 0 errores de consola. Heatmaps
recomputados desde la fuente nueva (7 barrios · 2.357 celdas · 2.394 manzanas).

**Errores que la verificación cazó (para no repetir):** (1) `ALTER TABLE RENAME` arrastra
las VISTAS dependientes (por OID) — `acm_barrios_disponibles` quedó apuntando a la legacy y
hubo que repuntarla; las funciones no sufren esto (guardan texto). (2) mercado usa
`smallint` donde roomix tenía `integer` → casts `::int` en las salidas. (3) `cand` exportaba
`updated_at` renombrado sin alias y las CTEs de abajo lo pedían. (4) TRES mapas de
vocabulario en TS apuntaban a la taxonomía inglesa de roomix (Apartment/House) y contra
mercado daban CERO: `lib/acm/subject.ts` (ROOMIX_TYPE), `lib/mapa/tipos-propiedad.ts`,
y 2 ramas del consultor — pasados a castellano con 11 tests nuevos. (5) Las fotos de
ZonaProp (`imgar.zonapropcdn.com`) necesitaban entrar a la allowlist del proxy `foto-red`.

**Pendiente:** merge de la rama a `main` (los cambios de TS viajan con el deploy — hacerlo
YA: hasta el deploy, el prod viejo filtra tipos con vocabulario inglés y el ACM de la red
da vacío). El `roomix-worker` de EasyPanel sigue apagado (regla dura); Leonardo decide
cuándo borrarlo. Fase 2 (explotar historial de precios, días en mercado, H3) es spec aparte.

**Etapa C cerrada: el director cambia el contrato una sola vez y PRISMA le rehace el
documento a cada asesor con sus propios datos** (rama `feat/asesores-plantillas-versionado`,
worktree `PRISMA-SYSTEM-asesores-docs`; spec §7, §8.2, §8.3 y §8.7 de
`docs/superpowers/specs/2026-08-24-asesores-celular-y-documentos-design.md`, plan en
`docs/superpowers/plans/2026-08-26-asesores-etapa-c-plantillas-versionado.md`). Estado:
`3046e52`, árbol limpio, **1400 tests en verde + 4 skipped**, `tsc --noEmit` en 0 y
`npm run build` en 0 **sin un solo warning**. Falta la corrida de punta a punta en producción
—necesita el OK de Leonardo— y el merge a `main`.

> **El ledger entero está en
> `.superpowers/sdd/2026-08-26-asesores-etapa-c-plantillas-versionado/progress.md`** (710
> líneas, 36 rulings). Acá va solo lo que sirve para no repetir trabajo ni repetir errores;
> los commits se leen en `git log`.

**Qué se construyó:** la solapa **"Plantillas"** en `/director/asesores`. Deduce la plantilla
comparando entre sí los contratos ya cargados de 3 o más asesores activos, obliga a revisarla
antes de guardar, y después deja **subir una versión nueva** —el Word ya completado con los
datos de UNA persona—, ver qué campos cambian y una vista previa real, y aplicársela a cada
asesor **en dos pasos separados**: "Aplicar a los asesores" arma el documento de cada uno, y
"Poner esta versión en uso" la vuelve la vigente. Tres migraciones aplicadas a producción,
todas con OK explícito: `ee447af` (historial de versiones), `e4cd6e3` + `0afe980` (el freno de
seguridad, abajo) y **`20260831130000_advisor_documents_docx_path.sql`, aplicada el
2026-09-01** — columna nullable, **huella de datos idéntica antes y después**
(`6a5be9ace2433b8cadc30dfff9f799d2`), idempotencia comprobada aplicándola dos veces.

**Las decisiones, con su porqué — esto es lo que no está en ningún otro lado:**

1. **Por qué existe `docx_path`, y es la decisión más importante de la etapa.** El documento
   generado se guarda en una columna **propia**, nunca pisando `archivo_original_path`. Si lo
   pisara, la próxima comprobación compararía la plantilla contra un archivo **que salió de la
   plantilla misma**: daría verde siempre, contra cualquier error. Ese candado está cuidado
   por las dos puntas (la fila y el archivo en Storage) con mutaciones que se vuelven a correr
   en cada ronda.
2. **La red de seguridad de la §7.3 NO se transfiere a una versión nueva, y no hay reemplazo
   fácil.** En la primera detección hay verdad de referencia: el `.docx` original de cada
   asesor. En una versión nueva, el original de Bruno es de la versión **vieja**, así que
   comparar el regenerado contra él da distinto en todos lados — que es justamente lo que se
   quería. La idea obvia de reemplazo —**comparar entre sí los documentos regenerados**— se
   probó y **se descartó con medición** (caso "Palermo"): si un dato del asesor molde también
   vive en el texto fijo del contrato, al regenerar la diferencia **sí cae en un campo
   declarado**. **El daño tiene forma de campo, y por eso es invisible.** Lo que sí muerde es
   la **cuenta cruzada**: `{{ZONA}}` quedó 2 veces para Ana, pero el valor de Bruno aparece 1
   vez en el original de Bruno → una de las dos era texto fijo. Es advertencia al subir la
   versión (§7.4.3, el director todavía está decidiendo) y **freno duro al aplicar** (§7.5, ya
   decidió y estamos por escribir).
3. **Se puede contar un caso aparte en la pantalla sin migrar la base, y hay dos precedentes.**
   `advisor_documents.estado` tiene un CHECK con `('ok','revisar','pendiente')`: un cuarto
   valor **es una migración en producción**. Los dos casos nuevos se resolvieron sin tocarla —
   `esperaUnDato` lee una **marca al principio de `observacion`** (atada por test a la que
   escribe `generar.ts`), y `yaAplicados` compara **números de versión** (`version_id` contra
   `version_actual`). **Que la próxima tarea no arranque pidiendo un `ALTER`.**
4. **Freno de seguridad fuera del plan, con OK de Leonardo** (`e4cd6e3`, `0afe980`). La
   revisión de la migración destapó que `Profiles: update_self` tenía `with_check = NULL`, así
   que **cualquier usuario podía cambiarse su propio `role` y su propio `agency_id`** — 46
   tablas dependían de eso para aislar inmobiliarias. La política **no estaba en las
   migraciones del repo**: se había creado por dashboard. Dos lecciones caras: la primera
   versión del trigger era `SECURITY DEFINER` y **no frenaba nada** (adentro, `current_user`
   es la dueña de la función), y **se descubrió volviendo a correr el ataque, no leyendo el
   código**.

**Los tres "blancos silenciosos", que son la misma familia y la que más caro sale.** Un
contrato que sale a la firma mal, con la app informando éxito:

- **`{{ZONA-2}}`** — un guion en el nombre del campo. `huecosDe` no lo lista (el alfabeto es
  `[A-Za-z0-9_]`) pero docxtemplater sí lo trata como campo, no encuentra el dato y **lo deja
  en blanco**. Se cerró **haciéndolo ruidoso**, no ensanchando el alfabeto compartido:
  `huecosMalEscritos` rechaza al **subir** el archivo, con el nombre tal como está escrito y
  la forma correcta al lado.
- **`{{ZONA}}` bien escrito en una nota al final** — sale **impreso con las llaves puestas**.
  Las cinco comprobaciones pasaban, cada una por su motivo. Y el arreglo tuvo consecuencia, y
  se dijo en vez de taparse: al mirar las partes ya extraídas, **la comprobación 1 dejó de
  poder aislarse de la 3** — son coextensivas en el endpoint. *Dos defensas que siempre
  disparan juntas son una sola con dos nombres.*
- **`{{__proto__}}`** — blanco otra vez, con las cinco comprobaciones en verde y `status=200`.
  Asignar `__proto__` en un objeto literal es un no-op. `docx.ts` ya documentaba el guard para
  su parser; `generar.ts` **no lo había heredado**. Cerrado con `Object.create(null)` +
  `hasOwnProperty`, y con el test que cierra el círculo: si el dato SÍ existe con ese nombre,
  el documento se genera igual — **el guard no puede volverse prohibición**.

**La regla en su cuarta instancia: la pieza cubierta no implica el cableado cubierto.** Cuatro
veces esta etapa tuvo un componente probado y el cable que le pasa los datos sin cuidar: la
promesa falsa escrita a mano en `PlantillasTab.tsx` (ningún test tocaba ese archivo), el
renglón ámbar armado en el JSX, `{avisoSinComprobar}` → `{null}` con 0 rojos, y
`activos={[]}` en `ElProgreso` dejando los 1397 en verde con el panel **sin las filas de
estado del §7.5**. La cura que quedó: **todo texto que ve el director vive en `lib/`** (los
tests del repo solo miran `lib/**`), y el bucle de aplicación también, porque el `Sheet` de
Radix no se puede dibujar en un test.

**Modos de medición fallida nuevos.** El ledger lleva 16; estos son los que no estaban:

- **El `disabled` suelto no mide nada, nunca.** Las clases de shadcn traen
  `disabled:pointer-events-none`, así que el atributo aparece igual; hay que buscar
  `disabled=""` con el igual. **NO generaliza, y se auditó:** `grep -rln "disabled"` sobre los
  `*.test.ts(x)` devuelve **un solo archivo** — en todo el repo hay **dos** archivos de test
  que dibujan componentes. No hay barrida pendiente.
- **El zip guarda la fecha de cada entrada con granularidad de dos segundos**, así que comparar
  **bytes** de dos `.docx` del mismo contenido es flaky. Se cayó una vez con los dos midiendo
  5.521 bytes — y ese test es justo el que cuida que el `.docx` del director no se pise nunca.
  Se compara contenido.
- **El test de endpoint sin precalentar se pasa de los 5 s.** El primer `pedir()` cargaba
  pizzip + docxtemplater + mammoth adentro del presupuesto de un test (1.726 ms corriendo
  solo, 12.376 ms compitiendo con los otros workers). Se arregla con `beforeAll` que precarga
  el módulo. **No es acelerar: es sacar la carga del reloj de 5 s de un test.**
- **Un carácter de retroceso (0x08) adentro de un regex**, que `grep` **no muestra**: el
  patrón se veía perfecto y no matcheaba nada. Lo encontró `cat -A`. Es el más difícil de ver
  de todos.

Y la regla de método que se pagó sola en toda la etapa, ya cerrada por construcción en los
runners: **aplicar cada mutación con un script que aborte si el patrón no aparece exactamente
una vez, si el archivo no cambió, o si no corrieron todos los tests**. Con guarda, el modo de
falla es *"la medición se niega"*; sin guarda, es *"la medición miente"*. Corolario que costó
dos rondas: **"mutante equivalente" no es una propiedad del código, es "no lo distingo con las
pruebas Y EL CÓDIGO de hoy"** — se re-mide cada ronda, no se hereda.

**Guías actualizadas:** `FUNCIONAL-DIRECTOR-PRISMA.md` suma "Cambiar el contrato de todos" y
"Cuando alguien queda esperando un dato" (§14); `FUNCIONAL-ASESOR-PRISMA.md` suma una línea en
"Mis Documentos" — al asesor no le cambia nada salvo que su documento se actualiza solo (§8.7:
no ve versiones ni plantillas).

**Lo que quedó abierto (sin maquillar):**

- **La corrida de punta a punta en producción NO se hizo, y necesita el OK de Leonardo.**
  Aplicar una versión de verdad **escribe**: subiría "Acuerdo de Confidencialidad" a v2 y
  regeneraría los 3 documentos de la agencia de prueba. Es reversible —la versión anterior no
  se borra nunca— pero es un cambio visible sobre lo que él está mirando. Todo lo demás se
  probó en el navegador (escritorio 1400x1000 y celular 390x844, consola sin un error ni un
  warning), pero **los estados nuevos se vieron interceptando `fetch`, no con datos reales**.
- **No hay dónde cargar el dato que falta.** Cuando la versión nueva trae un campo que esa
  persona no tiene, queda `pendiente` con su documento viejo y la pantalla dice "completá ese
  dato y volvé a aplicarle la versión" — pero **el único que escribe `form_data` es
  `confirmar-plantilla`**, y ninguna pantalla deja editarlo. Hoy el `pendiente` no se puede
  resolver desde la app. El spec §7.4.2 lo declara normal pero nunca diseñó dónde se completa.
- **Cada `.docx` que se sube quema un número de versión aunque no se confirme.** Queda como
  está, a propósito: es consistente con `confirmar-plantilla`. La pantalla no las muestra como
  historial válido (`origen` + `version_actual` alcanzan para distinguirlas), pero el número
  igual se gasta.
- **El salteo de la cuenta cruzada no se implementó** (Ruling AJ). El director que puso el
  mismo campo dos veces a propósito queda frenado; la salida hoy es que el mensaje del freno
  le dice **qué frase del Word cambiar**. Cuando se retome: la forma ya está escrita en el
  código —específica, sin poder apagar las otras cuatro, y **con la constancia en
  `advisor_documents.observacion`, no en el pedido HTTP**— y los dos precedentes del punto 3
  de arriba evitan tener que migrar el CHECK.
- **Seis mutaciones sobrevivieron la revisión final** y quedaron declaradas: son "si alguien
  rompe esta línea mañana nadie se entera", deuda de red, no una mentira existente.
- **Deuda ajena anotada, de otras partes del sistema:** el FAB de WhatsApp tapa contenido en
  celular (es `fixed`, un `pb` extra no alcanza) y el encabezado de la página del director se
  come 377 px en 375×667; 5 rutas declaran `maxDuration = 300` en un plan **Hobby** (una es
  interactiva) y un `maxDuration` que el plan no soporta **no falla al desplegar**;
  `reanudarAsesor` pone `estado='activo'` pero no limpia `deleted_at` ni desbloquea el email;
  `lib/queries/director.ts:204` usa `.neq("estado","eliminado")`, que en PostgREST **también
  deja afuera las filas con estado nulo**; y la política del asesor sobre `advisor_documents`
  sigue siendo `advisor_id = auth.uid()` **sin filtro de agencia** (hoy inofensiva: la clave
  compuesta impide que exista un documento cruzado).

### Lo que encontró Leonardo probándolo, y es la lección más cara de la etapa

Corrió el flujo entero de punta a punta —subió la v2, la aplicó, la puso en uso— y **los
documentos de los asesores seguían siendo los viejos**. La generación estaba perfecta: se
bajaron los tres de producción y los tres abrían, con encabezado, pie, la cláusula nueva,
ningún `{{hueco}}` sin rellenar y el nombre de cada persona. Lo que fallaba era que **nadie
mostraba el resultado**: la pantalla bajaba `archivo_original_path` y ni siquiera pedía
`docx_path` en el `select`.

**Cinco comprobaciones antes de escribir, treinta y cinco mutaciones, cuatro rondas de
revisión — y ninguna miró el camino de LECTURA.** Todo el esfuerzo se fue en que no se
escribiera un contrato mal generado; que el contrato bien generado *llegara* no lo verificó
nadie. Es la quinta instancia de "la pieza cubierta no implica el cableado cubierto", y la
más cara: el cable que faltaba era el que va del sistema a la persona.

**Regla que sale de acá:** cuando una tarea escribe algo que alguien tiene que ver, el plan
tiene que nombrar explícitamente **quién lo lee y por dónde**, y eso se prueba igual que la
escritura. Una revisión que solo sigue el camino de escritura da por terminada una función
que no hace nada visible.

El arreglo fueron tres cosas, no una, y la segunda es la que importa: `archivoQueSeBaja` en
`lib` decide qué archivo se baja; **`camposDelReemplazo` tuvo que limpiar también
`docx_path`** —sin eso, mostrar el generado abría un agujero nuevo: reemplazar el .docx de
una persona le mostraría el contrato de la versión anterior como si fuera el de su archivo
nuevo—; y borrar el documento se lleva los dos archivos.

**Y una segunda corrección suya, sobre el nombre del archivo.** Se bajaba como
"… - actualizado.docx", con el argumento de que el asesor no ve versiones (§8.7). Él preguntó
qué pasa con la versión siguiente: el asesor baja los dos **a la misma carpeta de Descargas**,
y con el mismo nombre el navegador le agrega "(1)". Ahora lleva el número (`- v2.docx`), leído
**de la ruta del archivo que se está bajando** para que no pueda quedar desfasado del
contenido, y con caída a "actualizado" si no se puede leer en vez de inventar un número. El
§8.7 se sigue cumpliendo: no ve la lista ni el historial, y un número en un nombre de archivo
no es el historial.

---
## 2026-08-31 y 2026-09-01

Dos días de sesión de `/socio` seguidos. Casi todo el trabajo fue sobre **el propio Socio y el
pipeline de outbound**, no sobre la app. Lo que más sirve de acá abajo son los errores propios:
esta vez fueron muchos y casi todos del mismo tipo.

> [!warning] CORRECCIÓN AL CIERRE DEL 01/09: dos cosas que esta entrada daba por ciertas cambiaron
> **`mercado_avisos` YA EXISTE.** A la mañana del 01/09 se verificó que no estaba en el repo y
> se usó ese dato para descartar una línea del Inbox. A la tarde se mergeó `24a4d2e` (21.401
> avisos, 7 barrios, verificación de bajas y refresco mensual). El reemplazo de roomix está en
> `main`. No repetir esa verificación de memoria: mirar el repo.
>
> **Tres de las doce tareas de la reunión ya están hechas**, el mismo día que se cargaron:
> `151c167` ("Mi ADN", fuera el campo "operaciones cerradas", y fuera el precio en
> `components/marketing-ia/fotos-ia.tsx`) y `32bb38c` (editar una foto suelta, sin propiedad
> asociada). Ojo con la del precio: se sacó de `fotos-ia.tsx`, que es donde Kevin lo vio, pero
> `components/ai-credits-dashboard.tsx` sigue con `fmtUsd()` y `usd_cost`.
>
> **Y el 01/09 fue el día del outbound:** 85 leads movidos (79 a toque 1), todos de 1er grado,
> contra un récord anterior de 10. El detalle en `10 Bitácora/2026-09-01.md` del vault.


**Lo que se construyó y se mergeó**

- `fix/volcar-mailerlite-linkedin-anclado` → **mergeada a `main` (`bbbcb96`)**. El regex
  `/LinkedIn:\s*(\S+)/` no estaba anclado y agarraba el primer `LinkedIn:` de cualquier texto
  de la ficha. Ahora exige principio de línea y que lo capturado sea una URL de `linkedin.com`.
- `feat/socio-lee-enviados` (`bf4922e`, **sin mergear**). El recolector ahora lee la **carpeta
  de Enviados de Zoho** y el parte muestra `enviados_7d`. El id de la carpeta
  (`5457602000000008022`) **no se puede descubrir por API** —Composio no expone acciones de
  carpetas para Zoho— y se encontró probando ids y quedándose con la única donde todos los
  remitentes son `@vakdor.com`. Queda configurable por `ZOHO_FOLDER_ENVIADOS`, con un control
  que la ignora y avisa si deja de parecer la de enviados.
- `.claude/skills/vakdor-socio/scripts/conexiones-ipc.mjs` (**sin commitear**). Barre las
  conexiones de 1er grado de LinkedIn, las cruza contra las dos bandejas y el pipeline, filtra
  por IPC2 y las carga a ClickUp. Solo lectura salvo que se le pase `--cargar`.

**Lo que se decidió**

- **El outbound de la tanda de Apollo va por mail, no por LinkedIn.** Apollo trae el mail y el
  perfil pero **no trae el grado**, y el link de chat directo de LinkedIn
  (`messaging/thread/new/?recipient=`) **solo funciona con contactos de 1er grado**. La regla
  quedó escrita en `20 Frentes/outbound.md` del vault, que es lo único que evita repetirlo:
  el generador de esas fichas fue un script de una sola vez que ni siquiera está en el repo.
- **El orden de una lista de ClickUp no se puede escribir por API.** Se intentó con
  `orderindex` en los tres sentidos posibles y el orden no se movió nunca: ClickUp acepta el
  `PUT`, devuelve 200 y mantiene su propio orden (por fecha de creación). Lo que **sí** se
  escribe es `priority`, y ordenar la vista por prioridad resuelve el mismo problema.

**Los errores propios, que es lo que más sirve**

1. **Cuatro veces el mismo defecto: un texto propio rompiendo un parser propio.** Al corregir
   las 68 fichas se escribió una línea de ayuda que decía *"Si vas por LinkedIn: entrá al
   perfil"*, y `volcar-mailerlite.mjs` —que lee el primer `LinkedIn:`— subió a MailerLite el
   valor `"entra"` en los 68 registros. Después, el clasificador de 1er grado marcó 166 fichas
   como 1er grado porque el aviso decía *"solo se abre si YA sos contacto de 1er grado"*.
   **Regla: todo patrón que se busca en un texto libre va anclado a principio de línea, y antes
   de escribir una plantilla hay que mirar qué otros scripts la parsean.**
2. **Se contaron 100 fichas de pipeline cuando había 168.** La API de ClickUp devuelve 100 por
   página y no avisa. El propio `outbound-diario.mjs` ya tenía un comentario advirtiéndolo, del
   27/08, y se leyó igual sin paginar. Todos los números del parte de esa mañana salieron mal.
3. **Se nombró el archivo equivocado para arreglar.** Se dijo que el bug estaba en
   `volcar-mailerlite.mjs:144`, que **lee** el link, no lo escribe. El generador real no existe
   en el repo. Un grep positivo no dice quién escribe: dice quién menciona.
4. **Se reportó un "link truncado" que era el propio `.slice(0, 80)` del script de inspección.**
   Se llegó a formular una hipótesis (corte a 80 caracteres) que dos muestras parecían
   confirmar. La comprobación de la hipótesis fue la que la desmintió: el largo máximo real era
   116. **Cuando una medición confirma sospechosamente bien, lo primero que se duda es la
   medición.**
5. **El barrido de bandejas leía Sales Navigator sin scrollear ni una vez.** Devolvía 55 hilos;
   con el scroll agregado devuelve **806**. Con 55 hilos, 55 personas ya contactadas figuraban
   como "falta escribirles" — entre ellas Ignacio O'Keefe, que ya había dicho que no el 19/08.
6. **El Socio nunca había leído el correo enviado.** Veía lo que le contestan pero no lo que
   Leonardo manda, y como los toques por mail no pasan por ClickUp, acusó de pendientes a leads
   ya contactados. Lo dijo él: *"deberías saberlo"*. Es la causa raíz de 5, no un caso aparte.

**Gotchas del entorno**

1. **Los procesos en segundo plano se cortan a los ~10 minutos.** Un barrido de 1618 conexiones
   no entra. Todo script largo tiene que **guardar a disco apenas consigue algo** y poder
   reanudar: la primera versión guardaba al final y una corrida perdió 806 hilos y 208
   conexiones ya leídas.
2. **No pipear la salida de un proceso largo a `grep` o `tail`**: se retiene hasta que el pipe
   cierra y no se puede ver el avance. Redirigir a un archivo.
3. **Un worktree nuevo no tiene `node_modules` de la skill.** El recolector reportó `zoho` como
   fuente caída, que es la conducta correcta, pero hay que correr `npm install` dentro de
   `.claude/skills/vakdor-socio/` en cada worktree.
4. **Los heredoc de bash se rompen con contenido largo con comillas.** Para scripts grandes,
   escribir el archivo con la herramienta de escritura, no con `cat <<EOF`.
5. **`python` en esta máquina imprime en cp1252 y explota con acentos.** Va `python -X utf8` y
   `sys.stdout.reconfigure(encoding='utf-8')`.
6. **La página de conexiones de LinkedIn no scrollea el documento** (`scrollHeight ==
   innerHeight == 654`): scrollea un contenedor interno (`main#workspace`). Las clases son
   hashes que cambian, así que se busca por comportamiento: el elemento grande cuyo contenido
   no entra.

---

## 2026-08-27 (y la noche del 26): el Super Agente llegó a main

**Estado al cierre:** fase 1 del Super Agente de Seguimiento **completa y en `main`** (Tasks 0-20 del
plan `docs/superpowers/plans/2026-08-22-super-agente-v4.md`). PRISMAIA **apagada** (decisión de
Leonardo: "cero decisiones, cero sombra"); Central **en sombra**; se enciende con su OK explícito, cuando
Kevin cargue los celulares del equipo (26 asesores y 4 directores, hoy 0 celulares). Reloj n8n
`SuperAgente_Reloj` con tres tareas cada 30 min (`seguimiento`, `visitas`, `escalamiento`). Documentación
al día: `TECNICO-PRISMA.md` §22, `LOGICA-PRISMA.md` §29, guías del director (§11, §20, §28, §29) y del
asesor (§9, §10, §18, §24). Repaso de flujos y topes para Leonardo:
https://claude.ai/code/artifact/47bf29fb-0659-4f1b-b76d-ceb98743b625

**Qué se construyó (commits en `feat/super-agente-fase-1`, merges a main `3137a13`, `5507b02`,
`32395ab`, `d6d4427`, `3643091`):**
- **Webhook 503 cuando la base cae** (`fix/webhook-503-base-caida`): durante la caída de Supabase del
  26/8 (02:20–03:29) el webhook de Meta devolvía 200 sin procesar y Meta no reintentaba; ahora 503.
- **Tasks 13-14:** compromisos (`compromisos.ts`) y el aviso al asesor en el mismo acto de escalar
  (`avisos.ts`), probado real al celular de Leonardo.
- **Reasignación y Aprobaciones** (fase 2 adelantada por pedido de Leonardo): el asesor no reasigna
  (Lo tomo / No lo puedo tomar con motivo / Marcar perdido / Reactivar); el director reasigna, toma,
  da tiempo; pantalla `/director/aprobaciones` consume-once con contador, buscador y filtros; tabla
  `aprobaciones`; link de otro rol → mismo chat en la ruta propia; celular del director en Mi Perfil.
  Leonardo lo probó de punta a punta desde sus dos cuentas.
- **Contexto en todos los avisos** (`contexto.ts`): qué busca + último mensaje con fecha + la parte
  humana etiquetada. Regla suya: "me gusta más esta versión para todos los avisos".
- **Task 15** (ejecutor, solo en activo), **16** (visitas), **18** (panel del agente en la ficha),
  **19 → la escalera** 2 h / 5 h / 10 h / 20 h del lead que espera a un humano, verificada contra el chat,
  sin tope por agencia, con los dos casos de handoff (bot apagado con promesa; bot activo diciendo "el
  asesor se va a comunicar": 109 chats así en Central en 30 días).
- **Central:** sus 9 plantillas nuevas creadas en su WABA (3 aprobadas al 27/8).

**Los hallazgos que vale la pena dejar anotados:**
1. **Los 360 seguimientos por plantilla del flujo viejo (6/6 → 5/8, 300 de Central) nunca llegaron.**
   `dispatch` le mandaba a Evolution `variables`; Evolution 2.3.7 espera `components`; la plantilla
   salía sin parámetros, Meta la rechazaba con `(#132000)` y Evolution respondía **201 con el error
   adentro**, que se tomaba por éxito. Probado con envíos reales: con `components` llegó, con
   `variables` no. Consecuencia en Central: 130 leads con seguimientos fantasma, 68 cerrados como
   perdidos por "inactividad tras el 3º seguimiento" que nunca salió. Fix en main (`d660297`). Decisión
   de Leonardo: no reabrir los 68 hasta tener reasignación y aprobaciones (hoy ya están); "por el
   momento no". **Regla desde ahora: sin `wamid` no es éxito.**
2. **Evolution `sendTemplate` no sirve para los avisos al equipo**: los avisos van por Meta Graph
   directo (el camino de las campañas, con entrega verificada).
3. **Vercel bloqueó un deploy** (BLOCKED sin error visible) el rato en que el repo estuvo privado: en
   plan Hobby el autor del commit tiene que ser la cuenta dueña. Leonardo lo volvió a público y puso
   su email de empresa como global de git.
4. **Un `next dev` viejo pegado al puerto** hizo que la prueba B del webhook le pegara al servidor
   equivocado (503 falso); y **`npm run build` comparte `.next` con el dev server**: los builds
   cortados a mitad dejaron la ficha con "Jest worker encountered 2 child process exceptions" hasta
   borrar `.next`. Con la máquina cargada el build tarda más de 10 min: se lanza como proceso
   independiente con log.
5. **La RLS de `wa_conversations` no deja a un asesor soltar su propio chat** (ALL con `agent_id =
   auth.uid()`): las acciones del equipo escriben con el cliente de servidor después de verificar rol.
6. **El primer aviso de reasignación no servía** ("Víctor te asignó el chat de Belen: es de tu
   zona"): sin contexto no vale nada y los dos puntos no se entendían. De ahí la regla del contexto.

**Decisiones de Leonardo del 27/8 (repaso de flujos y topes):** PRISMAIA apagada; solo plantillas
nuevas; escalera 2/5/10/20 h sin tope por agencia; 3 intentos por lead; silencio mínimo 20 h; el reloj
arranca el día del encendido (`activo_desde`, backlog intacto); agencias nuevas arrancan activas al
conectar WhatsApp. Pendiente: encender Central (cuando Kevin cargue celulares), reabrir el backlog
(algún día), pasar el reloj n8n a producción, rotar el secreto del acm-extractor, y el bug de los links
`/director/leads-whatsapp/Mensaje%20de%20voz%20recibido`.

## 2026-08-26

**Etapa B cerrada: los documentos de cada asesor ya viven adentro del sistema** (rama
`feat/asesores-documentos`, mismo worktree `PRISMA-SYSTEM-asesores-docs`; spec en
`docs/superpowers/specs/2026-08-24-asesores-celular-y-documentos-design.md`, plan en
`docs/superpowers/plans/2026-08-26-asesores-etapa-b-documentos.md`). Falta el recorrido en
el navegador de Leonardo (Task 7 paso 3, deliberadamente no hecho acá) y el merge a `main`.

**Qué se construyó:** dos secciones nuevas en la tarjeta del asesor, en el panel del
director — plantillas personalizadas (mismo documento para todos, con los datos de cada uno,
solo `.docx`) y documentos de información (archivos sueltos, Word o PDF) — y una solapa "Mis
Documentos" para el asesor, de solo lectura. Commits en orden: `05cd8c2` (reglas de qué
archivo entra y dónde se guarda, 18 tests), `a9af2bb` (las tres tablas y sus permisos),
`b5672a2` (la URL de descarga en un solo lugar), `dae1377`+`b3d7e7e` (el componente de las
dos secciones y sus cinco arreglos de revisión), `fb24d00` (las solapas en el panel del
director), `70f08f7` (la solapa del asesor).

**Los hallazgos que vale la pena dejar anotados:**

1. **El plan le pedía al asesor un dato que sus permisos no le dejan leer.** El componente
   iba a pedir el nombre del tipo de documento con una consulta anidada, y por diseño el
   asesor no ve esa lista — le habría llegado vacío. Se detectó **antes de escribir una
   línea**, en el escaneo previo al plan. Se resolvió mostrándole al asesor el nombre del
   archivo en vez del tipo.
2. **Dos fallos silenciosos en el componente**, encontrados en revisión (ronda de los cinco
   arreglos, `b3d7e7e`): si fallaban *todos* los archivos de una subida no salía ningún
   mensaje de error, y si fallaba la consulta contra la base la pantalla decía "todavía no
   tenés documentos" — informaba ausencia cuando en realidad había un fallo.
3. **El nombre del archivo al descargar no se respetaba y los PDF no se descargaban** (se
   abrían en pestaña nueva en vez de bajar): el atributo `download` del navegador se ignora
   cuando el archivo viene de otro dominio. El arreglo entró en `lib/asesor-docs/url.ts`
   (`b5672a2`), la función chiquita creada justamente para centralizar esa URL — era
   exactamente su razón de ser.
4. **Se verificó el aislamiento simulando el rol del asesor contra la base**, no confiando en
   que la pantalla esconda botones: que no puede escribir y que no ve lo de otro asesor.
   Todo dentro de transacciones revertidas (`BEGIN`/`ROLLBACK`), sin dejar nada escrito.

**Verificación (Task 7, pasos 1-2 y 4-6 — el 3 queda para Leonardo):** `npm test` → 341
tests en 31 archivos de vitest + 88 de node, todos verdes. `npx tsc --noEmit` → limpio.
`npm run build` → compila. `npm run lint` → 61 errores preexistentes repartidos por `app/`,
`components/` y `lib/`; uno de esos archivos (`app/api/ai/consultor/route.ts`) aparece
también en `git diff --name-only main..HEAD`, pero es un falso positivo — `main` avanzó de
forma independiente después de que esta rama divergiera (commit `26fe01d`, ajeno a esta
etapa) y los commits propios de esta rama nunca tocaron ese archivo
(`git diff 47e6230..HEAD -- app/api/ai/consultor/route.ts` da vacío). Ninguno de los 8
archivos que esta rama sí modificó cae en la lista del lint. Detalle completo en
`.superpowers/sdd/2026-08-26-asesores-etapa-b-documentos/task-7-report.md`.

**Queda pendiente:**
- **Etapa C (detección de plantillas y versionado)**, con plan propio — todavía no
  arrancada.
- El borrado de archivos es **por autor, no por inmobiliaria**: con dos directores en la
  misma agencia, el segundo no puede borrar los que subió el primero. Hoy no es un problema
  (una sola agencia real, un solo director) pero queda anotado para cuando deje de serlo.
- La búsqueda del tipo de documento **no escapa los comodines** (`%`, `_`) — es la **cuarta
  aparición** de ese mismo patrón en el proyecto. No se tocó porque no era parte del alcance
  de esta etapa, pero ya son cuatro lugares con el mismo defecto suelto.

**El reclamo de roomix, y el proxy de fotos que salió de ahí** (rama `feat/fotos-red-proxy`,
worktree propio `PRISMA-SYSTEM-fotos-red`; mergeada y desplegada el mismo día, `b6fd474`).
El contexto completo del asunto está en `20 Frentes/roomix.md` del vault.

**Lo que llegó:** a las 09:22 un aviso de abuse de DigitalOcean con 24 h para responder o
suspender el droplet (n8n, chatwoot, evolution-api — o sea el bot de Central), y a las 12:54
el reclamo de roomix por scraping: 20,2 M de requests y US$1.500 de daño estimado. Los dos
respondidos dentro del día. El `roomix-worker` de EasyPanel quedó apagado.

**Los números del relevamiento, que son el dato que faltaba:** `roomix_properties` tiene
369.478 filas (267.547 activas, 178.340 sin `lastmod`) contra 353 activas de cartera propia
de Central. En los 112 ACM generados hay **6.370 comparables de la red contra 303 propios**, y
**72 de esos 112 no tuvieron ningún comparable propio**. El ACM, como funciona hoy, es la base
de roomix con nuestra interfaz.

**El proxy** (`app/api/foto-red/route.ts`): hasta hoy cada foto se la pedía el NAVEGADOR del
asesor a `cdn.roomix.ai`, lo que además dejaba `Referer: https://prisma.vakdor.com/` en los
registros de ellos — una de las cosas que reclamaron. Ahora se baja una vez server-side, se
guarda en el bucket privado `red-fotos` y sale de nuestro lado.

*Las decisiones que valen, con su porqué:*

**Bajo demanda, no copiando todo.** El catálogo son 1.480.427 fotos (~212 GB) y solo hay 112
ACM. Copiarlo entero habría significado pegarle a roomix el pico de tráfico más grande de toda
la historia del asunto, el mismo día que les dijimos que parábamos.

**`cdn.roomix.ai` sale de `next.config` y del CSP, a propósito.** Es *fail closed*: si quedó
algún punto sin migrar, la foto se ve rota en vez de seguir pegándoles sin que nos enteremos.

**El endpoint recibe una URL del cliente**, así que lo único que lo separa de un SSRF abierto
es la allowlist de hosts, igual que en `fotos-descarga.ts`, más `redirect: "error"`. Probado
con un impostor `cdn.roomix.ai.evil.com`, con `http` y sin parámetro: los tres dan 400.

**Se tocó `opt()` en la ficha pública** para que `next/image` optimice también nuestras rutas
internas. Sin eso el PDF de la ficha volvía a pesar decenas de MB.

**Queda afuera:** `fotos-comparables` (el análisis con IA) sigue bajando del CDN server-side.
No deja Referer y solo corre a pedido, pero no es cero.

*Errores propios de la sesión:*

**Verifiqué con un regex equivocado y casi reporto un falso negativo.** Al chequear que los
endpoints ya no devolvieran URLs de roomix busqué `https://cdn.roomix.ai` en la respuesta y
dio 0 por el proxy y 0 directo — o sea, ninguna foto. La URL viaja **URL-encodeada** dentro
del parámetro (`%3A%2F%2F`). Un "0" en los dos lados no era éxito: era la señal de que la
verificación no estaba mirando nada. Regla: cuando una comprobación da cero en todas sus
categorías, lo primero que se duda es la comprobación.

**Y probé primero con un ACM de Central estando logueado como PRISMAIA - VAKDOR**: el 404 no
era un bug, era el scope por agencia funcionando. Para probar hace falta un ACM de la agencia
con la que uno entra.

*Gotchas del entorno:*

1. **Un worktree nuevo no tiene `node_modules` ni `.env`.** Hay que correr `npm install` y
   copiar `.env` y `.env.local` antes de poder compilar o levantar nada.
2. **`npx tsc` agarra otro binario** ("This is not the tsc command you are looking for"): va
   `./node_modules/.bin/tsc`.
3. **El clasificador de permisos bloqueó cinco acciones** en esta sesión (apagar el servicio de
   EasyPanel dos veces, un heredoc largo, y dos ediciones). Tres salieron al reintentar; el
   apagado lo terminó haciendo Leonardo. Cuando un bloqueo se repite dos veces, conviene frenar
   y pedirlo en vez de buscarle la vuelta.

---

## 2026-08-25

**Etapa A cerrada: el código de invitación ahora valida quién lo usa** (rama
`feat/asesores-celular-y-documentos`, worktree propio `PRISMA-SYSTEM-asesores-docs`; spec en
`docs/superpowers/specs/2026-08-24-asesores-celular-y-documentos-design.md`, plan en
`docs/superpowers/plans/2026-08-24-asesores-etapa-a-celular-y-email.md`). Falta el OK de
Leonardo probándolo él mismo en el navegador (Task 9 paso 3, deliberadamente no hecho acá) y
el merge a `main`.

**El agujero que había:** nadie validaba que quien usaba un código de invitación fuera la
persona invitada. El registro ni siquiera leía el nombre del invitado: le ponía al perfil el
nombre que tipeaba quien se registraba. Ahora el email del código es la llave — si no
coincide, se corta **antes de crear el usuario** y **el código no se consume**. Al generar un
código ahora se piden los tres datos (nombre, celular, email), cada uno de los dos últimos se
escribe dos veces para evitar tipeos, y a los asesores que ya estaban adentro se les puede
cargar el celular desde su tarjeta en la página Asesores.

Commits en orden: `79a7862` (reglas puras, 18 tests), `ba6321b` (migración
`20260824120000_invites_celular_y_email.sql`), `7c01429`+`798d39b`+`ccd34ca` (generar
códigos con los tres datos), `789ebcf` (diálogo único + celular verificado), `9d22664`
(tapar la puerta trasera de la página Asesores — generaba código sin pasar por las reglas),
`69a03f7`+`28e4241` (validar el email al registrarse), `ce1189b`+`eec283d` (editar
nombre/celular del asesor desde la tarjeta), `26aa1de`+`1722c21` (el asesor ve su celular en
Configuración, de solo lectura).

**Los tres errores que vale la pena no repetir:**

1. **El mismo defecto en tres archivos distintos.** Al guardar el celular del código, al
   guardar el del asesor, y al mostrarlo: las tres veces se normalizaba un teléfono que YA
   estaba en formato internacional asumiendo Argentina como país. No rompe nada acá porque
   todos los casos de prueba son de Argentina — recién se habría notado con un asesor de otro
   país, y tarde. La corrección es anteponer `+` para que `libphonenumber-js` deduzca el país
   del propio número en vez de forzarlo. Se dejó **un comentario explicando el porqué en cada
   uno de los tres lugares** (`lib/queries/director.ts`, `app/director/asesores/page.tsx`,
   `app/asesor/configuracion/page.tsx`), porque las dos primeras veces el defecto se coló
   justamente por no tener ese comentario al lado.
2. **El chequeo de email duplicado fallaba abierto.** `generateAgencyInvite` descartaba el
   error de la consulta que busca si el email ya tiene perfil en la agencia; si esa consulta
   fallaba, el alta seguía de largo en silencio — exactamente lo contrario de lo que el
   chequeo existe para evitar. Corregido para cortar con error explícito si la verificación
   no se pudo hacer.
3. **Un email ya registrado quemaba el código sin avisar.** Supabase no devuelve error al
   pedir el registro de un email que ya existe cuando la confirmación por email está activa
   (por diseño, para no filtrar qué emails existen). El flujo anterior no distinguía ese caso:
   consumía el código igual, la persona veía "revisá tu email" y no llegaba nada, y el código
   quedaba gastado sin que nadie se enterara. Ahora se verifica el estado antes de consumir.

**Verificación (Task 9, pasos 1-2, 4-6 — el 3 queda para Leonardo):** `npm test` → 310 tests
en 29 archivos de vitest + 88 de node, todos verdes. `npx tsc --noEmit` → limpio. `npm run
build` → compila. `npm run lint` → 43 errores preexistentes en archivos que esta rama no
tocó (comillas sin escapar en JSX y `prefer-const`, repartidos por `app/`, `components/` y
`lib/`); ninguno cae en los 14 archivos que sí modificó la rama. Detalle completo en
`.superpowers/sdd/2026-08-24-asesores-etapa-a-celular-y-email/task-9-report.md`.

**Queda pendiente:**
- **Etapas B (documentos por asesor) y C (plantillas y versionado)**, con plan propio —
  todavía no arrancadas.
- El bucket `contratos` de Supabase Storage **sigue público** (spec §9.3, no tocado en esta
  etapa).
- `components/tracking/pipeline/PipelineCard.tsx:93` tiene el **mismo defecto de país fijo**
  que el error 1 de arriba, en otro subsistema. Se detectó al auditar pero no se tocó: no es
  parte del alcance de Etapa A.
- `components/shared/ManualContactFields.tsx` (spec §9.2) tampoco se tocó.
- El auto-renombre del asesor (`app/asesor/configuracion/page.tsx:207` — hoy puede cambiarse
  el nombre a sí mismo) queda **como está**: es conducta preexistente, no es un problema de
  seguridad, y Leonardo la va a decidir aparte.
- Los 2 códigos de invitación viejos sin email siguen funcionando como antes, a propósito: no
  se migraron.

**El Socio acusó en falso, y el arreglo es la parte que importa** (misma jornada, sesión de
`/socio`)

Se le marcó a Leonardo como deuda el resumen para Kevin, que **ya estaba mandado**. Era la
**segunda vez** con el mismo ritual: la primera quedó anotada en la descripción de la tarea
anterior (`wdvf3a8b1u`, 21/08: *"YA ESTABA HECHO. Leonardo lo había preparado por su
cuenta"*), y nadie leyó esa nota antes de repetir el error.

*La causa:* Leonardo ejecuta los rituales que tienen a otra persona del otro lado por WhatsApp
o LinkedIn, y ClickUp no se entera. El estado del tablero **no es evidencia** de que algo no se
hizo — solo de que nadie lo cerró.

*El arreglo, en `.claude/skills/vakdor-socio/SKILL.md`:* en la fase ③ se pregunta antes de
afirmar que un ritual con un tercero está incumplido; en la fase ⑦ se repasan uno por uno y se
cierran en el momento, anotando por dónde salieron. Con el límite escrito al lado para que no
se vuelva excusa: **solo vale para lo que depende de otra persona**; lo verificable contra el
código o producción se sigue verificando. También quedó como memoria del proyecto
(`ritual-vencido-no-es-incumplido.md`).

**El guion de outbound dejó de ser una corazonada** (`20 Frentes/outbound.md` del vault, fuera
del repo). El mensaje que trajo el sí de Sergio Bermúdez es el mismo que trajo el de Damián
Ostrovsky, casi palabra por palabra; el guion que estaba escrito tiene cero respuestas. Se
reemplazó el Toque 1, el viejo quedó abajo marcado como descartado con su porqué, y se corrigió
una contradicción que el frente arrastraba: decía *"prohibido hablar de tu producto"* y lo que
funciona **sí habla del producto**. La regla real es **no pedir la reunión en el primer
mensaje**.

*Errores propios de esta sesión, que es lo que más sirve:*

**Una edición se perdió por trabajar en el worktree equivocado.** Las dos reglas del
`SKILL.md` se escribieron en `PRISMA-SYSTEM` (el principal) sin commitear, y **otra terminal
cambió de rama en ese mismo worktree** (de `feat/outbound-canal-por-grado` a
`chore/sanear-backup-n8n`): el cambio desapareció. Se detectó porque `git status` dejó de
mostrarlo como modificado. Regla que faltaba explicitar: **la sesión de `/socio` trabaja en
`PRISMA-SYSTEM-socio`**, que existe justamente para eso. Lo que vive fuera de git —el vault,
ClickUp, la memoria— sobrevivió sin un rasguño; lo único que se perdió fue lo del repo.

**No volví a mirar el reloj en cinco horas.** Se leyó la hora al abrir (14:35) y después se
razonó todo el día sobre esa hora, planificando "las dos horas que quedan" cuando ya eran las
19:37 y la jornada había terminado. Lo delató el timestamp de un log, no una verificación. La
memoria `mirar-la-hora-antes-de-decirla` ya advertía esto y **igual volvió a pasar**: leerla
una vez no alcanza, hay que releerla cada vez que se habla de tiempo o se arma un plan.

**Se escribió un bloque entero al vault sin acentos**, por miedo a los escapes del heredoc —
incluido el texto de un mensaje que Leonardo iba a copiarle a un CEO. El heredoc con
delimitador citado (`<<'EOF'`) no expande nada: los acentos pasan bien.

*Dos gotchas más de este entorno:*

1. Los scripts que usan `@composio/core` **solo corren con el cwd en
   `.claude/skills/vakdor-socio/`**: el `node_modules` vive ahí, no en la raíz del repo.
2. **`/tmp` de Git Bash no es el `/tmp` de node**: un archivo escrito en `/tmp` desde Bash,
   node lo busca en `C:	mp` y falla con ENOENT. Los temporales van al scratchpad de la
   sesión, con ruta absoluta.

---

## 2026-08-24

**El radar de mercado existe: `/socio-mercado`** (rama `feat/socio-radar-mercado`).
`/socio-mercado` estaba nombrado en el SKILL.md del Socio como ritual del lunes y **no
existía**. Ahora es `.claude/commands/socio-mercado.md`: sin scripts — el Socio investiga
con búsqueda web en vivo, filtra contra el código (regla 2) y escribe con OK. Dos salidas:
candidatos de funciones → frente producto; informe extenso → `30 Mercado/` del vault, con
tabla de datos citables y 3-5 ángulos de contenido para marketing (pedido de Leonardo en la
primera corrida: el informe es materia prima de posts, no solo contexto). Cadencia día por
medio; la apertura de `/socio` avisa si pasaron 2+ días mirando la fecha del último informe.
La primera corrida real quedó en `30 Mercado/2026-08-24 informe.md`.

*Error entre worktrees que costó una entrada:* la sesión de fotos commiteó esta bitácora
desde otro worktree y **pisó la entrada del 22/08**, que se reinsertó acá. Antes de
commitear la bitácora: `git show main:docs/interno/bitacora-sesiones.md` y verificar que
no falte ningún día.

**La solapa "Fotos": las fotos de una propiedad se arreglan solas**

Rama `feat/marketing-fotos-ia`, mergeada. Motor en `lib/marketing-ia/fotos-ia.ts` y
`fotos-marcado.ts`; tabla nueva `property_photos` (migración `20260824160000`).

Se analizaron 5 repos de GitHub que Leonardo pasó. **Tres no tenían código** (solo README de
SEO) y el cuarto es un paper académico que pide fotografía HDR panorámica y render 3D. Los
dos de SamurAIGPT son el mismo boilerplate y su "IA" son 50 líneas llamando a MuAPI, que
revende Nano Banana — o sea, `gemini-3-pro-image`, el mismo modelo que PRISMA ya usaba. Lo
único que valía la pena eran los prompts.

*Lo que costó descubrir, cada cosa con su prueba fallida:*

**Hay dos familias de edición.** Local (sacar un objeto) permite pegar solo la zona editada
sobre la original: el resto queda intacto, medido 0,71 contra 8,37. Global (cielo, luz,
staging) NO: pegar solo el cielo deja una línea horizontal con los árboles partidos al medio.

**Para marcar una zona va UNA sola imagen, la marcada.** Mandarle la original junto con la
marcada, explicando cuál es cuál, es lo que uno haría — y falla: no edita nada y encima mueve
el resto.

**Las marcas van por color, nunca numeradas.** El modelo copia a la imagen cualquier texto
que ve dibujado: al pasarle el inventario numerado, **pintó los números sobre la foto**. Y el
control la aprobó igual, porque solo miraba el inventario. De ahí salió la regla de salida
limpia, que además bajó los reintentos de 3 a 1.

**Sin `imageConfig: { imageSize: "2K" }` devuelve 1365x768**, más chica que la original.

**Los tres modos van en secuencia.** Pedir las tres cosas juntas hace que el modelo
reinterprete el ambiente: inventó un arco, cambió el granito por otro piso y movió las
paredes. De a uno, edita. Y **mejorar va primero**: el inventario se lee de la foto, y sobre
una oscura da 6 elementos en vez de 8 y confunde granito con madera. Mejorar es el único modo
que no mueve nada, así que puede ir antes de relevar.

*Cómo se sostiene la fidelidad:* antes de tocar nada se releva geometría, piso (material,
tamaño de pieza, dirección de juntas, veteado), inventario de lo que es del inmueble, y los
defectos. Todo eso entra como regla dura — **nada hardcodeado, sale de cada foto**. Un
control automático compara antes y después y rechaza si falta algo grave, si se inventó un
artefacto, si cambió el piso o si se tapó un defecto; entonces se corrige y se regenera solo.
El asesor nunca ve un rechazo.

*Los límites que quedan:* el control verifica que los elementos estén, **no que las
proporciones se respeten** — aprobó el ambiente reconstruido del "todo junto", y esa decisión
la resolvió el ojo. Y sobre ambientes ya amoblados, lo que los muebles del dueño tapaban la
IA lo inventa: apareció un radiador donde estaba apoyada una funda de guitarra.

*Decisiones de Leonardo:* la solapa va también para asesores, que son los que más la usan
(cuesta 3 créditos por paso, de su propia bolsa, y ahora se avisa antes de apretar). La
galería agrupa por `sesion_id`: una tarjeta por foto, que se abre en carrusel con la original
de la ficha primero.

Costo de todo el trabajo: unos US$5 en 42 generaciones. Cada foto sale US$0,134 y tarda entre
45 y 90 segundos.

---

## 2026-08-22

**Sábado corto: V4 del super agente, la receta del mejorador de fotos, y un error propio
del Socio con ClickUp**

Leonardo (en otras terminales): el plan del super agente llegó a
`docs/superpowers/plans/2026-08-22-super-agente-v4.md` (12:59, con V3 intermedio), y el
mejorador de imágenes (home staging + quitar elementos, compromiso con Kevin que vence la
semana del 24-28) tiene su receta técnica en 6 scripts de `scratch/` (`_receta-editar-foto`,
`_pipeline-fotos`, `_detectar-textos`, `_probar-optimo`, `_correr-casos`, `_reversion`).
UI en la página de marketing: todavía no. *(La sesión del 24 de fotos convirtió esto en la
solapa "Fotos" — ver la entrada de arriba.)*

*El error de método propio, para no repetir:* **las tareas de ritual semanal existen como
varias instancias pre-creadas con el mismo nombre** (22/08, 29/08, 5/09). Un
`find(t => /nombre/.test(...))` sobre la lista agarró las del 5/09 y el Socio "movió" esas
creyendo mover las de hoy; el recolector después mostró las de hoy sin tocar y pareció un
bug del recolector — **el recolector estaba bien**. Regla: una tarea se mueve por **id**, y
la instancia se elige mirando el `due_date`, nunca solo el nombre.

Dos gotchas más de la API de ClickUp confirmados hoy: (1) `FIELD_033` también pega en la
lista Tareas vía el endpoint `/task/:id/field/:fid` — *Veces postergada* y *Postergada
desde* no se pueden escribir con el plan actual; el registro va en la descripción. (2) Si la
tarea tiene `start_date` posterior al nuevo `due_date`, el PUT falla con `ITEM_238`: hay que
setear los dos juntos.

*Y un aviso para el que trabaje con varios worktrees:* esta entrada se perdió una vez porque
la sesión de fotos commiteó la bitácora desde otro worktree sin tener esta versión. Antes de
commitear la bitácora, mirar `git show main:docs/interno/bitacora-sesiones.md` y verificar
que no falte la entrada de otro día.

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
