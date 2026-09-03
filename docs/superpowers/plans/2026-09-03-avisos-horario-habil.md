# Avisos al equipo: nada de madrugada, y la noche no cuenta

**Fecha:** 2026-09-03 · **Rama:** `feat/avisos-horario-habil` (desde main `b3efc1b`)
**Pedido de Kevin (via Leonardo, 2-3/9):** "las notificaciones no tienen que ser a la
madrugada, ni a él ni al asesor, tanto las plantillas como los emails". Y el matiz clave de
Leonardo: "si un lead manda a las 3am, el asesor recién va a ver a las 9am… si está durmiendo
no es que no quiera contestar" — o sea, no alcanza con demorar el envío: **las horas dormido
no pueden contar en contra del asesor**.

## Estado real verificado (3/9)

- Los mensajes AL CLIENTE ya respetan 6-23 AR: `lib/whatsapp/sending-window.ts`
  (`dentroDeVentanaEnvio`) gobierna el dispatch — seguimientos, campañas y recordatorios de
  visita pasan por ahí. Las decisiones del agente también (el ejecutor bloquea fuera de
  ventana: visto en producción el 2/9, `bloqueada_fuera_de_ventana_horaria` a las 23:00).
- Lo que NO respeta horario hoy:
  1. **La escalera** (`correrEscalamiento`): avisa al equipo por Resend + Meta directo a
     cualquier hora (primer aviso real del 1/9 salió 02:30 AM) y cuenta horas de reloj:
     un lead de las 23:00 escala al director (5 h) a las 04:00.
  2. **Los emails de n8n** (`Avisar_Asesor`, `Gestion_Handoff`): ejecuciones reales a las
     23:44 y 02:44 AR mandando email al asesor en el momento.

## El diseño

**Regla 1 — horas hábiles:** la espera se mide solo dentro de 6-23 AR (`horasHabiles`).
Lead escribe 3:00 → el reloj arranca 6:00 → aviso de 2 h al asesor a las 8:00; el director
(5 h) recién 11:00. Lead escribe 22:00 → suma 1 h hasta las 23:00, congela, y retoma 6:00 →
aviso de 2 h a las 7:00. Responde exactamente al "si está durmiendo no es que no quiera
contestar": el nivel que le llega a Kevin significa "N horas de día sin respuesta".

**Regla 2 — compuerta de envío:** `correrEscalamiento` no manda nada fuera de 6-23
(devuelve `fueraDeVentana: true` y el runner lo registra). Con horas hábiles los niveles
casi no pueden madurar de noche; la compuerta cubre el borde (madura 22:58, corrida 23:25).

**Regla 3 — los emails de n8n se PROGRAMAN, no se demoran:** Resend soporta `scheduled_at`.
En la madrugada (23-6 AR), los dos workflows agregan `scheduled_at = próximas 6:00 AR` al
cuerpo del email: n8n no se bloquea (el handoff deriva la conversación al instante, jamás
puede esperar — es un sub-workflow que el bot llama y espera), y el email llega 6:00.
El anotador de la bitácora dice "programado para las 6:00". Sin colas ni migraciones.

## Tasks

1. `lib/whatsapp/sending-window.ts`: `horasHabiles(desdeMs, hastaMs)` (AR es UTC-3 fijo,
   sin horario de verano) + tests.
2. `lib/seguimiento/escalamiento.ts`: compuerta + horas hábiles; `ResumenEscalamiento.fueraDeVentana`;
   runner lo expone. Tests: madrugada no manda; lead de las 3am escala 2 h a las 8:00;
   lead de las 22:00 congela y retoma.
3. n8n (con backup + verificación releyendo): `scheduled_at` en los Code nodes de los dos
   workflows + el anotador dice si quedó programado. Probar con un envío real de madrugada
   simulada (scheduled_at en el futuro cercano) verificando el id de Resend.
4. Docs (TECNICO §22, guías si toca) + bitácora + OK de Leonardo → PR a main.

## Qué NO cambia
Los niveles (2/5/10/20), los textos de las plantillas APPROVED, el camino del cliente
(ya estaba gateado), los avisos disparados por humanos (reasignación: si el director laburea
a las 23:30, su comentario viaja ya).
