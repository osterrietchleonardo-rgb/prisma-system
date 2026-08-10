-- ============================================================================
-- Borrado definitivo de un perfil de asesor (duplicados / cargas por error).
--
-- Por que hace falta una funcion: 33 tablas apuntan a public.profiles con
-- comportamiento heterogeneo al borrar (7 CASCADE, 17 NO ACTION, 9 SET NULL).
-- Entre las CASCADE esta performance_logs: borrar a alguien con historial le
-- destruiria toda la actividad registrada EN SILENCIO. Por eso ningun borrado
-- se ejecuta sin antes medir que tiene el perfil encima.
--
-- La funcion recorre los FKs del catalogo (no una lista hardcodeada), asi que
-- una tabla nueva a futuro entra sola en la verificacion en vez de quedar
-- ignorada. Quien decide que bloquea y que no es la lista blanca de la server
-- action (app/actions/asesores.ts): aca solo se mide.
--
-- Nota: `tabla` sale como regclass::text, que con search_path incluyendo public
-- devuelve el nombre corto ("leads", no "public.leads"). La lista blanca de la
-- server action depende de eso.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.asesor_huella_datos(p_id uuid)
RETURNS TABLE (tabla text, columna text, filas bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
    ORDER BY 1, 2
  LOOP
    -- r.tbl y r.col salen del catalogo, no de entrada del usuario.
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col)
      INTO n USING p_id;

    IF n > 0 THEN
      tabla := r.tbl;
      columna := r.col;
      filas := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Solo el backend la usa (server action con service_role). Nadie mas.
--
-- OJO: revocar de PUBLIC no alcanza. Supabase concede EXECUTE explicitamente a
-- anon y authenticated sobre toda funcion nueva del esquema public, y como esta
-- es SECURITY DEFINER, dejarlas asi permitiria a cualquier usuario logueado
-- contar filas de cualquier perfil salteando RLS. Hay que revocarles a las dos.
REVOKE ALL ON FUNCTION public.asesor_huella_datos(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.asesor_huella_datos(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.asesor_huella_datos(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.asesor_huella_datos(uuid) TO service_role;

-- ── Auditoria del borrado definitivo ────────────────────────────────────────
-- El perfil deja de existir, asi que la fila de auditoria NO puede apuntarlo:
-- la constancia va con asesor_id NULL y la identidad escrita en el motivo.
-- (asesor_id ya es nullable desde 20260709120000_equipo_acciones.sql.)
ALTER TABLE public.equipo_acciones
  DROP CONSTRAINT IF EXISTS equipo_acciones_tipo_accion_check;

ALTER TABLE public.equipo_acciones
  ADD CONSTRAINT equipo_acciones_tipo_accion_check
  CHECK (tipo_accion IN ('pausa', 'reanudacion', 'desvinculacion', 'eliminacion_definitiva'));
