-- ─────────────────────────────────────────────────────────────
-- SEGURIDAD: cerrar la escalada de privilegios entre inmobiliarias.
--
-- Encontrado el 2026-08-27 revisando la migración del versionado. No lo trajo
-- la Etapa C: es anterior, y la política culpable ni siquiera está en las
-- migraciones del repo -- se creó a mano desde el panel de Supabase.
--
-- EL AGUJERO (medido dos veces, por el revisor y por el controlador, dentro de
-- transacciones que terminaron en ROLLBACK y sin dejar una fila escrita):
--
--   La política `Profiles: update_self` tiene cmd=UPDATE, qual=(auth.uid()=id)
--   y with_check = NULL. En un UPDATE, Postgres usa el USING como check, así
--   que dice QUÉ FILA podés tocar pero no QUÉ COLUMNAS. Resultado: cualquier
--   usuario puede cambiarse su propio `role` y su propio `agency_id`.
--
--   Prueba: un asesor real (agencia 4962bf85) corrió, con su propia sesión,
--     UPDATE profiles SET role='director', agency_id='c8b1da61' WHERE id=<él>
--   El UPDATE PASÓ. Quedó como director de una inmobiliaria ajena, y desde ahí
--   leyó el molde de documentos de esa otra agencia.
--
-- POR QUÉ ES GRAVE: de 120 políticas en `public`, 58 leen `profiles` y 22 usan
-- get_my_agency_id() (que lee el mismo profiles.agency_id). Son 46 tablas cuyo
-- aislamiento entre inmobiliarias se apoya en un dato que el propio atacante
-- podía editar.
--
-- Verificado ANTES de escribir esto, para no romper el registro: las cuatro
-- vías legítimas que asignan role/agency_id (crear agencia, alta con código de
-- director, alta con código de agencia, y el panel de admin) usan TODAS
-- createAdminClient() -- service_role -- que este arreglo exceptúa a propósito.
--
-- Verificado ANTES de escribir esto, para que ninguna restricción falle por
-- datos viejos: 0 documentos con el tipo de otra agencia, 0 con el asesor de
-- otra agencia, 0 info_documents mal, 0 perfiles sin agencia.
--
-- Cómo se deshace: al final del archivo.
-- ─────────────────────────────────────────────────────────────

