-- ============================================================================
-- Trazabilidad de clasificación en los chats de WhatsApp.
--
-- Por qué: la campaña le asigna su clasificación al chat (ej. un lead que entró como
-- `Whatsapp-Consulta` y después recibió la campaña "Oferta" queda como "Oferta").
-- Eso está bien para segmentar, pero antes se perdía por dónde pasó el lead.
-- Ahora cada cambio queda registrado acá, sin tocar cómo funcionan los filtros:
-- `clasificacion` sigue siendo la vigente y este historial guarda el recorrido.
--
-- Forma de cada entrada:
--   { "clasificacion": "Oferta-Julio", "origen": "campaña: Oferta Julio", "at": "2026-07-22T..." }
-- ============================================================================

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS clasificaciones_historial jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Línea de base: los chats que ya existen arrancan el historial con su clasificación
-- actual, fechada en su creación. Sin esto el recorrido empezaría recién en el próximo
-- cambio y no se sabría de dónde venía el lead.
UPDATE public.wa_conversations
SET clasificaciones_historial = jsonb_build_array(
      jsonb_build_object(
        'clasificacion', clasificacion,
        'origen', 'inicial',
        'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    )
WHERE clasificacion IS NOT NULL
  AND clasificaciones_historial = '[]'::jsonb;
