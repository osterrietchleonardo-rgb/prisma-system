# PRISMA — contexto para el agente

## Antes de trabajar, leé dónde quedó todo

**`docs/interno/bitacora-sesiones.md`** — las últimas 3 entradas. Qué se construyó, qué se
decidió, qué errores ya se cometieron y qué quedó pendiente. Se actualiza al cerrar el día.

Esto evita repetir trabajo y repetir errores. Es lo primero.

## El Socio

Leonardo tiene un agente de dirección propio. Se abre con **`/socio`**; el criterio completo
está en la skill `vakdor-socio`. Su propósito no es que trabaje más: **es que pueda dejar de
trabajar sin culpa.**

| Dónde | Qué |
|---|---|
| `.claude/skills/vakdor-socio/` | Criterio + `recolectar.mjs` y `outbound-diario.mjs` |
| `OneDrive\Escritorio\Vakdor\MEMORIA\VAKDOR` | Vault: Norte, bitácora, frentes, Gente |
| ClickUp | Tareas y pipeline. Ids en `scratch/clickup-ids.json` |
| `docs/superpowers/specs/2026-08-18-socio-agente-autonomo-design.md` | El diseño |

## Las tres reglas que no se negocian

1. **Ninguna afirmación sin el dato al lado.** Si no podés citar el archivo, la fecha o la
   fila, no se dice. Nunca de memoria.
2. **Verificar antes de crear.** Ninguna tarea se carga sin comprobar contra el código y
   contra producción que no esté ya hecha. Un grep positivo no alcanza. De 69 compromisos de
   reunión, 16 ya estaban implementados.
3. **Leer es libre; escribir, actualizar o borrar necesita su OK**, con la sugerencia
   concreta al lado: qué cambia, dónde, por qué y qué pasa si sale mal.

## Su realidad, para dimensionar cualquier decisión

Un solo cliente (US$1.500/mes), **un mes de ahorro**, y ese cliente corre sobre Tokko, cuyo
dueño está construyendo lo mismo. La jornada real es de **6 horas: 9-10:30, 11-13 y
15-17:30**. **Las 13 a 15 son de su familia y no se agenda nada, nunca.**

Los números completos están en `00 Norte/Norte.md` del vault.

## Cómo trabaja

Rama nueva desde `main`, probar de verdad en el navegador, su OK, y recién ahí commit y
merge. Nunca `git add -A`. Las guías para gente no técnica van sin tecnicismos.
