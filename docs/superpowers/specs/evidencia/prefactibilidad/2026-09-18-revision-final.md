# Prefactibilidad — revisión final de la rama `feat/prefactibilidad`

Rango revisado: `26ba790..06e6128` (46 commits, 110 archivos). Se revisó además `bd28ebf`
(un commit más allá del rango, solo docs: bitácora + guías funcionales) para verificar el
cierre documental del plan.

Método: lectura completa de los 5 route handlers, las 2 migraciones + rollbacks, los 14
módulos de `lib/prefactibilidad/`, los 3 scripts de carga + el de validación, los 6
componentes de UI + la ficha pública, `middleware.ts`, `lib/auth/tenant-validation.ts`, los
15 archivos de test y la evidencia de las 20 parcelas. Sin mutar el árbol.

## Strengths

- **La frontera de confianza está bien puesta.** `POST /api/prefactibilidad` recibe solo
  `{smp, direccion}` y vuelve a calcular con `analizarParcela` antes de insertar
  (`route.ts:33-41`); el test `route.test.ts:46` manda `m2Construibles: 999999` en el body y
  comprueba que no se guarda nada. Es lo que se firma con la marca de la agencia y se manda
  al dueño del lote por link: acá era donde había que blindar.
- **Aislamiento por agencia consistente.** Los 5 handlers llaman `requireTenant()` primero;
  todas las consultas con el cliente admin filtran por `agency_id` y, si el rol no es
  `director`, también por `user_id` (`[id]/route.ts:11-12`, `[id]/compartir/route.ts:18-19`,
  `route.ts:16-17`).
- **Sin SSRF.** Los únicos hosts que toca el servidor son literales (`USIG`, `EPOK`,
  `URL_TESELAS`) y todo lo variable pasa por `encodeURIComponent` o por aritmética de teselas
  (`gcba.ts:62-90`, `teselas.ts:16-34`). No hay ningún punto donde el host o un segmento de
  path venga del usuario.
- **SVG no inyectable, y con test que lo demuestra.** `plano-svg.ts:10-12` valida los colores
  contra `/^#[0-9a-fA-F]{3,8}$/` y `plano-svg.test.ts:38` prueba con
  `colorLote: 'red" onload="x'` que el atributo no sale. El `<style>` es una constante
  estática del módulo.
- **La ficha pública está bien cerrada:** solo por token con el cliente admin, `notFound()` si
  no matchea, `robots: { index:false, follow:false }`, `force-dynamic`, y `middleware.ts` solo
  protege `/director` y `/asesor`, así que la ruta pública funciona sin filtrar nada.
- **Tests con dato real, no con mocks de sí mismos.** Las teselas `.pbf` y las geometrías de
  epok están congeladas como fixtures; `envolvente.test.ts` fija 261 ± 5 m² contra el número
  medido de la capa oficial. La evidencia de 20 parcelas cierra 0 fallas / 0 sin dato con el
  oráculo correcto (capa GCBA 2021, TodoProps informativo) según la adenda del 18-sep.
- **Los mensajes exactos de las Global Constraints están los cuatro**, textuales, y con test
  en `analizar/route.test.ts:55`.

## Issues

### Critical (Must Fix)

Ninguno. No encontré ninguna vía de fuga de datos entre agencias, de enumeración de la ficha
pública, de escritura por parte del cliente ni de inyección.

### Important (Should Fix before merge)

**1. `unidades` incluye unidades que no aportan ni un m², y la ficha las describe igual.**
`lib/prefactibilidad/envolvente.ts:39` arma `unidades` con `new Set` sobre TODOS los volúmenes,
pero el bucle hace `if (!cuerpo) continue` (línea 54). Una unidad que en esa parcela solo tiene
basamento o un retiro queda listada sin plantas. La UI y la ficha pública recorren ese array
(`ficha-lote.tsx:46`, `[token]/page.tsx:68`) y le dicen al dueño del lote "Corredor alto:
planta baja y 12 pisos (hasta 38 m…)" por una unidad que no está aportando nada al total.
*Por qué importa:* es un documento que se manda al cliente con la marca de la agencia.
*Arreglo:* construir `unidades` a partir de las plantas efectivamente generadas — declarar
`const unidadesConPlantas = new Set<Unidad>()`, agregarla dentro del bucle después del
`if (!cuerpo) continue`, y devolver `Array.from(unidadesConPlantas)`.

