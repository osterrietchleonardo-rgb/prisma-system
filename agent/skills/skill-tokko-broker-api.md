# SKILL: tokko-broker-api
# Versión: 1.0.0 | Creado: 2026-03-20
# Fuente: developers.tokkobroker.com (documentación oficial) + investigación de integraciones reales

---

## OBJETIVO

Integrar y manipular Tokko Broker mediante API/HTTP para construir sistemas automáticos de gestión de leads, propiedades, contactos, emprendimientos y asesores. Cubre todos los endpoints funcionales, estrategias de paginación, filtros, límites y patrones de integración.

---

## AUTENTICACIÓN

### API Key
- Cada inmobiliaria tiene una **API Key única** provista por Tokko Broker.
- Se pasa como query parameter `key=<API_KEY>` en todos los requests GET.
- Para el endpoint de contacto (POST), se incluye en el body JSON.
- **Nunca exponer la API Key en frontend público.** Siempre usarla desde backend o variables de entorno.

### Playground
```
http://www.tokkobroker.com/api/playground
```
> Requiere sesión activa en Tokko Broker para acceder. Permite explorar endpoints con la API Key real.

---

## URL BASE

```
BASE_URL = "https://www.tokkobroker.com/api/v1"

# Propiedades y unidades de emprendimiento
GET {BASE_URL}/property/?format=json&key={API_KEY}&lang=es_ar

# Emprendimientos (desarrollos)
GET {BASE_URL}/development/?format=json&key={API_KEY}&lang=es_ar

# Portal simple (envío de contacto)
POST http://tokkobroker.com/portals/simple_portal/api/v1/contact/
```

### Headers recomendados
```python
headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}
```

---

## PARTE 1 — ENDPOINT: PROPIEDADES

### GET todas las propiedades
```http
GET /api/v1/property/?format=json&key={API_KEY}&lang=es_ar
```

### GET propiedad por ID
```http
GET /api/v1/property/{tokko_id}/?format=json&key={API_KEY}&lang=es_ar
```

### GET con búsqueda avanzada (search)
```http
GET /api/v1/property/search/?format=json&key={API_KEY}&lang=es_ar&data={JSON_ENCODED}
```

El parámetro `data` es un objeto JSON codificado con los filtros:

```json
{
  "current_localization_id": 0,
  "current_localization_type": "country",
  "price_from": 0,
  "price_to": 999999999,
  "operation_types": [1, 2, 3],
  "property_types": [2, 3],
  "currency": "ANY",
  "filters": []
}
```

### Parámetros de paginación y orden
```
limit=20              → max propiedades por página (recomendado: 20)
offset=0              → desplazamiento para paginación
order_by=price        → campo de ordenamiento
order=desc            → dirección: asc / desc
```

**Ejemplo paginado:**
```http
GET /api/v1/property/?format=json&key={API_KEY}&limit=20&offset=40&order_by=price&order=asc
```

### ⚠️ Límites críticos documentados
- **Máximo 1.000 propiedades por request.** Si hay más, usar `offset` para paginar.
- **Páginas recomendadas: máximo 20 propiedades.** Requests más grandes tardan más y pueden llegar a timeout.
- **Timeout del servidor: 30 segundos.** Requests que superen ese tiempo devuelven error. Solución: reducir `limit`.

### Filtros por fecha (sincronización incremental)
```http
# Propiedades modificadas/creadas desde una fecha
GET /api/v1/property/?format=json&key={API_KEY}&deleted_at__gte=2025-01-01T00:00:00

# Ordenar por última actualización (más recientes primero)
GET /api/v1/property/?format=json&key={API_KEY}&order_by=-deleted_at

# Solo unidades de emprendimiento (con desarrollo asignado)
GET /api/v1/property/?format=json&key={API_KEY}&development__isnull=false
```

