# Buscador IA: conversación viva (punto 1 del plan de agentes)

**Fecha:** 2026-09-02 · **Rama:** `feat/buscador-conversacion-viva` (desde main `fafbb9d`)
**OK de Leonardo:** "ok en esto… avanza con esto cuidadosamente". El diagnóstico y el plan
completo (3 puntos) están en la conversación del 2/9; este plan cubre SOLO el punto 1:
**streaming + pasos de pensamiento visibles + prompt nuevo**, sin tocar la arquitectura de
búsqueda. Los puntos 2 (bucle con herramientas para el Buscador, con el esqueleto del Super
Agente) y 3 (ídem Tutor) quedan para después, igual que los horarios de notificación que pidió
Kevin (nada de avisos de madrugada — HOY la escalera avisa a cualquier hora: primer aviso del
1/9 salió 02:30 AM).

## Por qué suenan robóticos (verificado en el código el 2/9)

- `app/api/ai/consultor/route.ts` (el Buscador): tubería de una pasada (intención → SQL →
  redacción), SIN streaming — el usuario mira una ruedita muda ~10 s y recibe un bloque.
  El prompt ya pide calidez pero remata con una coletilla fija ("Siempre ofrecé refinar al
  final") que hace que toda respuesta termine igual.
- `app/api/ai/tutor/route.ts`: el tono formal está PEDIDO en el prompt ("formal…sin
  coloquialismos"); tampoco streamea.
- Los dos front (`app/asesor/consultor-ia/page.tsx` y `app/director/consultor/page.tsx`,
  duplicados) hacen `fetch` + `await res.json()`.

## Tasks

### Task 1 — `lib/openai.ts`: `generateContentStream`
Mismo contrato que `generateContent` + callback `onDelta(texto)`; devuelve `{text, usageMetadata}`
al final (el usage llega con `stream_options: { include_usage: true }`).

### Task 2 — El route del Buscador streamea
- Extraer el cuerpo del POST a `procesarBusqueda(entrada, emitir)`: devuelve el payload
  (era el único `NextResponse.json` de éxito); el POST decide:
  - sin `stream: true` en el body → **JSON idéntico al de hoy** (compatibilidad total);
  - con `stream: true` → `Response` NDJSON (`application/x-ndjson`), eventos:
    `{tipo:'paso', texto}` (≤6 hitos del pipeline: leyendo → buscando en cartera/agencia/red →
    red de colaboración → aflojando filtros (si pasa) → armando la respuesta),
    `{tipo:'delta', texto}` (los tokens del modelo), `{tipo:'final', …payload de hoy}` y
    `{tipo:'error', error}`.
- Los pasos se emiten donde ya está `marcar(etapa)` — el cronómetro sigue intacto.

### Task 3 — El prompt del Buscador, tono vivo
- Personalidad: rioplatense cálido de verdad; **variar aperturas y cierres** (la coletilla fija
  pasa a "cuando sume, proponé un próximo paso, con palabras distintas cada vez"); reaccionar a
  lo que el usuario dijo antes de informar. Las REGLAS ANTI-ERROR se conservan TODAS
  (codifican fallas reales aprendidas), solo se agrupan al final.

### Task 4 — Los dos front consumen el stream
- Helper compartido `lib/buscador-stream.ts` (cliente): lee el NDJSON y despacha callbacks.
- En cada página: el mensaje del asistente aparece vacío con la **línea de pasos** animada
  ("Buscando en tu cartera y en la red…"), el texto se escribe en vivo (deltas), y el evento
  final cuelga las tarjetas (`matchedProperties`) como hoy. Si el stream falla, cae al camino
  JSON de siempre (fallback).

### Task 5 — El Tutor, mismo tratamiento mínimo
- Streaming del route (misma técnica, es mucho más chico) + prompt nuevo (cálido, voseo real,
  sin formalidad impuesta; conserva las reglas de no inventar y de citar fuentes).
- El front del tutor: mismo helper.

### Task 6 — Probar de verdad
- Local: dev server, cuenta director PRISMAIA, una búsqueda real con zona + una charla casual;
  ver los pasos, el tipeo en vivo, las tarjetas, y el fallback (forzar `stream:false`).
  Escritorio + celular (390×844). `state-save` tras el login (gotcha del dev local).
- Tests + tsc + build; OK de Leonardo; PR a main; docs (TECNICO/LOGICA breve) + bitácora.

## Agregados de Leonardo durante la construcción (2/9)

- **Markdown renderizado** (HECHO en esta rama): los agentes escriben markdown y el chat lo
  mostraba crudo (numerales, asteriscos) o directamente se los borraba (`replace(/\*\*/g,"")`
  en las 4 páginas). Nuevo `components/shared/MarkdownIA.tsx` (react-markdown + remark-gfm,
  estilos medidos para burbuja de chat); los mensajes del asistente pasan por ahí en los 4
  chats; los del usuario quedan planos.
- **Herramienta de PDF/reporte descargable** (PARA EL PUNTO 2): que el Buscador pueda armar
  un PDF con propiedades elegidas y el Tutor uno con la info consultada, descargables. Encaja
  exactamente en el bucle con herramientas; referencia local: skill Vakdor-PDF.

## Qué NO entra acá
Bucle con herramientas (punto 2 — ahora incluye la herramienta de PDF), memoria como
proyección del diario, tocar la lógica de búsqueda/SQL, el modelo (sigue gpt-5.4-mini), y los
horarios de notificación de Kevin.
