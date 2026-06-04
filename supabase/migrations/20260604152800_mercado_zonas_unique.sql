-- Elimina los registros duplicados conservando solo el último insertado (usando ctid por seguridad)
DELETE FROM mercado_zonas
WHERE ctid NOT IN (
    SELECT MAX(ctid)
    FROM mercado_zonas
    GROUP BY zona, mes_reporte
);

-- Agrega el constraint unique para evitar futuros duplicados
ALTER TABLE mercado_zonas
ADD CONSTRAINT mercado_zonas_zona_mes_unique UNIQUE (zona, mes_reporte);
