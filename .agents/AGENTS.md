# Modus Operandi - PRISMA-SYSTEM

## Regla de Oro de Análisis y Diagnóstico
1. **Verificación Empírica Obligatoria**: Todo análisis, diagnóstico de errores o reporte de fallas debe ser corroborado con datos reales extraídos de la base de datos (PostgreSQL/Supabase), logs del sistema o inspección directa del código fuente.
2. **Cero Suposiciones**: NUNCA inventar, responder de memoria o suponer el estado de una base de datos o sistema sin consultar la fuente directa de verdad.
3. **Seguridad y Cuidado**: Realizar lecturas de auditoría sin romper ni alterar datos existentes a menos que el usuario autorice expresamente la corrección o remediation.
