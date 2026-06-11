Guía de Producción: Sincronización de Catálogo Roomix a Supabase

Este documento detalla la arquitectura, el esquema de datos y el procedimiento paso a paso para extraer, almacenar y mantener sincronizado el catálogo completo de propiedades de Roomix (~179.000 listados) en una base de datos propia en Supabase, orientada a la búsqueda vectorial (IA).

1. Arquitectura del Sistema

El sistema utiliza un enfoque de Sincronización Incremental basada en Sitemaps.
En lugar de consultar a Roomix en tiempo real, se mantiene una réplica local optimizada en Supabase.

Origen de Datos: Sitemaps XML y páginas HTML Server-Rendered (Next.js) de Roomix.

Almacenamiento: PostgreSQL (Supabase) con extensión pgvector habilitada.

Frecuencia de Actualización: Diaria (Job nocturno).

Método de Extracción: Peticiones HTTP GET concurrentes controladas con parseo dual (JSON-LD + Payload RSC).

2. Esquema de Base de Datos (Supabase)

Antes de iniciar el crawler, se debe preparar la base de datos en Supabase. Se requiere habilitar la extensión vectorial.

2.1. Script de Inicialización SQL

-- 1. Habilitar extensión para embeddings (búsqueda semántica)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Crear la tabla principal de propiedades
CREATE TABLE roomix_properties (
    id VARCHAR(50) PRIMARY KEY, -- Ej: '5c386566'
    slug VARCHAR(255) NOT NULL,
    canonical_url TEXT NOT NULL,
    
    -- Datos Principales
    title TEXT,
    description TEXT,
    operation VARCHAR(20), -- 'rent' o 'sale'
    date_posted TIMESTAMPTZ,
    
    -- Precio y Oferta
    price NUMERIC,
    currency VARCHAR(10),
    availability VARCHAR(50),
    business_function VARCHAR(50),
    
    -- Características Físicas
    property_type VARCHAR(50),
    category VARCHAR(50),
    rooms INTEGER,
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_m2 NUMERIC,
    
    -- Ubicación
    address TEXT,
    neighborhood VARCHAR(100),
    country VARCHAR(10),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    
    -- Arrays
    amenities TEXT[],
    images TEXT[], -- Solo URLs del CDN
    
    -- Datos de la Inmobiliaria (Agent) renombrados para evitar conflictos
    roomix_agency_id UUID,
    roomix_agency_name VARCHAR(255),
    roomix_agency_logo TEXT,
    roomix_agency_source_url TEXT,
    
    -- Metadatos del Sistema
    lastmod TIMESTAMPTZ, -- Fecha de última modificación según el sitemap
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Vector para búsqueda semántica (Ej: OpenAI text-embedding-3-small es 1536)
    embedding vector(1536)
);

-- 3. Crear índice para búsqueda vectorial rápida (HNSW es recomendado para rendimiento)
CREATE INDEX ON roomix_properties USING hnsw (embedding vector_cosine_ops);

-- 4. Índice para agilizar la sincronización diaria
CREATE INDEX idx_roomix_properties_lastmod ON roomix_properties(lastmod);


3. Endpoints y Fuentes de Datos

3.1. Descubrimiento: Sitemaps

URLs: https://roomix.ai/properties/sitemap/0 hasta .../5

Formato: XML.

Datos clave a extraer: <loc> (URL de la propiedad) y <lastmod> (Fecha de última modificación).

3.2. Detalle de Propiedad (Extracción)

URL: https://roomix.ai/propiedad/{slug}-{id} (Extraída de <loc>).

Método: HTTP GET.

Headers Obligatorios: Accept: text/html, User-Agent: [NombreDeTuApp/1.0 Contacto:tu@email.com]

4. Procedimiento de Extracción (El Crawler)

La lógica del script/crawler debe dividirse en dos parsers distintos aplicados al mismo HTML de respuesta.

Paso 1: Extraer JSON-LD (Ficha de Propiedad)

Buscar la etiqueta <script type="application/ld+json">.
Habrá varios. Seleccionar el que contiene "@type": "RealEstateListing".
Es un JSON limpio, se puede parsear directamente con JSON.parse().

Mapeo de Variables (JSON-LD -> SQL):

name -> title

description -> description

datePosted -> date_posted

offers.price -> price

offers.priceCurrency -> currency

offers.availability -> availability

offers.businessFunction -> business_function (LeaseOut = Alquiler, Sell = Venta)

mainEntity['@type'] -> property_type

mainEntity.accommodationCategory -> category

numberOfRooms -> rooms

numberOfBedrooms -> bedrooms

numberOfBathroomsTotal -> bathrooms

floorSize.value -> area_m2

mainEntity.address.streetAddress -> address