**2. Cuando no se pudo calcular nada, la ficha muestra "0 m² a 0 m²" en vez de "sin dato".**
`lib/prefactibilidad/analizar.ts:53-55`: si no hay envolvente oficial Y la regla tampoco pudo
correr (sin fila de CUR, o sin geometría de manzana), se arma un objeto con
`rango: { piso: 0, techo: 0 }`. Como `e.rango` es truthy, `ficha-lote.tsx:59-60` y
`[token]/page.tsx:71` imprimen `0 m² a 0 m²` en lugar de la rama "sin dato" que ya está escrita
al lado. Es alcanzable: cualquier parcela sin fila en `gcba_parcelas_cur`.
*Arreglo:* no poner `rango` en ese objeto degradado (dejarlo `undefined`), o, si se prefiere
explícito, `rango: null` y ajustar el tipo. Los dos consumidores ya manejan el caso.

**3. El test del basamento no probaría nada si el basamento se rompiera.**
`lib/prefactibilidad/envolvente.test.ts:44` asserta `expect(b.m2PorNivel).toBeGreaterThanOrEqual(0)`:
pasa con 0, con 4 y con 40.000. Y `envolvente.test.ts:28-31` recalcula el esperado con la misma
fórmula del código (`plantas.reduce(...)`), así que no puede fallar nunca. El propio ledger
(Task 4) dejó anotado "para la revisión final: fijar el basamento de Cabildo con tolerancia".
*Arreglo:* fijar los dos basamentos de Cabildo 2040 (~495 y ~402 m² según la evidencia de la
Task 18) con `toBeCloseTo(495, -1)` y, para los totales, escribir el número esperado a mano
(`2 × basamento + 11 × cuerpo`) en vez de derivarlo del resultado.

**4. El error de la RPC de terrenos se traga y se convierte en "sin comparables suficientes".**
`lib/prefactibilidad/dependencias-supabase.ts:22`: `if (error || !data) return []`. Si la RPC
falla (permisos, timeout de statement, `mercado_avisos` en mantenimiento), el asesor lee "Sin
comparables suficientes: hacen falta al menos 5 terrenos…", que es una afirmación de negocio
falsa, y no queda rastro en ningún log. En la misma rama, y por Ruling de la Task 14a, el error
del upsert de la caché SÍ se loguea (línea 35): esto es la misma clase de problema sin el mismo
tratamiento.
*Arreglo:* `if (error) console.error("Prefactibilidad: falló prefactibilidad_terrenos_cerca", lat, lng, error.message);`
antes del `return []`.

### Minor (Nice to Have)

1. **`increment_prefactibilidad_view` queda ejecutable por cualquiera.**
   `supabase/migrations/20260918100100_prefactibilidades.sql:36-39` la crea `security definer`
   y no la revoca de `public, anon, authenticated` — a diferencia de
   `prefactibilidad_terrenos_cerca`, que sí se revoca dos líneas más abajo. En Postgres el
   `EXECUTE` por defecto es para `PUBLIC`, así que un anónimo puede llamarla por PostgREST con
   tokens al azar y escribir en la tabla (solo el contador; no devuelve nada, ni siquiera sirve
   como oráculo de existencia de token). **Es la convención ya existente del repo**: las cuatro
   `increment_shared_*_view` (shared_properties, shared_acm_reports, shared_selections,
   documentos) tampoco están revocadas. No lo trataría como bloqueante de esta rama, pero vale
   una línea `revoke execute … from public, anon; grant execute … to service_role;` acá y una
   pasada por las otras cuatro en otro momento.
