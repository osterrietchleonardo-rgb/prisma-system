# Backups de workflows de n8n

Copias del JSON de un workflow **antes** de modificarlo, para poder volver atrás.
Se obtienen con `GET /api/v1/workflows/{id}` usando `N8N_API_KEY` del `.env`.

## ⚠️ Regla obligatoria antes de commitear un backup

Los workflows de PRISMA tienen **secretos escritos a mano dentro de los nodos** (no como
credencial de n8n). El caso conocido es el header `Authorization: Bearer re_...` de Resend en
los nodos HTTP de `Gestion_Handoff` y `Avisar_Asesor`.

**Hay que limpiarlos antes de agregar el archivo a git:**

```bash
node -e "
const fs=require('fs'), p=process.argv[1];
const limpio=fs.readFileSync(p,'utf8').replace(/re_[A-Za-z0-9_]{20,}/g,'__RESEND_API_KEY_REMOVIDA__');
JSON.parse(limpio); fs.writeFileSync(p,limpio);
" <archivo.json>
```

Verificar siempre antes del commit:

```bash
git grep -I -E "re_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}" -- docs/interno/n8n-backups/
```

Las credenciales de Postgres y OpenAI **no** son un problema: n8n las guarda por `id` de
credencial, sin el valor.

## Si hay que restaurar un backup

El token de Resend viene reemplazado por el placeholder, así que después de restaurar hay que
volver a poner la key a mano en el nodo `Enviar_Email_Resend` (o —mejor— pasarla a una credencial
de n8n y dejar de hardcodearla). Ver TECNICO-PRISMA § 9.2.2.

## Archivos

| Archivo | Qué guarda |
|---|---|
| `Gestion_Handoff-ANTES-de-determinista-2026-07-29.json` | Versión con AI Agent interno, previa a la migración a flujo determinista. |
| `Gestion_Handoff-pre-agencyid-2026-07-29.json` | Previa a agregar `agency_id` al matcheo de `DERIVAR_CONVERSACION`. |
| `Avisar_Asesor-pre-parser-2026-07-29.json` | Previa al arreglo del capturador de `grab()`. |
