-- ============================================================================
-- Clasificaciones acumuladas en la agenda de contactos.
--
-- Por qué: un mismo lead pasa por varios lugares — entra por `Whatsapp-Consulta`,
-- después lo importás en la lista "Oferta-Julio", después recibe la plantilla
-- `oferta_julio_2026`. Antes la columna guardaba UN solo valor y cada paso pisaba
-- al anterior; peor, al importar una lista los teléfonos que ya existían se
-- **salteaban enteros**, así que nunca quedaban registrados en ese lote y el filtro
-- no los encontraba.
--
-- Ahora se acumulan en `clasificaciones_historial` (misma forma que en
-- `wa_conversations`): [{ "clasificacion", "origen", "at" }] en orden.
-- `clasificacion` (singular) NO se toca: sigue siendo el ORIGEN del lead, así todo
-- lo que ya la lee (Leads WhatsApp, badges, campañas) sigue funcionando igual.
-- ============================================================================

ALTER TABLE public.wa_contacts
  ADD COLUMN IF NOT EXISTS clasificaciones_historial jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Línea de base: los contactos que ya existen arrancan la lista con su clasificación
-- actual. Sin esto el filtro por lista no encontraría a nadie hasta el próximo cambio.
UPDATE public.wa_contacts
SET clasificaciones_historial = jsonb_build_array(
      jsonb_build_object(
        'clasificacion', clasificacion,
        'origen', 'inicial',
        'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    )
WHERE clasificacion IS NOT NULL
  AND clasificaciones_historial = '[]'::jsonb;

-- Índice GIN: lo usan el filtro de la agenda y la inscripción de campañas para
-- traer al lead por CUALQUIERA de sus clasificaciones, no solo la primera.
CREATE INDEX IF NOT EXISTS wa_contacts_clasificaciones_idx
  ON public.wa_contacts USING gin (clasificaciones_historial jsonb_path_ops);

CREATE INDEX IF NOT EXISTS wa_conversations_clasificaciones_idx
  ON public.wa_conversations USING gin (clasificaciones_historial jsonb_path_ops);