2. **La regex que saca tildes está escrita con caracteres combinantes crudos.**
   `lib/prefactibilidad/normalizar-calle.ts:11` contiene literalmente los bytes U+0300 y U+036F
   dentro del `[...]`. Funciona hoy, pero es invisible en el editor y cualquier reencodeo o
   normalización del archivo la rompería en silencio (las calles con tilde dejarían de resolver).
   Escribirla `/[̀-ͯ]/g`.
3. **Respuesta vieja del autocompletar.** `buscador-direccion.tsx:33-46`: el `abort()` del
   pedido anterior recién ocurre cuando dispara el timer nuevo (250 ms después de la última
   tecla), para cuando el pedido viejo normalmente ya resolvió; y el resultado se aplica sin
   comprobar que `q` siga siendo la consulta que se buscó, ni se aborta al desmontar. Se
   autocorrige con el pedido siguiente, pero puede mostrar sugerencias de un texto que ya no
   está, o reabrir el desplegable después de elegir. Guardar el `q` de la consulta y descartar
   la respuesta si cambió; abortar en el cleanup del efecto.
4. **Doble clic en Guardar / Compartir.** `prefactibilidad-module.tsx:36-50`: `guardar()` no
   tiene guardia de vuelo (el `disabled` depende de `idGuardada`, que llega tarde) y
   `compartir()` tampoco; dos clics rápidos crean dos filas, o dos `genToken()` donde el
   segundo pisa al primero y deja muerto un link ya copiado. El ledger lo anotó como
   preexistente en el ACM. Un `useRef` de "en vuelo" lo cierra.
5. **El rango por regla puede salir invertido en unidades sin retirados.**
   `lfi-regla.ts:127-129`: `piso` se mide con la banda mínima de 16 m y `techo` con la banda del
   ¼. En USAB0/1/2 (`retirados: 0`) `techo = m2Cuerpo × pisosCuerpo` sin ningún extra, así que
   si el ¼ de la manzana da menos de 16 m de profundidad (posible con la semisuma justo en el
   límite de 62 m) y el lote es más profundo que eso, sale "1.000 m² a 900 m²". Con retirados
   el ×1,6 lo tapa. Un `Math.max(piso, techo)` al armar el rango, o medir el piso con
   `min(16, d)`, lo cierra.
6. **El basamento se asume siempre de 2 niveles.** `envolvente.ts:56-57` hace
   `pisosCuerpo - 2` y `niveles: 2` sin mirar `bas.desde`/`bas.hasta`, que están disponibles.
   Si alguna parcela trae un basamento de otra altura, el conteo se corre.
7. **`anillosDe` descarta agujeros** (`geo.ts:37`): además de dibujar macizos los lotes con
   patio interior (ya anotado en el ledger), hace que `medirM2` los mida de más, y en un
   MultiPolygon solo toma el anillo exterior de cada pieza. Para v1 en CABA es aceptable;
   convendría dejarlo dicho en el comentario de la función, que hoy no lo advierte.
8. **Constante del Código a mano fuera de `codigo.ts`.** `ficha-lote.tsx:60` usa `* 0.8`
   literal en vez de `FACTOR_VENDIBLE`. Va contra la Global Constraint "ninguna constante del
   Código a mano fuera de `lib/prefactibilidad/codigo.ts`". Una línea.
9. **Accesibilidad del desplegable.** `buscador-direccion.tsx:61-69`: `role="listbox"` sin
   `role="option"` en los ítems, sin `aria-expanded`/`aria-activedescendant` en el input y sin
   navegación con flechas. Los objetivos táctiles sí cumplen los 44 px (`min-h-11`).
10. **Desviación menor no registrada como Ruling:** la spec dice que "recalcular" se muestra si
    `publicado` es posterior al `creado_en` de la prefactibilidad; la implementación compara el
    `curPublicado` congelado en el snapshot contra el máximo actual
    (`mis-prefactibilidades.tsx:11` + `route.ts:16,21`). Es mejor que lo escrito (compara dato
    con dato, no dato con fecha de guardado), pero conviene anotarlo.
