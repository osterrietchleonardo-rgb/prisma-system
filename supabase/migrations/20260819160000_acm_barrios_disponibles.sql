-- ACM · Catalogo de barrios para el desplegable del campo "Barrio / Zona".
--
-- POR QUE EXISTE. El campo era un input de texto libre sin ninguna validacion: solo se
-- chequeaba que no estuviera vacio. Una asesora de Central cargo la direccion partida --
-- "Nogoya" en Direccion y "4464" en Barrio -- y el ACM busco comparables en un barrio
-- llamado "4464". Devolvio 0, en 256 ms, sin ningun error: la busqueda corrio perfecto,
-- solo que sobre un barrio inexistente. Con el barrio bien cargado (Villa del Parque) esa
-- misma propiedad tiene 50 comparables en la red y 3 en la cartera de la agencia.
--
-- Peor todavia, el mensaje que le mostro la mandaba por el camino equivocado: "no se
-- encontraron comparables en la red (para venta hay pocos avisos; el grueso esta en
-- alquiler)". La calle Nogoya tiene 115 avisos activos.
--
-- QUE DEVUELVE. Un barrio por fila, con el nombre para mostrar y cuantos avisos activos
-- tiene la red. La UI muestra ese numero al lado del nombre para que el asesor sepa ANTES
-- de buscar si va a encontrar algo.
--
-- DE DONDE SALEN. Union de dos fuentes, las dos leidas en vivo -- cuando el crawler carga
-- un barrio nuevo aparece solo, sin tocar codigo ni listas escritas a mano:
--
--   · roomix_properties: barrios con 25 avisos activos o mas. Hoy son 606.
--   · acm_barrio_relacion: el mapa de zonas del ACM (111 barrios). Entran TODOS aunque no
--     llegaran al umbral, porque son los que el gate de barrio sabe expandir a linderos.
--     Medido al escribir esto: los 111 superan el umbral igual, asi que hoy no agrega
--     ninguno; esta por si manana se suma una zona nueva al mapa.
--
-- EL UMBRAL DE 25. La red tiene 2.799 valores distintos en el campo barrio, la mayoria
-- basura o casos unicos. Con 25 quedan 606, que es una lista navegable y toda con material
-- real detras. No es un numero sagrado: si se sube a 50 quedan 432 y a 100 quedan 318.
--
-- LO QUE ESTA VISTA NO CUBRE, A PROPOSITO. Los barrios de la cartera propia de cada
-- agencia. Hay 67 barrios de carteras reales (106 propiedades, como el country "Los
-- Bosquecitos" con 15) que no tienen avisos en la red y no entran aca. Esos los agrega el
-- endpoint /api/acm/barrios, que sabe la agencia del que esta logueado; meterlos en la
-- vista obligaria a mezclar datos de un tenant en un catalogo comun.
--
-- Y la lista NO es cerrada: el asesor puede escribir un barrio que no este, y la UI le
-- avisa que no lo reconocemos. Decision de Leonardo, para no bloquear esas 106 propiedades.
--
-- SEGURIDAD. Vista comun (no security_invoker), o sea que agrega sobre toda la red sin
-- pasar por el RLS de roomix_properties. Es deliberado y no expone nada: lo unico que sale
-- son nombres de barrio y un conteo. Un asesor TIENE que poder ver todos los barrios de la
-- red, no solo los de su agencia -- si no, no podria buscar comparables fuera de su cartera,
-- que es justamente para lo que existe la red de colaboracion.

CREATE OR REPLACE VIEW public.acm_barrios_disponibles AS
WITH red AS (
  SELECT
    public.acm_norm(btrim(coalesce(nullif(r.neighborhood,''), r.city,''))) AS clave,
    -- El nombre tal cual lo escribe la mayoria de los avisos: "Villa del Parque", no
    -- "villa del parque". El de la clave normalizada no sirve para mostrar.
    mode() WITHIN GROUP (ORDER BY btrim(coalesce(nullif(r.neighborhood,''), r.city,''))) AS nombre,
    count(*)::int AS avisos
  FROM public.roomix_properties r
  WHERE r.is_active = true
    AND r.embedding IS NOT NULL
    AND btrim(coalesce(nullif(r.neighborhood,''), r.city,'')) <> ''
  GROUP BY 1
),
cat AS (
  SELECT DISTINCT c.barrio AS clave FROM public.acm_barrio_relacion c
)
SELECT
  coalesce(red.clave, cat.clave)          AS clave,
  coalesce(red.nombre, initcap(cat.clave)) AS nombre,
  coalesce(red.avisos, 0)                 AS avisos,
  (cat.clave IS NOT NULL)                 AS en_mapa_de_zonas
FROM red
FULL OUTER JOIN cat ON cat.clave = red.clave
WHERE coalesce(red.avisos, 0) >= 25 OR cat.clave IS NOT NULL;

COMMENT ON VIEW public.acm_barrios_disponibles IS
  'Barrios que ofrece el desplegable del ACM: los de la red con 25+ avisos activos mas el mapa de zonas. Se actualiza sola.';

GRANT SELECT ON public.acm_barrios_disponibles TO authenticated;
