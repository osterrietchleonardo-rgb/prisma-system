# Validación de la envolvente oficial contra la capa oficial GCBA 2021 — 2026-09-18

Oráculo: superficie_edificable.geojson (GCBA, 2021-05-10), medido por el controlador el 18-sep-2026. Dos controles duros deciden el resultado: (a) consistencia — 0 < m² cuerpo ≤ superficie del lote (epok) + 1; (b) ±5 % contra ORACULO_2021, donde hay dato medido (cuerpo, y basamento para CA/CM). TodoProps queda como columna informativa, sin peso en el veredicto.

| SMP | Unidad | m²/planta PRISMA | Basamento PRISMA | Oficial 2021 | Dif. oficial | m²/planta TodoProps | Dif. TodoProps | Lote m² | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| 053-050-006 | USAM | 260.8 | — | 261.9 | -0.4 % | 263 | -0.8 % | 388 | OK |
| 048-026-005 | USAM | 221.5 | — | 225.5 | -1.8 % | 241 | -8.1 % | 239 | OK |
| 042-074-028 | USAA | 268.0 | — | 269.8 | -0.7 % | 271 | -1.1 % | 275 | OK |
| 051-098-009 | USAB2 | 129.1 | — | 130.1 | -0.7 % | 131 | -1.4 % | 130 | OK |
| 042-077A-007 | CA | 299.2 | 339.5 | 311.2 / 341.2 | -3.9 % / -0.5 % | 343 | -12.8 % | 341 | OK |
| 056-068-040B | USAM | 1128.1 | — | — | — | 1134 | -0.5 % | 2161 | OK |
| 039-097-008B | CM | 322.0 | 523.3 | — | — | 854 | -62.3 % | 1295 | OK |
| 039-097-008B | CA | 293.8 | 402.6 | — | — | 854 | -65.6 % | 1295 | OK |
| 063-133-008 | USAB2 | 170.5 | — | — | — | 252 | -32.4 % | 251 | OK |
| 048-134-014d | sin envolvente | — | — | — | — | — | — | 870 | OK |
| 051-102-016a | USAB2 | 570.2 | — | — | — | — | — | 1264 | OK |
| 053-045-008 | USAB2 | 189.0 | — | — | — | 200 | -5.5 % | 200 | OK |
| 051-113-024a | USAM | 102.9 | — | — | — | 104 | -1.0 % | 104 | OK |
| 045-075-024g | USAA | 143.8 | — | — | — | 145 | -0.8 % | 144 | OK |
| 029-022-023 | USAB2 | 203.3 | — | — | — | 205 | -0.8 % | 204 | OK |
| 063-037-025 | USAB2 | 141.8 | — | — | — | 247 | -42.6 % | 284 | OK |
| 017-061-025 | USAM | 97.8 | — | — | — | 99 | -1.2 % | 98 | OK |
| 053-036-016 | USAB2 | 215.1 | — | — | — | 217 | -0.9 % | 216 | OK |
| 051-040-014 | USAA | 237.6 | — | — | — | 240 | -1.0 % | 481 | OK |
| 023-082-008 | USAA | 172.8 | — | — | — | 174 | -0.7 % | 279 | OK |
| 036-059-032 | USAB2 | 158.0 | — | — | — | 160 | -1.3 % | 159 | OK |

- 039-097-008B: TodoProps publica un solo número (854 m²) que no corresponde a ninguna de las unidades (CM, CA).

Nota: TodoProps coincide con la capa oficial en lotes cortos; en lotes profundos da más m² y en corredores publica el basamento. No es oráculo.

Fallas: 0.
