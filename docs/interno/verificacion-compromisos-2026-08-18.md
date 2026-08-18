# Verificación de compromisos de reuniones — 18/08/2026

Fuente: 10 notas de Gemini (`gemini-notes@google.com`) de reuniones por Meet entre el
18/06/2026 y el 13/08/2026. **69 compromisos** asignados a Leonardo.

Cada uno se verificó contra el código del repo y contra la base de producción
(`information_schema` vía Management API). **Ninguna tarea se creó sin esta verificación.**

## Método

1. Extraer las líneas `[Leonardo Osterrietch]` de cada nota.
2. Buscar la funcionalidad en `app/`, `lib/`, `components/`.
3. Confirmar contra producción: existencia de tabla/columna y **filas reales**.
4. Descartar falsos positivos del grep con una segunda pasada precisa.

Un grep positivo NO es prueba. Varias funciones aparecían por coincidencia de palabra
(«carteles» en `tags.config.ts`, «DNI» en plantillas de contrato, «invitación» en las
invitaciones de agencia). Solo cuenta la evidencia de la tercera columna.

## Ya implementado — NO generar tarea

| Compromiso | Evidencia real |
|---|---|
| Analizar hasta 4 fotos en el ACM | `lib/acm/analisis-fotos.ts`, `app/api/acm/analizar-fotos/route.ts`, `fotos-ia.tsx` · tabla `acm_fotos_analisis_cache` con **24 filas** |
| Historial de ACM | Pantalla `mis-acm.tsx` · tabla `acm_searches` con **84 filas** |
| Notas internas por propiedad | Columna `properties.notas_ia` |
| Categorizar asesores (Client Director / Support) | `app/actions/asesores.ts:197` → `CLASIFICACIONES_ASESOR` |
| Objetivos | `lib/tracking/objetivos` → `getObjectivesDashboard()` |
| Repositorio de documentos | `app/asesor/documentos/page.tsx` |
| Opción cochera en el ACM | `lib/acm/extract.ts:73`, `lib/acm/subject.ts:124`, `step1-sujeto.tsx:258` |
| Mapa de precio m² por manzana | `app/api/mapa/precio-m2/route.ts` → RPC `mapa_precio_m2_por_manzana` |
| Pirámide de precios en el informe | `app/ficha-acm/[token]/page.tsx` |
| Conclusión editable en el ACM | `app/api/acm/ficha/route.ts`, `comparables-result.tsx` |
| Pulso de mercado en el reporte de comparables | `app/api/acm/ficha/route.ts`, `ficha-acm` |
| Filtros de comparables por ambientes | `app/api/acm/comparables/route.ts:78,110,132` (`p_rooms`) |
| Sincronización con Google Calendar | `app/api/google-calendar/{connect,callback,status}` |
| Doble verificación de teléfono y correo | `components/shared/ManualContactFields.tsx` |
| Filtro de estado de asesores | `app/api/admin-vakdor/asesores/[id]/estado/route.ts` |
| Filtro de fechas en dashboard | `ConversationalFilters.tsx`, `LeadsDashboard.tsx` |

## Verificado como pendiente — sí generan tarea

Sin tabla, sin columna y sin implementación en el código:

Clasificar cliente prelisting + prebuying a la vez · Plan de marketing en el ACM ·
Botón flotante móvil a WhatsApp · Sofía contacta automáticamente desde portales ·
Plantillas vinculadas a la bandeja del asesor propietario · Importar cierres desde Excel ·
Panel de traspasos + envío semanal · Dashboard de transferencias sin respuesta ·
Análisis de desempeño semanal por mail · Honorarios por porcentaje · Filtro de PH ·
Nombre de archivo estandarizado del ACM · Mantener sesión 24 h · Aviso legal al pie de
los mails · Dirección de la propiedad en la solapa Leads Tokko · Marcar no leído en
WhatsApp · Renombrar el estado «descartado» · Ordenar asesores alfabéticamente ·
Eliminar códigos generados por error · Exportar PDF del ACM · Chequeo de datos cada
30 días · Escaneo de DNI · Invitación de calendario al cliente · Plantillas
motivacionales de WhatsApp · Formulario de carteles · Declinar seguimiento · Panel de
noticias · Cuentas corrientes de asesores.

## Cruce con el panel de sugerencias

De las 7 sugerencias abiertas en `system_feedback`, **dos ya están resueltas en el
código y siguen figurando como abiertas**:

- «No encontré la opción Cochera o Garage en el ACM» (Fernanda, 22/07) — marcada
  **pospuesta** con la respuesta «en un principio no está incluido». **Hoy sí está.**
- «Traer mapa de metro cuadrado por manzana» (23/07) — en revisión. **Ya está.**

Dos asesores esperan respuesta por cosas que funcionan. Eso desalienta futuras
sugerencias, que son la mejor fuente de mejoras del producto.

## El patrón que hay que romper

El mismo asunto vivía en tres lugares sin conexión entre sí:

```
Fernanda lo pide en el panel (22/07) → aparece como compromiso con Kevin (22/07)
    → se implementa en el código → la sugerencia sigue "pospuesta"
```

Por eso el campo **Origen** en ClickUp es obligatorio: cada tarea declara de dónde
salió, y lo que aparece en tres lados es una tarea con tres orígenes, no tres tareas.

## Estado en ClickUp

Cargadas **36 tareas** en `📅 TAREAS / Tareas`, todas con Área, Tipo, A quién afecta,
Origen y prioridad. Prioridades: 3 urgentes, 9 altas, 19 normales, 5 bajas.

Las 3 urgentes:

1. Decidir el posicionamiento frente a Tokko (complemento o alternativa).
2. Retomar el seguimiento con Julieta Lima (QuintoAndar).
3. El asesor no puede ver el link de la propiedad del colega ni contactarlo.

## Pendiente de esta verificación

Los compromisos de tipo relacional o de gestión (asistir a un evento, enviar un
resumen, participar de una reunión con Tokko) no se pueden verificar contra código.
Se resolvieron leyendo los hilos de correo reales, no las notas.
