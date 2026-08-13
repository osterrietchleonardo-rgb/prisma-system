# Formatos y plataformas (los 3 modos)

Los tres modos son **multi-formato**. No hay un formato "correcto" fijo: depende de la plataforma.

| Destino | Dimensión | Aspecto | `--format` (A/B) |
|---|---|---|---|
| TikTok / Reels / Shorts | 1080×1920 | 9:16 vertical | `vertical` |
| Feed Instagram (cuadrado) | 1080×1080 | 1:1 | `cuadrado` |
| Feed Instagram (retrato) | 1080×1350 | 4:5 | (opcional) |
| LinkedIn / YouTube / blog | 1920×1080 | 16:9 horizontal | `horizontal` |
| Ads | lo que pida la campaña | variable | según campaña |
| Cine / 4K | 3840×2160 | 16:9 | (grade/entrega) |

## Reglas por modo

- **Modos A y B (Remotion, video de marca):** elegís el formato con `--format=vertical|horizontal|cuadrado`.
  **Si no se especifica, la skill PREGUNTA** (no asume un default). El layout se adapta solo
  (fotos con `objectFit: cover`, textos/logos escalados con el factor `unit()`).
- **Modo C (editor pro):** agnóstico total. **Default = conservar el aspecto del fuente** (no
  deforma ni recorta a la fuerza). Si pedís otro formato del que trae el fuente (ej. horizontal
  → vertical para un ad), se hace **reframe** (recorte inteligente centrado o barras, según convenga).

## Reframe horizontal → vertical (Modo C, cuando se pide)

Recorte centrado a 9:16 desde un 16:9 con ffmpeg:
`-vf "crop=ih*9/16:ih,scale=1080:1920"` (recorta a lo alto y centra). Para talking-heads donde
la cara no está centrada, ajustar el `x` del crop. Alternativa con barras (pillarbox): `scale`
+ `pad`. Es una decisión de encuadre: mirar el frame con `timeline_view.py` antes de decidir.