### Campos que devuelve una propiedad
```json
{
  "tokko_id": 101419,
  "publication_id": "2_1_693_101419",
  "resource_uri": "/api/v1/property/101419/",
  "public_url": "https://inmobiliaria.com/propiedad/101419",
  "last_modification": "2026-01-15T10:30:00",
  "address": "San Juan 4543",
  "fake_address": "San Juan al 4500",
  "publication_title": "Departamento - Palermo",
  "type": { "id": 2, "name": "Departamento" },
  "location": {
    "id": 693,
    "name": "Palermo",
    "short_location": "Palermo, CABA",
    "full_location": "Palermo, Ciudad Autónoma de Buenos Aires, Argentina"
  },
  "operations": [
    {
      "operation_id": 1,
      "operation_type": "Sale",
      "prices": [
        { "currency": "USD", "price": 185000, "period": "" }
      ]
    }
  ],
  "room_amount": 3,
  "suite_amount": 2,
  "bathroom_amount": 1,
  "toilet_amount": 1,
  "age": 10,
  "expenses": 25000,
  "disposition": "Front",
  "orientation": "North",
  "property_condition": "Excelente",
  "parking_lot_amount": 1,
  "roofed_surface": 75,
  "semiroofed_surface": 8,
  "unroofed_surface": 0,
  "total_surface": 83,
  "geo_lat": -34.5827,
  "geo_long": -58.4232,
  "description": "Luminoso departamento...",
  "photos": [
    { "image": "https://cdn.tokkobroker.com/...", "thumb": "...", "description": "" }
  ],
  "tags": [],
  "web_price": true,
  "reference_code": "PAL-101419",
  "branch": { "id": 1, "name": "Sucursal Central" },
  "producer": { "id": 55, "name": "Juan Pérez", "email": "[email protected]" }
}
```

---

## PARTE 2 — ENDPOINT: EMPRENDIMIENTOS (DESARROLLOS)

### GET todos los emprendimientos
```http
GET /api/v1/development/?format=json&key={API_KEY}&lang=es_ar
```

### GET emprendimiento por ID
```http
GET /api/v1/development/{id}/?format=json&key={API_KEY}&lang=es_ar
```

### Filtrar por sucursal (branch)
```http
GET /api/v1/development/?format=json&key={API_KEY}&lang=es_ar&branch_id={id_branch}
```

### Emprendimientos modificados desde una fecha
```http
GET /api/v1/development/?format=json&key={API_KEY}&deleted_at__gte=2025-06-01T00:00:00
```

### ⚠️ Restricción conocida
- El endpoint `/development` **no tiene endpoint `/search`** equivalente al de properties. No se puede hacer búsqueda avanzada con objeto `data`. Usar filtros directos por query params.
- El campo `description` del desarrollo puede estar incompleto. La descripción completa puede requerir acceder a la web del CRM.

---

## PARTE 3 — ENDPOINT: CONTACTOS (LEADS)

### POST crear contacto / lead
Este es el endpoint más crítico para integración con portales y sitios web.

```http
POST http://tokkobroker.com/portals/simple_portal/api/v1/contact/
Content-Type: application/json
```

**Body completo:**
```json
{
  "publication_id": "2_1_693_101419",
  "api_key": "TU_API_KEY",
  "name": "María García",
  "mail": "[email protected]",
  "phone": "1123456789",
  "cellphone": "1123456789",
  "comment": "Me interesa la propiedad, ¿está disponible?",
  "company": "Empresa SA"
}
```

**Campos obligatorios vs opcionales:**

| Campo | Obligatorio | Descripción |
|-------|------------|-------------|
| `publication_id` | ✅ SÍ | ID de publicación de la propiedad (viene en el response del GET property) |
| `api_key` | ✅ SÍ | API Key de la inmobiliaria |
| `name` | ✅ SÍ | Nombre del contacto |
| `mail` | ✅ SÍ | Email del contacto |
| `comment` | ✅ SÍ | Mensaje / consulta |
| `phone` | ❌ NO | Teléfono fijo |
| `cellphone` | ❌ NO | Celular |
| `company` | ❌ NO | Empresa del contacto |

