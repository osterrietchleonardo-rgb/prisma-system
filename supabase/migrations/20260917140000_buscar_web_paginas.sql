-- supabase/migrations/20260917140000_buscar_web_paginas.sql
--
-- Chat web · buscar en el sitio de la agencia por significado.
-- Spec: docs/superpowers/specs/2026-09-16-chat-web-v1-simple-design.md (§3-bis)
--
-- QUÉ NO SE TOCA: ninguna tabla, ninguna fila, ninguna política. Es una función de SOLO LECTURA
-- (stable) sobre `web_paginas`, la tabla que creamos ayer y que todavía no usa nadie más.
--
-- Por qué en la base y no en el código: sin esto habría que traerse las 60 páginas con sus 768
-- números cada una en CADA mensaje del chat (unos 400 KB por pregunta) para comparar acá.
-- Postgres compara y devuelve las 6 que importan.
--
-- El `<=>` es la distancia entre dos vectores (0 = idénticos), así que `1 - distancia` es
-- "cuánto se parecen", que es como lo lee el código.
--
-- Sin índice de vectores a propósito: son 60 filas por agencia y recorrerlas es más rápido que
-- mantener un índice. Si alguna agencia pasara de unos miles, se agrega y esta función no cambia.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_buscar_web_paginas_rollback.sql

begin;

create or replace function buscar_web_paginas(
  p_widget_id uuid,
  p_vector vector(768),
  p_cantidad int default 6
)
returns table (
  url text,
  titulo text,
  texto text,
  orden int,
  excluida boolean,
  parecido double precision
)
language sql stable as $$
  select
    p.url,
    p.titulo,
    p.texto,
    p.orden,
    p.excluida,
    (1 - (p.embedding <=> p_vector))::double precision as parecido
  from public.web_paginas p
  where p.widget_id = p_widget_id
    and p.embedding is not null
    -- la página que el director sacó de la lista no se busca nunca
    and not p.excluida
  order by p.embedding <=> p_vector
  limit greatest(1, least(coalesce(p_cantidad, 6), 20))
$$;

comment on function buscar_web_paginas is
  'Chat web: las páginas del sitio que más se parecen a la pregunta del visitante. Solo lectura. Spec 2026-09-16 §3-bis.';

commit;
