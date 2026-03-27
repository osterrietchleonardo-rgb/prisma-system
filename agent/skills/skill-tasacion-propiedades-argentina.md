# SKILL: tasacion-propiedades-argentina
# Versión: 1.0.0 | Creado: 2026-03-20 | Fuente: Investigación de mercado real 2026
# Scope: Sistema automático de tasación inmobiliaria — Argentina

---

## OBJETIVO DE ESTA SKILL

Permitir construir un sistema automático de valoración de propiedades inmobiliarias en Argentina, basado en metodología real del mercado 2026, con datos scrapeados en tiempo real de los portales líderes y algoritmos validados por el Tribunal de Tasaciones de la Nación (TTN).

---

## CONTEXTO DEL MERCADO ARGENTINO 2026

### Reglas de oro del mercado local
- Las propiedades en Argentina se expresan **siempre en dólares (USD)**.
- Existe una brecha estructural entre **precio de lista** (lo que se publica) y **precio de cierre** (lo que se paga): históricamente entre **6% y 24%** de diferencia.
- Una propiedad publicada por más de **60 días sin reserva** es señal de sobretasación.
- Los precios varían radicalmente por barrio: en CABA, Puerto Madero supera los USD 5.974/m² mientras Villa Soldati ronda los USD 1.050/m².
- El mercado opera con **inflación en pesos pero valores en dólares**: las tasaciones desactualizadas de más de 90 días son inválidas.
- La diferencia entre **precio publicado** y **precio de cierre real** es la variable más importante del sistema.

### Fuentes oficiales y de referencia
| Fuente | Dato que provee |
|--------|----------------|
| Zonaprop / Argenprop / MercadoLibre Inmuebles | Precios de lista (publicación) |
| Colegio de Escribanos CABA | Escrituras y precios de cierre reales |
| CUCICBA | Reportes trimestrales de actividad |
| Tribunal de Tasaciones de la Nación (TTN) | Normas y metodologías oficiales |
| Reporte Inmobiliario / Zonaprop Index | Índices de precio por barrio y mes |
| GCBA / IDECBA | Estadísticas oficiales por comuna |
| CESO | Informes mensuales de alquileres |

---

## METODOLOGÍAS OFICIALES (TTN + Mercado)

### 1. Método Comparativo de Mercado (ACM) — PRINCIPAL
**El más usado en Argentina. Obligatorio como método base.**

Proceso:
1. Identificar mínimo **5 comparables** en radio de 500m de la propiedad a tasar.
2. Los comparables deben ser de **los últimos 90 días** máximo.
3. Calcular precio/m² de cada comparable.
4. Aplicar **factores de homogeneización** para ajustar diferencias (ver Variables abajo).
5. Obtener rango de valor: mínimo / promedio / máximo.
6. Aplicar **descuento de brecha lista-cierre** (entre 6% y 24% según barrio y mercado).

> Regla: el precio de cierre es más relevante que el precio de lista. Priorizar datos de escrituras reales.

---

### 2. Método del Costo de Reproducción (Reposición)
**Para propiedades sin comparables o inmuebles nuevos en construcción.**

```
Valor Total = Valor Terreno + Valor Construcción - Depreciación

Valor Construcción = Superficie cubierta × Costo/m² construcción actual
Depreciación = f(antigüedad, estado de conservación)
```

Costos de referencia 2026 (Cámara Argentina de la Construcción):
- Construcción residencial estándar: USD 800–1.200/m²
- Categoría media-alta: USD 1.200–1.800/m²
- Premium / lujo: USD 1.800–2.800/m²

---

### 3. Método de Ingresos / Capitalización
**Para propiedades de inversión, locales comerciales, edificios de renta.**

```
Valor = Ingreso Neto Anual / Tasa de Capitalización

Tasa de Capitalización Argentina 2026: 4% – 7% anual en USD
(varía por zona, tipo de propiedad y riesgo)
```