mainEntity.address.addressLocality -> neighborhood

geo.latitude -> lat

geo.longitude -> lng

mainEntity.amenityFeature -> amenities (Array)

image -> images (Array de URLs)

Paso 2: Extraer Objeto Agent (Payload RSC)

Este objeto contiene los datos de la inmobiliaria y está inyectado en el código de React.

Buscar en el HTML crudo el string: \"agent\":{

Extraer el bloque JSON correspondiente.

Crucial: Des-escapar las comillas (reemplazar \" por ").

Parsear con JSON.parse().

Mapeo de Variables (Agent -> SQL):

_id -> roomix_agency_id (UUID estable)

name -> roomix_agency_name (Ej: "Iturregui Propiedades")

image -> roomix_agency_logo

seller_url -> roomix_agency_source_url (URL del portal origen)

Nota: Ignorar whatsapp, phone, email por requerimiento del proyecto.

5. Estrategia de Sincronización (Sync)

Para evitar sobrecargar el servidor de origen y optimizar tiempos, el proceso debe ser estrictamente incremental.

Flujo del Job Diario (Cron)

Descargar Sitemaps: Bajar los 6 archivos XML.

Parsear XML: Generar una lista en memoria de objetos { loc, lastmod }.

Comparación con Supabase:

Hacer un query a la tabla roomix_properties para traer solo los id y lastmod actuales.

Nuevas: loc que no existen en Supabase. -> Agregar a la cola de extracción.

Modificadas: loc donde el lastmod del XML es mayor al de Supabase. -> Agregar a la cola de extracción.

Eliminadas: loc que existen en Supabase pero ya no están en el XML. -> Ejecutar DELETE en Supabase.

Extracción de la Cola: Iterar la cola de Nuevas/Modificadas haciendo GET a la URL de la propiedad.

Generación de Embedding: Concatenar title, description, neighborhood y amenities. Llamar a la API de OpenAI (o similar) para obtener el vector.

Upsert en Supabase: Guardar el registro completo en la tabla roomix_properties.

6. Reglas de Concurrencia y Seguridad (Instrucciones para el Agente/Crawler)

Límites de forma obligatoria:

Full Sync Controlado: El catálogo inicial son ~179.000 propiedades. NO hacer un bucle síncrono (tardaría días) y NO lanzar peticiones sin límite (causará bloqueo de IP).

Límite de Concurrencia: Usar un pool de promesas (ej. p-limit en Node.js o asyncio.Semaphore en Python) con un máximo de 5 a 10 requests concurrentes.

Rate Limiting / Pausas: Introducir un delay (ej. 200-500ms) entre lotes de requests.

Resiliencia (Backoff): Si una URL devuelve 429 (Too Many Requests) o 500, el script debe pausar (ej. 10 segundos) y reintentar con backoff exponencial.

Checkpoints: El script debe guardar su progreso localmente (ej. un archivo JSON con los IDs procesados) para poder reanudar desde donde se quedó si el proceso falla en la descarga inicial masiva.

7. Integración con Frontend: Buscador IA

El objetivo final es consumir esta base de datos en una interfaz conversacional/búsqueda llamada "Buscador IA".

7.1 Lógica de Búsqueda (Backend)

Cuando un asesor hace una consulta, el backend debe convertir el texto en un embedding (vector) y realizar una consulta unificada de 3 niveles priorizados:

Nivel 1: Cartera propia del asesor (tabla interna).

Nivel 2: Cartera general de la inmobiliaria matriz (tabla interna).

Nivel 3 (Colaboración): Propiedades de la tabla roomix_properties.

La consulta de base de datos (pgvector) debe traer los mejores resultados ordenados por similitud (distancia de coseno), limitando los resultados para no saturar la vista.

7.2 Representación en Interfaz (UI - Tarjetas)

Las propiedades que provengan de roomix_properties deben presentarse en formato de "Tarjetas" con la siguiente estructura mínima:

Cabecera/Badge: Mostrar claramente el origen usando roomix_agency_name (ej. "Publicado por: Iturregui Propiedades"). Esto es clave para la colaboración.

Foto Principal: Mostrar la primera foto del array (images[0]).

Cuerpo Principal:

Precio: currency + price

Ubicación: neighborhood

Datos rápidos: rooms ambientes, area_m2 m².

Título truncado: title

7.3 Vista de Detalle (UI - Página Completa)

Al hacer clic sobre la tarjeta de una propiedad de colaboración (roomix_properties), el sistema debe abrir una vista de detalle (modal o nueva ruta) que muestre el esquema completo almacenado en Supabase:

Descripción completa (description).

Array completo de fotos (images).

Lista de comodidades (amenities).

Enlace al anuncio original (roomix_agency_source_url).