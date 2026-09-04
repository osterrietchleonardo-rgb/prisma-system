# Las notas internas hablan con Sofía — diseño

**Fecha:** 2026-09-04 · **Disparador:** queja de Eric Zambrana (Central, 3/9 22:00,
`system_feedback` `dee8cc57`) · **Decisión de Leonardo:** la interpretación NO es
determinista — la nota la lee la IA; solo la *detección* es por query.

## El problema, con el caso real

Nicolás Bellia consultó el 3/9 16:59 por Argenprop. Eric lo atendió **por teléfono**,
apagó el bot (18:19) y dejó la nota interna (18:20): *"Ya estamos en contacto con el
cliente, se coordinó una visita para el Viernes"*. La escalera de "lead esperando a un
humano" no lee notas: disparó nivel 2h (19:30, a Eric), nivel 5h (22:31, a Eric y
Kevin) y nivel 10h (4/9 10:31, a Eric). El nivel 20 se cortó a mano el 4/9
(`lead_eventos` id 1878).

Además, esa misma mañana los asesores de Central dejaron 8+ notas ("No tomar
seguimiento…", "ya fue contactada telefónicamente") — adoptaron la nota interna como
canal para hablarle a Sofía. Hoy ese canal es sordo en los dos sistemas (escalera y
agente de decisiones).

## Las tres reglas del diseño

1. **Detección determinista, decisión de IA.** Un query barato detecta si el caso tiene
   una nota interna del asesor posterior al último mensaje del cliente (excluyendo el
   marcador automático "⚠️ Handoff activado", que comparte `role='internal'`). Si la
   hay, la IA lee nota + conversación y decide. Sin nota, escalera clásica: no hay nada
   que interpretar. La IA solo corre cuando un asesor escribió algo (puñado de casos/día).

2. **La nota no es solo un freno: dispara UN aviso de registro.** Si la IA concluye que
   el asesor ya está encima del cliente (`atendido`), la escalera se frena para ese caso
   y — si aplica — sale **un único aviso** al asesor que combina todo (regla acordada:
   jamás varios mensajes por una nota, y el tono es "el sistema te vio y te ayuda",
   nunca un reto):
   - **Registro del chat**: la gestión fue por teléfono/presencial → "perfecto que lo
     contactaste; dejá el registro en el chat de PRISMA para que la trazabilidad no se corte".
   - **Registro de la visita**: la nota menciona una visita y NO está registrada
     (`wa_conversations.visit_scheduled_at` vacío y sin fila futura en `scheduled_visits`
     para ese teléfono) → "cargala en el calendario de PRISMA".
   - **Registro en el tracking** (agregado de Leonardo, 4/9): se juntan las actividades
     del lead en `performance_logs` (por celular, vía `wa_contacts.id` → `wa_contact_id`;
     últimos 14 días, con tipo/fecha/propiedad_ref) y la IA juzga si la gestión de la
     nota está reflejada ahí, mirando también la propiedad consultada
     (`metricas.propiedad_interes`). Si no → "registrá la actividad en el tracking".
     El match propiedad↔actividad es texto libre de los dos lados: por eso lo juzga la
     IA, no un `ilike`.
   - En el caso real de Nicolás, los tres pedidos habrían salido (verificado: la visita
     del 4/9 15:00 no existe en PRISMA y no hay actividad de tracking para su celular).

3. **El agente de decisiones también la lee.** La última nota interna va EN LA SEMILLA
   (como el aviso de handoff) y el prompt le explica que los renglones `[internal]` son
   la voz del asesor y mandan sobre su criterio: "no dar seguimiento" ⇒ no contactar;
   visita ya coordinada ⇒ no recontactar; un recordatorio suelto ⇒ contexto, no orden.

## Decisiones de implementación

- **Una evaluación por nota**: se registra `lead_eventos` tipo `nota_evaluada` con
  `datos.nota_id`; la barrida siguiente la encuentra y no re-llama a la IA ni repite el
  aviso. Una nota NUEVA del asesor re-evalúa.
- **Veredicto estructurado** (`atendido`, `pedir_registro_chat`, `pedir_registro_visita`,
  `pedir_registro_actividad`, `razon`), una sola llamada a Claude con tool forzado, sin
  loop y sin thinking. Zod valida.
- **Si la IA falla, la escalera sigue como hoy** (con evento `nota_error`): un aviso de
  más molesta; un lead perdido es peor. Degradación registrada, nunca silenciosa.
- **WhatsApp del aviso de registro**: se define la plantilla `asesor_registro_pendiente`
  en el tipo, pero NO existe aprobada en Meta ⇒ `enviarAviso` la omite solo
  (`omitido_plantilla_no_aprobada`) y sale el email. Crear/aprobar la plantilla en Meta
  queda para la fase de notificaciones (dicho por Leonardo el 4/9).
- **Actividades de tracking**: la fuente es `performance_logs` (tipos reales hoy:
  prospeccion, prelisting, captacion, reserva, prebuying, cierre). El puente al celular
  es `wa_contacts` (agency_id + phone) → `performance_logs.wa_contact_id`. Sin
  `wa_contact_id` que matchee, para la IA "no hay actividades registradas".
- **En sombra** (`modo != activo`) se registra el aviso simulado, no se manda nada —
  mismo contrato que el resto del sistema. Central está en activo: esto sale vivo, por
  eso el veredicto real se prueba en seco contra la nota real de Eric antes del merge.

## Qué NO cambia

- La escalera sin nota: niveles 2/5/10/20 en horas hábiles, idéntica.
- El camino del cliente (plantillas de seguimiento, guardrails, ejecutor).
- El corte manual del caso Nicolás ya está en producción (evento 1878) y esta feature lo
  vuelve innecesario para los próximos casos.
