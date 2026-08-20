# Scripts de julio 2026 (anteriores al motor `studio.mjs`)

Vivían sueltos en `Prisma - MK\_motor-video` y se rescataron el 20-ago-2026 al unificar las dos
copias del motor. **Casi todos están reemplazados por `studio.mjs`**, que hace lo mismo en un solo
comando, con caché, tests y reporte. Se conservan porque resuelven casos puntuales y porque el
trabajo ya estaba hecho.

| Script | Qué hacía | Hoy lo hace |
|---|---|---|
| `cut.mjs`, `cut-exact.mjs`, `cut-long.mjs` | sacar silencios y cortar | `studio.mjs` (`lib/cut.mjs`) |
| `burn.mjs`, `burn-amf.mjs` | quemar subtítulos (la versión `-amf` con GPU AMD) | `studio.mjs --srt=` |
| `transcribe-srt.mjs`, `transcribe-groq.mjs` | transcribir a `.srt` (local y por Groq) | `lib/transcribe.mjs` con whisper.cpp |
| `fix-srt.mjs` | corregir tiempos de un `.srt` | — sigue siendo útil suelto |
| `compile-highlight.mjs` | armar un compilado de momentos destacados | — no tiene reemplazo todavía |
| `upload-faststart.mjs`, `test-upload-1080p.mjs` | preparar el mp4 para subir | `studio.mjs` ya deja `+faststart` |

**Ojo con `cut.mjs`:** no es el mismo archivo que `lib/cut.mjs`. Este es el script suelto de julio
(lo usa `cut-long.mjs`); el de `lib/` es el módulo del motor. Por eso viven en carpetas distintas.