11. **El SVG no dibuja la L.F.I.** que menciona el punto 1 de "La ficha pública" de la spec
    (dibuja manzana, lote y huella). Informativo.
12. **`order("publicado", desc).limit(1)` sin índice** sobre 318 k filas en cada carga de la
    lista (`route.ts:21`). Un índice de una columna lo vuelve instantáneo.
13. **Sesgo de módulo en el token** (`compartir/route.ts:11`, `b % 62`): irrelevante en la
    práctica (≈71 bits de entropía), igual que el del ACM del que está copiado.
14. **El swap de `gcba_puertas` no es atómico** (`cargar-puertas.mjs:38-39`: inserta todo el
    lote nuevo y después borra lo viejo). Es la opción correcta frente a la ventana vacía, y
    durante el solape las filas duplicadas las colapsa el `new Map(...)` por `smp` del handler.
    Si el DELETE falla quedan los dos lotes hasta la corrida siguiente, que limpia. Aceptable.
15. **Código muerto:** `cargar-codigo-urbanistico.mjs:19` pide un conteo (`const n = …`) que
    nunca usa.

## Deferred items from the ledger — verdicto por línea

| # | Ítem del ledger | Verdicto |
|---|---|---|
| 1 | Task 1 — `@types/geojson` solo transitivo | **Dejar.** Llega por `@types/leaflet`/turf y compila; fijarlo es cosmético. |
| 2 | Task 2 — sin test de segmento degenerado ni anillo abierto; `bboxDe` recorre agujeros | **Dejar.** `distanciaASegmento` ya maneja `l2 === 0`; `bboxDe` con agujeros da el mismo bbox. |
| 3 | Task 3 — `allowImportingTsExtensions` duplicado en `tsconfig.json` | **Dejar.** Preexistente de main, fuera del alcance de la rama. |
| 4 | Task 4 — `unidades` sin cuerpo; test del basamento solo `>= 0`; totales tautológico | **ARREGLAR AHORA.** Son los Important 1 y 3; el propio ledger lo dejó agendado para esta revisión. |
| 5 | Task 5 — `ladosEnMetros` recalculado; epsilon de 1 m² sin nombre | **Dejar.** Manzanas de ≤ 8 vértices, el costo es nulo; nombrar el epsilon si se toca el archivo. |
| 6 | Tasks 6+7+8 — `startsWith("U")`; `percentil([])` = NaN | **Dejar.** El falso positivo de `"U"` agrega un aviso fuerte de más (conservador, nunca de menos), y `percentil` solo se llama después del gate de 5. |
| 7 | Task 9 — sin GiST en `geom_manzana`; SQL sin newline final; título del 3er `it` | **Ya resuelto / dejar.** El GiST quedó sin sentido con el Ruling que pasó las columnas a `jsonb`; lo demás es cosmético. |
| 8 | Task 10 — `plano_l "0"` → null; `n` sin usar; `COLUMNAS` sin `dist_2_*`; `recursoCkan` toma el primer match | **Dejar.** Borrar el `n` si se toca el archivo (Minor 15). |
| 9 | Task 11 — `json()` solo reconoce `"{}"` literal como vacío | **Dejar.** Cualquier otro cuerpo raro cae en el `catch` → `GcbaNoResponde`, que es el camino correcto. |
| 10 | Task 12 — rama singular de `describirPlanta` y default de `ahora` sin test | **Dejar.** Texto y reloj. |
| 11 | Task 13 — `anillosDe` descarta agujeros | **Dejar en v1**, con el matiz del Minor 7: no es solo un tema de dibujo, también mide de más. Dejarlo escrito en el comentario. |
| 12 | Task 14 — sin índice en `publicado`; `direcciones` sin `maxDuration`; carrera de dos compartir | **Dejar** (Minores 12, 4). El índice es barato y lo pondría en la próxima pasada. |
| 13 | Tasks 15+16 — listbox sin `role="option"`; `catch (e: any)`; fetch sin abortar al desmontar; comentario del menú con fecha 18/9 | **Dejar** (Minores 3 y 9). La fecha del menú es correcta: el merge es del 18/9. |
| 14 | Task 17 — `readableOn(accent)` en el botón de imprimir | **Ya resuelto.** Verificado en `[token]/page.tsx:82`. |
| 15 | Task 18 — fila "sin lote" muestra "—"; regex de TodoProps; `tsx` con caret | **Dejar.** Es un script de evidencia, no código de producción, y TodoProps ya no es oráculo. |
| 16 | Aviso de seguridad — SSRF en `app/api/acm/comparable-link/route.ts` | **Fuera de alcance, ya informado.** Viene de main; esta rama no lo toca. Sigue abierto como hallazgo aparte. |
| 17 | Sin test automatizado de la máquina de estados del buscador | **Dejar, pero es el hueco que cerraría primero.** Los dos últimos commits (`4eadb48`, `b8949d3`) arreglaron a mano justamente esa máquina de estados y ninguno trajo test; el Minor 3 sigue vivo ahí. No bloquea el merge porque se verificó en el navegador retrasando la respuesta 3 s, pero la próxima regresión en ese componente no la va a agarrar nadie. |