Calcular:
- Alquiler bruto anual estimado
- Menos: vacancia estimada (5%–15%), expensas, impuestos
- Dividir por tasa de capitalización de mercado en la zona

---

### 4. Método Residual
**Para terrenos con potencial de desarrollo.**

```
Valor Terreno = Precio Venta Final - Costos Construcción - Honorarios - Utilidad Desarrollador
```

Requiere: Código Urbanístico, FOT (Factor de Ocupación Total), altura permitida.

---

## VARIABLES DE TASACIÓN (con peso relativo)

### Grupo A — Ubicación (impacto: hasta 40% del valor)
| Variable | Detalle |
|----------|---------|
| Barrio / Zona | Determinante principal. Ver tabla de precios por barrio. |
| Cuadra exacta | Misma calle puede variar 10–15% según cuadra |
| Orientación cardinal | Norte/Este suma valor. Sur/Oeste descuenta. |
| Cercanía a transporte | Subte, tren, metrobus: suma hasta 8% |
| Cercanía a espacios verdes | Plaza, parque en radio 200m: suma 5–10% |
| Cercanía a colegios / hospitales | Suma hasta 6% en zonas familiares |
| Nivel de ruido / contaminación | Sobre avenida principal: descuenta 5–12% |
| Seguridad del barrio | Alta demanda en zonas seguras |
| Comercios y servicios en radio 500m | Variable de conveniencia: suma hasta 5% |

### Grupo B — Edificio (impacto: hasta 20% del valor)
| Variable | Detalle |
|----------|---------|
| Antigüedad del edificio | Escalas: 0-5 años / 6-20 / 21-40 / +40 |
| Categoría constructiva | Económica / Estándar / Buena / Premium |
| Estado de conservación | Muy bueno / Bueno / Regular / Malo |
| Amenities | Pileta, gimnasio, SUM, terraza, seguridad 24h. Suma 8–15% |
| Expensas | Altas expensas descuentan valor de venta |
| Cantidad de unidades | Edificios pequeños suelen ser más valorados |
| Espacios comunes | Calidad y mantenimiento de halls, ascensores |

### Grupo C — Unidad (impacto: hasta 30% del valor)
| Variable | Detalle |
|----------|---------|
| Superficie cubierta (m²) | Variable base del cálculo |
| Superficie semicubierta / descubierta | Balcón/terraza: 40–60% del valor del m² cubierto |
| Cantidad de ambientes | 1, 2, 3, 4+ |
| Piso y vista | A mayor piso con vista, mayor valor. Sin ascensor descuenta. |
| Luminosidad | Muy valorada. Interior oscuro descuenta hasta 10% |
| Estado interior | Reformado / A reformar / Sin reformas |
| Calidad de terminaciones | Pisos, carpintería, sanitarios, cocina |
| Cochera / baulera | Cochera suma USD 8.000–25.000 según zona |
| Orientación de la unidad | Frente / Contrafrente / Lateral |

### Grupo D — Factores de Mercado (impacto: hasta 10%)
| Variable | Detalle |
|----------|---------|
| Días en mercado | +60 días = sobretasación. Negociar más agresivo. |
| Cantidad de visitas / consultas | Indicador de demanda real |
| Margen de negociación del barrio | 6%–24% según zona (ver brecha lista-cierre) |
| Contexto macroeconómico | Tipo de cambio, acceso a crédito hipotecario UVA |
| Estacionalidad | Más transacciones en primavera-verano |
| Situación legal | Libre de deudas, inhibiciones, sucesión |

---

## TABLA DE REFERENCIA — PRECIO m² POR ZONA (Enero 2026)