**Para vincular a un emprendimiento (en lugar de propiedad):**
```json
{
  "api_key": "TU_API_KEY",
  "name": "Carlos López",
  "mail": "[email protected]",
  "comment": "Consulta sobre el emprendimiento",
  "developments": [{ "id": 456 }]
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `OK` | Contacto creado exitosamente |
| `ERROR 100` | API Key inválida |
| `ERROR 200` | No hay propiedad con ese `publication_id` |
| `ERROR 201` | La empresa no tiene el portal activado |
| `ERROR 300` | Faltan argumentos obligatorios en el JSON |

> El contacto creado aparece en Tokko → Consultas. Si está activada la auto-derivación, buscar en "Asignados". Todos los contactos entran como origen "WEB" independientemente del canal real.

### Vincular contacto a múltiples propiedades
```json
{
  "api_key": "TU_API_KEY",
  "name": "Ana Martínez",
  "mail": "[email protected]",
  "comment": "Consulta por varias propiedades",
  "properties": [
    { "id": 101419 },
    { "id": 101420 }
  ]
}
```

---

## PARTE 4 — ENDPOINT: UBICACIONES

### GET lista de ubicaciones
```http
GET /api/v1/location/?format=json&key={API_KEY}&lang=es_ar
```

Devuelve la jerarquía completa: país → provincia → ciudad/partido → barrio.

```json
{
  "id": 693,
  "name": "Palermo",
  "parent": { "id": 12, "name": "Ciudad Autónoma de Buenos Aires" },
  "geo_lat": -34.5827,
  "geo_long": -58.4232,
  "full_location": "Palermo, Ciudad Autónoma de Buenos Aires, Argentina"
}
```

**Uso estratégico:** Cachear las ubicaciones localmente y actualizar 1x por semana. Evitar consultar el endpoint de ubicaciones en cada request de propiedades.

---

## PARTE 5 — ENDPOINT: FEEDBACK (WEBHOOKS SALIENTES)

Tokko puede notificar a un portal externo cuando ocurren eventos en el CRM.

```http
POST {TU_ENDPOINT_WEBHOOK}
Content-Type: application/json
```

Eventos que Tokko puede enviar:
- Propiedad publicada
- Propiedad modificada
- Propiedad despublicada / eliminada
- Precio modificado

**Body de ejemplo (propiedad modificada):**
```json
{
  "event": "property_updated",
  "publication_id": "2_1_693_101419",
  "tokko_id": 101419,
  "timestamp": "2026-03-15T14:22:00"
}
```

> Configurar desde el panel de Tokko → Configuración → Portales → Webhook URL.

---

## PARTE 6 — TIPOS DE OPERACIÓN Y PROPIEDAD (MAPEOS)

### Tipos de operación
```
1 → Venta (Sale)
2 → Alquiler (Rent)
3 → Alquiler Temporario (Temporary Rent)
```

### Tipos de propiedad
```
1  → Terreno (Land)
2  → Departamento (Apartment)
3  → Casa (House)
4  → Quinta / Casa de fin de semana (Weekend House)
5  → Oficina (Office)
6  → Amarra / Muelle (Mooring)
7  → Local Comercial (Business Premises)
8  → Edificio Comercial (Commercial Building)
9  → Cochera (Garage)
10 → Galpón / Depósito
11 → Campo
12 → Consultorio
13 → Hotel
14 → PH
15 → Fondo de Comercio
```

### Orientación
```
0 → Null
1 → Sur (South)
2 → Norte (North)
3 → Oeste (West)
4 → Este (East)
5 → Sur-Este
6 → Norte-Este
7 → Sur-Oeste
8 → Norte-Oeste
```

### Disposición
```
0 → Null
1 → Contrafrente (BackFront)
2 → Frente (Front)
3 → Interno (Internal)
4 → Lateral (Lateral)
```

### Moneda
```
USD → Dólares
ARS → Pesos argentinos
PYG → Guaraníes (Paraguay)
UYU → Pesos uruguayos
```

---

## PARTE 7 — CAMPOS DE PROPIEDAD COMPLETOS

### Información básica
| Campo API | Descripción | Tipo |
|-----------|-------------|------|
| `suite_amount` | Dormitorios | int |
| `room_amount` | Ambientes | int |
| `bathroom_amount` | Baños | int |
| `toilet_amount` | Toilettes | int |
| `situation` | Situación (habitada, vacía, etc.) | string |
| `property_condition` | Estado de conservación | string |
| `age` | Antigüedad en años | int |
| `expenses` | Expensas en ARS | int |
| `dispositions` | Disposición (Frente, Contrafrente) | string |
| `orientation` | Orientación | string |
| `floors_amount` | Pisos del edificio | int |
| `parking_lot_amount` | Cocheras | int |
| `zonification` | Restricción urbanística | string |
| `publication_title` | Título de publicación | string |
| `address` | Dirección real | string |
| `fake_address` | Dirección ficticia (para publicar) | string |

### Superficies
| Campo API | Descripción |
|-----------|-------------|
| `roofed_surface` | Superficie cubierta (m²) |
| `semiroofed_surface` | Superficie semicubierta (m²) |
| `unroofed_surface` | Superficie descubierta (m²) |
| `total_surface` | Superficie total (m²) |
| `land` | Medida del terreno |
| `land_measurement` | Unidad de medida del terreno |

### Información de la empresa / sucursal
| Campo API | Descripción |
|-----------|-------------|
| `company_name` | Nombre de la inmobiliaria |
| `branch_name` | Nombre de la sucursal |
| `branch_logo` | Logo de la sucursal / foto del asesor |
| `email` | Email público de la sucursal |
| `phone` | Teléfono de la sucursal |
| `geo_lat` / `geo_long` | Geolocalización de la sucursal |

---

## PARTE 8 — ESTRATEGIAS DE INTEGRACIÓN

### Estrategia 1: Sincronización completa inicial
Para una primera carga de toda la cartera:

```python
import requests

