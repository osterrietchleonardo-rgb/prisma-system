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

## 2026-09-02

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