| Zona CABA | Rango USD/m² |
|-----------|-------------|
| Puerto Madero | USD 5.000 – 6.500 |
| Palermo, Núñez, Belgrano | USD 2.500 – 3.500 |
| Recoleta, Barrio Norte | USD 2.800 – 3.800 |
| Caballito, Colegiales, Villa Crespo | USD 2.300 – 3.200 |
| Villa Urquiza, Saavedra | USD 2.000 – 2.800 |
| Almagro, Balvanera, Chacarita | USD 1.600 – 2.200 |
| Flores, Mataderos | USD 1.400 – 1.900 |
| Villa Soldati, Lugano | USD 1.050 – 1.400 |
| **GBA Norte** (Olivos, San Isidro, Pilar) | USD 1.500 – 3.500 |
| **GBA Oeste** (Ramos Mejía, Morón) | USD 1.000 – 1.800 |
| **GBA Sur** (Quilmes, Lomas de Zamora) | USD 800 – 1.400 |

> Datos: Infobae / MercadoLibre / Zonaprop Index — Diciembre 2025 / Enero 2026.

---

## FUENTES DE DATOS — SCRAPING AUTOMÁTICO

### Portales a scrapear
| Portal | Tipo de dato | Librería recomendada |
|--------|-------------|---------------------|
| zonaprop.com.ar | Precio de lista, características | Playwright + Apify |
| argenprop.com | Precio de lista, comparables | Playwright |
| inmuebles.mercadolibre.com.ar | Precios, demanda, visitas | Apify actor |
| remax.com.ar / century21 / RE/MAX | Tasaciones publicadas | Playwright |
| todoprops.com | Simulador de referencia | API pública |
| estadisticaciudad.gob.ar | Datos oficiales GCBA | Requests + BeautifulSoup |

### Campos a extraer por propiedad comparable
```json
{
  "id": "string",
  "portal": "string",
  "tipo": "departamento | casa | PH | local | terreno",
  "operacion": "venta | alquiler",
  "ubicacion": {
    "barrio": "string",
    "calle": "string",
    "latitud": "float",
    "longitud": "float"
  },
  "superficie_cubierta": "float",
  "superficie_total": "float",
  "ambientes": "int",
  "dormitorios": "int",
  "banos": "int",
  "piso": "int",
  "antiguedad": "int",
  "amenities": ["string"],
  "cochera": "boolean",
  "precio_lista_usd": "float",
  "precio_m2_lista": "float",
  "dias_publicado": "int",
  "fecha_publicacion": "date",
  "url": "string"
}
```

### Reglas de scraping para Argentina
- Usar proxy argentino (`apifyProxyCountry: "AR"`) para evitar bloqueos
- Rate limiting: máximo 1 request/segundo por portal
- Zonaprop requiere rotación de User-Agent
- Datos con +90 días de publicación → descartar del pool de comparables
- Cruzar al menos **2 portales** para cada comparable

---

## ALGORITMO DE TASACIÓN AUTOMÁTICA

### Flujo completo
```
INPUT (datos del inmueble a tasar)
    ↓
1. GEOCODIFICACIÓN → obtener coordenadas exactas
    ↓
2. SCRAPING → extraer comparables en radio 500m (mín. 5, máx. 20)
    ↓
3. FILTRADO → descartar: +90 días publicados, outliers precio >2σ
    ↓
4. HOMOGENEIZACIÓN → aplicar factores de ajuste por diferencias
    ↓
5. CÁLCULO BASE → precio/m² promedio ponderado de comparables
    ↓
6. AJUSTES → sumar/restar según variables de la unidad y edificio
    ↓
7. CORRECCIÓN MERCADO → aplicar brecha lista-cierre del barrio
    ↓
8. OUTPUT → rango de valor: mínimo / estimado / máximo
```

### Fórmula de homogeneización
```python
precio_ajustado = precio_comparable_m2 * (
    factor_superficie *
    factor_piso *
    factor_estado *
    factor_amenities *
    factor_antiguedad *
    factor_orientacion
)
```