-- ── 1. El rol y la agencia dejan de ser editables por el propio usuario ──
--
-- Va por trigger y no por WITH CHECK porque un WITH CHECK no puede mirar el
-- valor ANTERIOR de la fila: puede decir "el rol tiene que ser X", no "el rol
-- tiene que ser el mismo que ya tenía". Lo que hay que prohibir es el CAMBIO,
-- así que hace falta comparar OLD contra NEW, y eso solo se puede en un trigger.
--
-- service_role queda exceptuado a propósito: es la vía por la que el servidor
-- da de alta a un asesor con su código de invitación, crea una agencia y le
-- asigna el rol. Sin esa excepción, el registro se rompe.
CREATE OR REPLACE FUNCTION public.congelar_rol_y_agencia()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (el default) A PROPOSITO, y esto es lo que hace que el
-- arreglo funcione: adentro de una SECURITY DEFINER, current_user devuelve la
-- DUENA de la funcion (postgres), no quien la llama. Con SECURITY DEFINER la
-- excepcion de abajo daba verdadera para todo el mundo y el trigger no frenaba
-- absolutamente nada. Medido: adentro de una SECURITY DEFINER, current_user =
-- postgres aunque la sesion sea la de un asesor.
SET search_path = public
AS $$
BEGIN
  -- El servidor (service_role) y el dueño de la base sí pueden: son las vías
  -- legítimas de alta, invitación y administración.
  IF current_user IN ('service_role', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'El rol de un perfil no se cambia desde la sesión del usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'La inmobiliaria de un perfil no se cambia desde la sesión del usuario.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_congelar_rol_y_agencia ON public.profiles;
CREATE TRIGGER profiles_congelar_rol_y_agencia
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.congelar_rol_y_agencia();

-- Y el WITH CHECK que le faltaba a la política, que es lo que impide que
-- alguien reescriba el `id` de la fila para quedarse con el perfil de otro.
-- El trigger es la defensa principal; esto es la segunda puerta.
DROP POLICY IF EXISTS "Profiles: update_self" ON public.profiles;
CREATE POLICY "Profiles: update_self"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 2. Un documento no puede colgar del tipo ni del asesor de OTRA agencia ──
--
-- Antes esto lo cuidaba solo la política de RLS, que mira `agency_id` pero no
-- `template_id` ni `advisor_id`. Medido: un director podía insertar con SU
-- agency_id apuntando a la plantilla de otra inmobiliaria, y podía plantarle un
-- documento a un asesor ajeno -- que después LO VEÍA, porque su política es
-- `advisor_id = auth.uid()` sin filtro de agencia.
--
-- Se cierra en la base y no en la política: una clave foránea compuesta no se
-- puede esquivar desde la app ni olvidar en la próxima pantalla.
-- Se agrega SOLO si no está. Un DROP+ADD acá no es idempotente: en la
-- segunda corrida el DROP falla porque las claves compuestas de abajo ya
-- dependen de esta restricción ("cannot drop constraint ... because other
-- objects depend on it"). Medido al re-correr la migración.
DO $idem$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_agency_unica') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_agency_unica UNIQUE (id, agency_id);
  END IF;
END $idem$;

-- Se agrega SOLO si no está. Un DROP+ADD acá no es idempotente: en la
-- segunda corrida el DROP falla porque las claves compuestas de abajo ya
-- dependen de esta restricción ("cannot drop constraint ... because other
-- objects depend on it"). Medido al re-correr la migración.
DO $idem$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advisor_doc_templates_id_agency_unica') THEN
    ALTER TABLE public.advisor_doc_templates ADD CONSTRAINT advisor_doc_templates_id_agency_unica UNIQUE (id, agency_id);
  END IF;
END $idem$;

-- Las versiones cuelgan del tipo DE SU MISMA agencia.
ALTER TABLE public.advisor_doc_template_versions
  DROP CONSTRAINT IF EXISTS advisor_doc_template_versions_template_id_fkey;
ALTER TABLE public.advisor_doc_template_versions
  DROP CONSTRAINT IF EXISTS advisor_doc_template_versions_template_agency_fkey;
ALTER TABLE public.advisor_doc_template_versions
  ADD CONSTRAINT advisor_doc_template_versions_template_agency_fkey
  FOREIGN KEY (template_id, agency_id)
  REFERENCES public.advisor_doc_templates(id, agency_id) ON DELETE CASCADE;

-- El documento del asesor cuelga del asesor DE SU MISMA agencia.
ALTER TABLE public.advisor_documents
  DROP CONSTRAINT IF EXISTS advisor_documents_advisor_agency_fkey;
ALTER TABLE public.advisor_documents
  ADD CONSTRAINT advisor_documents_advisor_agency_fkey
  FOREIGN KEY (advisor_id, agency_id)
  REFERENCES public.profiles(id, agency_id) ON DELETE CASCADE;

ALTER TABLE public.advisor_info_documents
  DROP CONSTRAINT IF EXISTS advisor_info_documents_advisor_agency_fkey;
ALTER TABLE public.advisor_info_documents
  ADD CONSTRAINT advisor_info_documents_advisor_agency_fkey
  FOREIGN KEY (advisor_id, agency_id)
  REFERENCES public.profiles(id, agency_id) ON DELETE CASCADE;

-- ── 3. Borrar un tipo de documento ya no borra los contratos ─────────────
--
-- Decisión de Leonardo, 2026-08-27. Antes era ON DELETE CASCADE: borrar el tipo
-- "Contrato de Asesor" se llevaba los contratos personalizados de los 30
-- asesores, sin aviso y sin que RLS lo frenara (las cascadas no evalúan RLS).
-- Medido: tipo=0, documentos=0.
--
-- Ahora la base FRENA el borrado mientras haya documentos colgando. El director
-- ve el error, no el desastre. La pantalla tiene que traducirlo a algo legible:
-- "no se puede borrar: hay N documentos de asesores usando este tipo".
--
-- Va junto con la clave compuesta del tipo, así que primero se saca la vieja.
ALTER TABLE public.advisor_documents
  DROP CONSTRAINT IF EXISTS advisor_documents_template_id_fkey;
ALTER TABLE public.advisor_documents
  DROP CONSTRAINT IF EXISTS advisor_documents_template_agency_fkey;
ALTER TABLE public.advisor_documents
  ADD CONSTRAINT advisor_documents_template_agency_fkey
  FOREIGN KEY (template_id, agency_id)
  REFERENCES public.advisor_doc_templates(id, agency_id) ON DELETE RESTRICT;

-- ── 4. Un número de versión no puede ser negativo ────────────────────────
ALTER TABLE public.advisor_doc_template_versions
  DROP CONSTRAINT IF EXISTS advisor_doc_template_versions_version_positiva;
ALTER TABLE public.advisor_doc_template_versions
  ADD CONSTRAINT advisor_doc_template_versions_version_positiva CHECK (version > 0);

-- ── 5. Índices en las columnas que referencian ───────────────────────────
-- Sin esto, cada borrado de una versión hace scan de las tablas que la apuntan.
CREATE INDEX IF NOT EXISTS advisor_documents_version_id_idx
  ON public.advisor_documents (version_id);
CREATE INDEX IF NOT EXISTS advisor_doc_templates_version_actual_idx
  ON public.advisor_doc_templates (version_actual);

COMMENT ON FUNCTION public.congelar_rol_y_agencia()
  IS 'Impide que un usuario se cambie el rol o la inmobiliaria desde su propia sesión. El servidor (service_role) sí puede: es la vía del alta con código de invitación.';

-- ─────────────────────────────────────────────────────────────
-- CÓMO SE DESHACE, si algo saliera mal:
--
--   DROP TRIGGER IF EXISTS profiles_congelar_rol_y_agencia ON public.profiles;
--   DROP FUNCTION IF EXISTS public.congelar_rol_y_agencia();
--   ALTER TABLE public.advisor_documents DROP CONSTRAINT advisor_documents_advisor_agency_fkey;
--   ALTER TABLE public.advisor_documents DROP CONSTRAINT advisor_documents_template_agency_fkey;
--   ALTER TABLE public.advisor_documents ADD CONSTRAINT advisor_documents_template_id_fkey
--     FOREIGN KEY (template_id) REFERENCES public.advisor_doc_templates(id) ON DELETE CASCADE;
--   ALTER TABLE public.advisor_info_documents DROP CONSTRAINT advisor_info_documents_advisor_agency_fkey;
--   ALTER TABLE public.advisor_doc_template_versions DROP CONSTRAINT advisor_doc_template_versions_template_agency_fkey;
--   ALTER TABLE public.advisor_doc_template_versions ADD CONSTRAINT advisor_doc_template_versions_template_id_fkey
--     FOREIGN KEY (template_id) REFERENCES public.advisor_doc_templates(id) ON DELETE CASCADE;
--
-- La política "Profiles: update_self" vuelve a su forma anterior sacándole el
-- WITH CHECK, pero NO conviene: es parte del arreglo.
-- ─────────────────────────────────────────────────────────────
