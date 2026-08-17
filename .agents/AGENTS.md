# Modus Operandi - PRISMA-SYSTEM

## Regla de Oro de Análisis y Diagnóstico
1. **Verificación Empírica Obligatoria**: Todo análisis, diagnóstico de errores o reporte de fallas debe ser corroborado con datos reales extraídos de la base de datos (PostgreSQL/Supabase), logs del sistema o inspección directa del código fuente.
2. **Respuestas Detalladas y Fundamentadas**: Cada análisis o verificación solicitada debe entregarse con un desglose detallado, fundamentado con evidencias reales verificadas en la base de datos y en el código fuente, incluyendo siempre el paso a seguir recomendado.
3. **Cero Suposiciones**: NUNCA inventar, responder de memoria o suponer el estado de una base de datos o sistema sin consultar la fuente directa de verdad.
4. **Autorización Previa Obligatoria (Cero Ejecución Sin Permiso)**: NUNCA ejecutar ningún cambio de código, modificación en BD ni comando de escritura/mutación sin el permiso explícito previo del usuario. Las lecturas e inspecciones de auditoría deben hacerse sin alterar nada.