API_KEY = "TU_API_KEY"
BASE_URL = "https://www.tokkobroker.com/api/v1"
all_properties = []
offset = 0
limit = 20

while True:
    url = f"{BASE_URL}/property/?format=json&key={API_KEY}&lang=es_ar&limit={limit}&offset={offset}"
    response = requests.get(url, timeout=25)
    data = response.json()
    
    properties = data.get("objects", [])
    if not properties:
        break
    
    all_properties.extend(properties)
    offset += limit
    
    # Respetar rate limit
    time.sleep(0.5)

print(f"Total propiedades: {len(all_properties)}")
```

### Estrategia 2: Sincronización incremental (recomendada para producción)
Solo traer lo que cambió desde la última sync:

```python
from datetime import datetime, timedelta

last_sync = datetime.now() - timedelta(hours=6)
last_sync_str = last_sync.strftime("%Y-%m-%dT%H:%M:%S")

url = f"{BASE_URL}/property/?format=json&key={API_KEY}&deleted_at__gte={last_sync_str}&limit=20"
```

**Frecuencia recomendada:** cada 2–6 horas para propiedades activas.

### Estrategia 3: Envío de leads desde sitio web propio

```python
import requests
import json

def send_lead_to_tokko(lead_data: dict) -> dict:
    url = "http://tokkobroker.com/portals/simple_portal/api/v1/contact/"
    
    payload = {
        "api_key": "TU_API_KEY",
        "publication_id": lead_data["publication_id"],
        "name": lead_data["name"],
        "mail": lead_data["email"],
        "phone": lead_data.get("phone", ""),
        "cellphone": lead_data.get("cellphone", ""),
        "comment": lead_data.get("comment", "Consulta desde el sitio web")
    }
    
    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=10
    )
    
    return response.json()
```

### Estrategia 4: Búsqueda avanzada con filtros

```python
import json
import urllib.parse

search_data = {
    "current_localization_id": 693,      # ID de Palermo
    "current_localization_type": "division",
    "price_from": 100000,
    "price_to": 300000,
    "operation_types": [1],               # Solo venta
    "property_types": [2, 14],            # Departamento y PH
    "currency": "USD",
    "filters": [
        {"attribute": "room_amount", "operator": "gte", "value": 2},
        {"attribute": "bathroom_amount", "operator": "gte", "value": 1}
    ]
}

