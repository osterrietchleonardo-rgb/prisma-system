-- Un solo chat por (inmobiliaria, teléfono).
--
-- Por qué: el código busca la conversación y, si no existe, la crea. Son dos viajes
-- separados a la base, así que dos mensajes del mismo lead atendidos en paralelo
-- pueden crear dos chats. El 4-ago-2026 el sistema se puso ~100x más lento (hasta
-- 71s en atender un mensaje entrante, contra 0,3s de un día normal), la ventana
-- entre el "buscar" y el "crear" se abrió a decenas de segundos, y se duplicaron 3
-- leads: Yamila Bruzzone quedó partida en 5 chats, con los mensajes y la memoria
-- del bot repartidos entre ellos.
--
-- Ningún código puede garantizar unicidad entre procesos paralelos por su cuenta:
-- el árbitro tiene que ser la base. Este índice es ese árbitro.
--
-- IMPORTANTE — orden de aplicación: esta migración va DESPUÉS de desplegar el
-- código que la acompaña (lib/whatsapp/conversations.ts). Ese código atrapa el
-- rechazo del índice (error 23505) y reintenta la búsqueda para meter el mensaje en
-- el chat que ganó la carrera. Sin él, un choque haría que el mensaje se PIERDA en
-- vez de duplicarse, que es peor que el problema original.
--
-- Precondición verificada antes de escribir esto: 1673 chats, 0 duplicados,
-- 0 agency_id nulos, 0 teléfonos nulos o vacíos. Los 3 duplicados del 4-ago ya
-- fueron unificados a mano (respaldo en scratch/_RESPALDO_unificacion_*.json).
--
-- Nota sobre n8n: sus 32 flujos tocan wa_conversations en 15 nodos, todos UPDATE o
-- SELECT. Ninguno inserta, así que este índice no puede romperle nada.

create unique index if not exists wa_conversations_agency_phone_key
  on public.wa_conversations (agency_id, contact_phone);