### Factores de ajuste (referencia)
| Factor | Valor |
|--------|-------|
| Sin ascensor (piso 3+) | × 0.92 |
| Piso alto con vista | × 1.08 – 1.15 |
| A reformar vs reformado | × 0.85 – 0.90 |
| Con cochera | + USD 12.000–20.000 fijo |
| Con amenities completos | × 1.08 – 1.15 |
| Contrafrente / oscuro | × 0.88 – 0.93 |
| Sobre avenida con ruido | × 0.93 – 0.95 |
| Antigüedad +40 años sin reforma | × 0.85 – 0.90 |

### Corrección brecha lista-cierre
```python
precio_cierre_estimado = precio_lista_calculado * (1 - brecha_barrio)

# Brechas de referencia por zona:
# Barrios premium (Palermo, Recoleta): 6% – 10%
# Barrios medios (Caballito, Villa Urquiza): 10% – 15%
# Barrios populares (Flores, Almagro): 15% – 20%
# Zonas con sobreoferta o baja demanda: hasta 24%
```

---

## OUTPUT DEL SISTEMA — INFORME DE TASACIÓN

```markdown
# Informe de Tasación — [Dirección]
Fecha: [YYYY-MM-DD] | Válido por: 90 días

## Resumen ejecutivo
- Valor estimado: USD [X.XXX] (rango: USD [X.XXX] – USD [X.XXX])
- Precio por m²: USD [X.XXX]/m²
- Metodología: Comparativo de Mercado (ACM)
- Comparables analizados: [N]

## Propiedad analizada
[Tabla con todas las variables relevadas]

## Comparables utilizados
[Tabla con los N comparables, precio y ajustes aplicados]

## Análisis de mercado local
- Días promedio en mercado (barrio): [N] días
- Brecha lista-cierre aplicada: [X]%
- Tendencia de precios (últimos 90 días): subiendo / estable / bajando

## Advertencias
- [Lista de factores que pueden afectar el valor]
- Esta tasación no reemplaza una certificación oficial del TTN
```

---

## STACK TÉCNICO RECOMENDADO

| Componente | Tecnología |
|------------|-----------|
| Scraping portales | Playwright + Apify (zonaprop actor) |
| Geocodificación | Google Maps API / Mapbox |
| Base de datos comparables | Supabase (Postgres + PostGIS para geo) |
| Cálculo del algoritmo | Python (pandas, numpy, scikit-learn) |
| API de tasación | FastAPI |
| Frontend | Next.js 15 + Tailwind v4 |
| Caché de precios | Redis (actualización diaria) |
| Programación scraping | Cron job diario 6am |

### Extensión con ML (fase 2)
- Entrenar modelo de regresión (XGBoost / Random Forest) con datos históricos de cierre
- Features: todas las variables del Grupo A, B, C y D
- Target: precio de cierre real en USD/m²
- Validar con RMSE < 8% sobre test set

---

## RESTRICCIONES Y CASOS BORDE CONOCIDOS

- **Zonaprop bloquea scraping agresivo.** Usar delays > 2s y proxy AR rotativo.
- **Precios publicados ≠ precios reales.** Nunca usar precio de lista como valor de cierre sin aplicar la brecha.
- **Propiedades con +90 días publicadas:** excluir del pool de comparables por estar sobrevaluadas.
- **Mercado muy sensible al tipo de cambio:** actualizar precios de referencia mínimo cada 30 días.
- **Inmuebles en sucesión o con deuda hipotecaria:** descuentan 10-20% adicional. Requiere verificación registral.
- **Terrenos:** usar siempre Método Residual + consultar Código Urbanístico de la jurisdicción.
- **CABA vs GBA vs Interior:** los algoritmos no son intercambiables. Cada región necesita su pool de comparables y tasa de capitalización propia.
- **Propiedades rurales / campos:** usar Método de Capitalización con tasa de arrendamiento de zona (TTN Norma 9.x).

---

## HISTORIAL DE VERSIONES
| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.0.0 | 2026-03-20 | Creación inicial — investigación de mercado real Argentina 2026 |
