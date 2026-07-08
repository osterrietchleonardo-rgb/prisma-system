---
name: vakdor-easypanel
description: >
  Conecta y monitorea el EasyPanel de Vakdor (panel.vakdor.com, el servidor 161.35.14.211 que
  aloja n8n, chatwoot, evolution-api, redis, acm-extractor, roomix-worker). Usala SIEMPRE que
  Leonardo pregunte por el estado de la infraestructura o de un servicio: "¿está levantado n8n?",
  "¿se cayó algo?", "estado del server", "qué servicios están corriendo", "revisá el panel",
  "reiniciá evolution-api", "inspeccioná chatwoot", o mencione EasyPanel / panel.vakdor.com.
  Muestra la vista de proyectos con servicios en línea/caídos, inspecciona la config de cada
  servicio, y (solo con OK explícito) controla servicios (start/stop/restart/deploy).
---

# Vakdor EasyPanel

Skill para ver y operar la infraestructura de Vakdor alojada en EasyPanel (`panel.vakdor.com`,
servidor `161.35.14.211`). Todo se hace contra la API tRPC del panel, autenticando con el token
`EASYPANEL_API_KEY` del `.env` del repo. Los endpoints de acá están **verificados en vivo** contra
el panel real (v2.32.1) — no inventes rutas: si algo no está documentado acá, verificalo primero.

## Lo primero: mostrar el estado

Para responder "¿está todo levantado?" corré el script de estado (solo lectura, seguro):

```bash
node .claude/skills/vakdor-easypanel/scripts/easypanel.mjs
```

Muestra cada proyecto con sus servicios y un punto de estado:
- **● verde "en línea"** = habilitado y sin errores de deploy/runtime (sano).
- **● rojo "ERROR"** = habilitado pero con un error registrado (se muestra el mensaje debajo).
- **● gris "apagado"** = deshabilitado en la config.

Variantes:
- `--fast` → solo lee `enabled` sin chequear salud (1 request, más rápido; no distingue ERROR).
- `--inspect <servicio>` → imprime la config completa (imagen, env, recursos, mounts, ports).
- `--json` → JSON crudo de `projects.listProjectsAndServices`.

Cuando le informes el estado a Leonardo, resumí en su idioma: qué está en línea, qué está caído,
y si hay un ERROR, qué dice el mensaje. No le tires el JSON crudo salvo que lo pida.

## Qué se puede y qué NO (límites reales del token)

**Sí se puede (lectura, sin riesgo):** listar proyectos/servicios, salud por servicio, inspeccionar
config, IP del server.

**NO se puede con el API token:** métricas en vivo de CPU/RAM/uptime por contenedor. Todo el router
`monitor.*` devuelve 404 con el token (requiere sesión de admin en la web). Si Leonardo pide CPU/RAM
reales, decíselo derecho: eso sale de la pestaña **Monitor** de la web, o de `docker stats` por SSH
en `161.35.14.211`. No pierdas tiempo probando `monitor.*` ni `services.getUsage` (no existe).

Ojo con un matiz importante: `enabled: true` significa "habilitado en la config", **no** "el contenedor
está corriendo ahora". La señal real de salud es `getServiceError` (lo que usa el script). Un servicio
puede estar `enabled` pero caído si crasheó — en ese caso `getServiceError` devuelve el error y el
script lo marca en rojo.

## Controlar servicios (start / stop / restart / deploy)

Estas son **acciones que impactan producción** (frenan o reinician n8n, chatwoot, evolution-api, etc.).
Regla dura, igual que con n8n: **NUNCA ejecutes una mutación sin OK explícito de Leonardo en el momento.**
La lectura es libre; escribir/reiniciar/frenar requiere confirmación puntual, aunque lo haya aprobado antes.

Antes de ejecutar cualquier control:
1. Confirmá con Leonardo qué servicio y qué acción exacta.
2. Verificá el nombre del servicio con el listado (`easypanel.mjs`).
3. Ejecutá la mutación con el `projectName` + `serviceName` correctos.

Las mutaciones son POST con body `{"json":{"projectName":"...","serviceName":"..."}}`. Para apps:
`services.app.restartService`, `.startService`, `.stopService`, `.deployService` (verificados). Para
postgres/redis los nombres cambian (`enableService`/`disableService`). Los detalles exactos de cada
endpoint de control están en `references/api.md` — **leelo antes de mandar cualquier mutación** para
no equivocarte de ruta.

## Referencia completa de endpoints

Todo el mapa de la API (rutas verificadas, formato del `input` tRPC, shapes de respuesta, y lo que
NO existe) está en `references/api.md`. Consultalo cuando necesites un endpoint que no esté en el
flujo de arriba.
