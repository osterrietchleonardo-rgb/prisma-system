# API de EasyPanel — referencia (verificada en panel.vakdor.com, v2.32.1)

- **Base:** `https://panel.vakdor.com`
- **Auth:** header `Authorization: Bearer <EASYPANEL_API_KEY>` (token permanente del `.env`).
- **Server:** `161.35.14.211` (via `settings.getServerIp`).
- **Estilo tRPC:** queries por **GET**, mutations por **POST**. Los routers están **anidados bajo
  `services.<tipo>.*`** (NO existen los top-level `app.*`, `common.*`, `monitor.*`).
- **Formato del `input`:** JSON envuelto en `{"json": ...}`. En GET va URL-encoded en `?input=`.

```js
// Construir el input para GET:
const input = encodeURIComponent(JSON.stringify({ json: { projectName, serviceName } }))
fetch(`${BASE}/api/trpc/${proc}?input=${input}`, { headers: { Authorization: `Bearer ${token}` } })
// Para mutations (POST): body = JSON.stringify({ json: { projectName, serviceName } })
```

Toda respuesta OK viene como `{"json": <valor>}` (a veces con `"meta"`).

## Lectura (GET) — verificadas, sin riesgo

| Procedimiento | Input | Devuelve |
|---|---|---|
| `projects.listProjects` | — | `[{name, createdAt}]` |
| `projects.listProjectsAndServices` | — | `{projects:[{name}], services:[{projectName,name,type,enabled,token,source,env,deploy,mounts,ports,resources,...}]}` |
| `services.common.getServiceError` | `{projectName, serviceName}` | `null` = sano; `{message,...}` = error de deploy/runtime |
| `services.app.inspectService` | `{projectName, serviceName}` | config completa de una app |
| `services.postgres.inspectService` | `{projectName, serviceName}` | config completa de un postgres |
| `services.redis.inspectService` | `{projectName, serviceName}` | config completa de un redis |
| `settings.getServerIp` | — | `"161.35.14.211"` |
| `update.getStatus` | — | `{available, releaseTag, version}` (versión del panel) |

Nota: `<tipo>` sale del campo `type` de cada servicio (`app`, `postgres`, `redis`, `mysql`, `mongo`).

## Control (POST) — SOLO con OK explícito de Leonardo

Impactan producción. Confirmá servicio + acción antes de ejecutar. Body:
`{"json":{"projectName":"agencia_vakdor","serviceName":"<servicio>"}}`.

**Apps (`type: app`) — verificados que existen:**
- `services.app.startService`
- `services.app.stopService`
- `services.app.restartService`
- `services.app.deployService` (re-deploya la imagen/fuente actual)

**Bases (postgres/redis y equivalentes) — nombres del router (no ejecutados en prueba):**
- `services.postgres.enableService` / `services.postgres.disableService`
- `services.redis.enableService` / `services.redis.disableService`
- (postgres/redis NO tienen `restartService`; se maneja con enable/disable)

Otras mutaciones existentes por tipo (usar con extremo cuidado, requieren OK): `destroyService`,
`exposeService`, `updateResources`, `updateAdvanced`, `updateCredentials`. Verificá el nombre exacto
mandando el POST con input inválido `{"json":{}}` primero: si devuelve `"Input validation failed"`
(HTTP 400) el endpoint existe y **no** ejecutó nada; si devuelve `{"error":"Not found"}` (404) no existe.

## Lo que NO existe / NO usar (verificado a fondo)

- `services.list`, `services.getUsage` → **no existen** (sugerencias alucinadas).
- Router `monitor.*` completo (`getSystemStats`, `getServiceStats`, `getDockerTaskStats`,
  `getMonitorTableData`) → **404 con el API token**, por GET y POST, flat y anidado. Las métricas de
  CPU/RAM/uptime en vivo NO son accesibles por token: usar la web (pestaña Monitor) o `docker stats`
  por SSH en `161.35.14.211`.
- Top-level `app.*`, `common.*` (sin el prefijo `services.`) → 404. Siempre anidado.

## Cómo verificar un endpoint nuevo sin romper nada

1. **Query (GET):** probá con `?input=` correcto. `{"error":"Not found"}` = no existe en esta versión.
2. **Mutation (POST):** mandá `{"json":{}}` (input inválido a propósito). `400 "Input validation failed"`
   confirma que existe **sin ejecutar** la acción. Recién con el input real se ejecuta.