encoded_data = urllib.parse.quote(json.dumps(search_data))
url = f"{BASE_URL}/property/search/?format=json&key={API_KEY}&lang=es_ar&data={encoded_data}"
```

### Estrategia 5: Caching en Supabase

```sql
-- Tabla de propiedades sincronizadas
CREATE TABLE tokko_properties (
    tokko_id INTEGER PRIMARY KEY,
    publication_id TEXT UNIQUE NOT NULL,
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    last_modified TIMESTAMPTZ
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_tokko_properties_operation ON tokko_properties ((data->>'operation_type'));
CREATE INDEX idx_tokko_properties_location ON tokko_properties ((data->'location'->>'id'));
CREATE INDEX idx_tokko_properties_price ON tokko_properties ((data->'operations'->0->'prices'->0->>'price'));
```

---

## PARTE 9 — INFORMACIÓN DE ASESORES (PRODUCTORES)

Tokko no tiene un endpoint dedicado para listar asesores. La información del asesor asignado a cada propiedad viene dentro del objeto de la propiedad:

```json
"producer": {
  "id": 55,
  "name": "Juan Pérez",
  "email": "[email protected]",
  "phone": "1145678901"
}
```

**Para listar todos los asesores:** extraer y deduplicar los objetos `producer` del listado completo de propiedades. Es la única forma disponible actualmente sin acceso al CRM.

---

## PARTE 10 — IMPORTACIÓN DE PROPIEDADES AL CRM

Para importar propiedades **hacia** Tokko (no leerlas), usar el importador:

### Formato JSON de ejemplo
```json
{
  "type": "PROPERTY",
  "status": "ACTIVE",
  "operation_type": "SALE",
  "property_type": "DEPARTMENT",
  "address": "San Juan 4543, Palermo, CABA",
  "price": 185000,
  "currency": "USD",
  "roofed_surface": 75,
  "room_amount": 3,
  "suite_amount": 2,
  "bathroom_amount": 1,
  "description": "Luminoso departamento en Palermo...",
  "photos": [
    { "url": "https://...", "order": 1 }
  ]
}
```

El importador acepta JSON y XML. Verificar mapeos exactos en `developers.tokkobroker.com/docs/status_choices-1`.

---

## PARTE 11 — RESTRICCIONES Y CASOS BORDE CRÍTICOS

| Restricción | Detalle |
|-------------|---------|
| **Límite por request** | Máximo 1.000 propiedades. Usar offset siempre. |
| **Timeout** | 30 segundos. Requests lentos por listas grandes → reducir limit a 20. |
| **Rate limit** | No documentado oficialmente. Usar delay de 0.5s entre requests para evitar bloqueo. |
| **publication_id** | Es distinto del `tokko_id`. El contact endpoint usa `publication_id`, no el ID interno. |
| **Origen de contactos** | Todos entran como "WEB" en Tokko. No hay campo de origen personalizable en el endpoint básico. |
| **Sin endpoint de asesores** | No existe `/agent/` ni `/producer/`. Solo se accede a través de las propiedades. |
| **Sin endpoint de leads salientes** | Tokko no expone un endpoint GET para consultar los leads recibidos. Solo se pueden ingresar. |
| **Sin autenticación OAuth** | Solo API Key. No hay tokens de acceso temporales ni refresh tokens. |
| **Webhook configuración** | Se configura desde el panel de Tokko, no por API. Requiere acceso al CRM. |
| **Descripción de desarrollos** | El campo `description` puede ser incompleto. La descripción completa solo está disponible en la interfaz del CRM. |
| **Actualización de propiedades** | No hay endpoint PUT/PATCH para actualizar propiedades desde API. Usar el importador o el panel. |

---

## PARTE 12 — INTEGRACIÓN AVANZADA: FLUJO COMPLETO

### Flujo de captación automática de lead (AureFlow + Tokko)

```
1. Usuario consulta por WhatsApp / formulario web
       ↓
2. Bot/agente captura: nombre, email, teléfono, interés
       ↓
3. Sistema identifica la propiedad de interés → obtiene publication_id
       ↓
4. POST /contact/ → lead ingresa en Tokko como consulta WEB
       ↓
5. Tokko auto-deriva al asesor asignado a esa propiedad
       ↓
6. Sistema registra en Supabase: lead + propiedad + timestamp + canal
       ↓
7. Webhook de Tokko (si configurado) confirma la recepción
       ↓
8. Sistema inicia secuencia de nurturing (email + WhatsApp)
```

### Sincronización diaria recomendada (cron job)
```
06:00 hs → sync incremental de propiedades (modificadas en últimas 24h)
12:00 hs → sync de emprendimientos
18:00 hs → sync completa si hay discrepancias
```

---

## HISTORIAL DE VERSIONES

| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.0.0 | 2026-03-20 | Creación inicial — documentación oficial Tokko + patrones de integración real |