### Sobre los dos últimos commits (4eadb48 y b8949d3)

Están completos para lo que decían arreglar: `abrir()` tiene su propio `abriendo`, el input se
deshabilita con `cargando || abriendo` (`prefactibilidad-module.tsx:20,54,61,70`) y la lista
solo se renderiza con `abierto && !deshabilitado` (`buscador-direccion.tsx:60`), así que ya no
hay clic posible sobre una sugerencia vieja durante una carga. La carrera que queda abierta es
otra, más chica: la del Minor 3 (respuesta vieja del autocompletar aplicada sin comprobar `q`).

## Plan alignment

- Las 4 frases exactas de las Global Constraints están textuales
  (`gcba.ts:16`, `analizar.ts:12`, `analizar/route.ts:30`, `direcciones/route.ts` +
  `buscador-direccion.tsx:41`, `tierra`/`ficha-lote.tsx:85`), y la LEYENDA vive en un solo
  lugar (`criollo.ts:10`) y se usa en las dos fichas.
- `requireTenant()` en los 5 handlers; `catch` con `e.message === "Unauthorized" ? 401 : 500`
  en los 5; UA y `AbortSignal.timeout(8000)` en el único lugar que sale a la red
  (`gcba.ts:35`); `FACTOR_VENDIBLE = 0.8` y el mínimo de 5 comparables a 800 m, cumplidos.
- Migraciones en `begin; … commit;` con rollback, y con test de texto que lo verifica.
- `smp.slice(0, smp.lastIndexOf("-"))` aplicado en los dos lugares que lo necesitaban
  (`analizar.ts:32`, `bajar-fixtures.mjs:43`), conforme al Ruling de la Task 3.
- Docs: cerradas en `bd28ebf` (bitácora + `FUNCIONAL-ASESOR` + `FUNCIONAL-DIRECTOR`), un
  commit más allá del rango que se me pasó a revisar.
- Única desviación de spec sin `Ruling:` que encontré: el criterio de "recalcular" (Minor 10).
- Única constante del Código fuera de `codigo.ts`: el `* 0.8` de `ficha-lote.tsx:60` (Minor 8).

## Assessment

**¿Lista para mergear? Con arreglos.** La parte que más importa —seguridad y aislamiento por
agencia— está bien hecha y bien probada, y no encontré nada Critical: la decisión de que el
servidor recalcule desde `{smp, direccion}` en vez de confiar en el snapshot del navegador es
la correcta y está cubierta por un test que intenta forjar los números. Los cuatro Important
son locales y baratos (dos de ellos, además, cambian lo que ve el dueño del lote en un
documento con la marca de la agencia: una unidad descrita que no aporta m² y un "0 m² a 0 m²"
donde debería decir "sin dato"); con esos cuatro adentro, la rama entra a `main` sin reservas.
