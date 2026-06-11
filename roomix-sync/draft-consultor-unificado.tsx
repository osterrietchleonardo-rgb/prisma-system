// ============================================================================
// BORRADOR v2: Consultor IA con Búsqueda Vectorial Unificada (3 Niveles)
// ============================================================================
// Estructura:
//   PARTE 1 — Endpoint backend: respuesta con { propias, agencia, roomix }
//   PARTE 2 — Tipos TypeScript
//   PARTE 3 — <UnifiedPropertyCard> con badge dinámico por source
//   PARTE 4 — <UnifiedPropertyDetail> modal de detalle
//   PARTE 5 — <ConsultorResultsSection> vista de la página con 3 secciones
//
// NO es producción — es un borrador para revisar la arquitectura antes de
// integrarlo al sistema real en /api/ai/consultor/route.ts
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 1: BORRADOR DEL ENDPOINT BACKEND
// ─────────────────────────────────────────────────────────────────────────────
//
// Ubicación futura: app/api/ai/consultor/route.ts
//
// Reemplaza el bloque de búsqueda vectorial actual (líneas ~177-325)
// La respuesta pasa de devolver un solo array `matchedProperties` a devolver
// un objeto con tres arrays: `{ propias, agencia, roomix }`
//
// ```typescript
//
// // ─── Búsqueda Vectorial Unificada de 3 Niveles ─────────────────────────
//
// const queryEmbedding = await generateEmbedding(message);
// const { userId, agencyId } = await requireTenant();
//
// // Obtener el profile del usuario actual para saber su email y nombre
// const { data: currentProfile } = await supabase
//   .from('profiles')
//   .select('id, full_name, email')
//   .eq('id', userId)
//   .single();
//
// // ─── Nivel 1: Propiedades PROPIAS del asesor ─────────────────────────
// // Busca en la tabla interna `properties` donde assigned_agent_id = userId
// const { data: vectorOwn } = await supabase.rpc('match_properties', {
//   query_embedding: queryEmbedding,
//   match_threshold: 0.12,
//   match_count: 10,
//   p_agency_id: agencyId
// });
//
// // Enriquecer con datos completos y filtrar solo las propias
// let propias: any[] = [];
// if (vectorOwn && vectorOwn.length > 0) {
//   const { data: enrichedOwn } = await supabase
//     .from('properties')
//     .select(FULL_SELECT)
//     .in('id', vectorOwn.map((p: any) => p.id))
//     .eq('assigned_agent_id', userId);
//
//   const simMap = new Map(vectorOwn.map((p: any) => [p.id, p.similarity]));
//   propias = (enrichedOwn || []).map(p => ({
//     ...p,
//     source: 'own' as const,
//     similarity: simMap.get(p.id) || 0,
//     agent_name: currentProfile?.full_name || '',
//     agent_email: currentProfile?.email || '',
//   })).slice(0, 10);
// }
//
// // ─── Nivel 2: Cartera GENERAL de la agencia (excluye propias) ────────
// const { data: vectorAgency } = await supabase.rpc('match_properties', {
//   query_embedding: queryEmbedding,
//   match_threshold: 0.12,
//   match_count: 15,  // Pedir más para compensar el filtro de exclusión
//   p_agency_id: agencyId
// });
//
// let agencia: any[] = [];
// if (vectorAgency && vectorAgency.length > 0) {
//   const ownIds = new Set(propias.map(p => p.id));
//   const agencyIds = vectorAgency
//     .filter((p: any) => !ownIds.has(p.id))
//     .map((p: any) => p.id);
//
//   if (agencyIds.length > 0) {
//     const { data: enrichedAgency } = await supabase
//       .from('properties')
//       .select(`${FULL_SELECT}, assigned_agent:profiles!assigned_agent_id(full_name, email)`)
//       .in('id', agencyIds)
//       .neq('assigned_agent_id', userId);  // Excluir propias
//
//     const simMap = new Map(vectorAgency.map((p: any) => [p.id, p.similarity]));
//     agencia = (enrichedAgency || []).map(p => ({
//       ...p,
//       source: 'agency' as const,
//       similarity: simMap.get(p.id) || 0,
//       agent_name: (p as any).assigned_agent?.full_name || 'Sin asignar',
//       agent_email: (p as any).assigned_agent?.email || '',
//     })).slice(0, 10);
//   }
// }
//
// // ─── Nivel 3: Red de Colaboración (Roomix) ──────────────────────────
// const { data: roomixProps } = await supabase.rpc('match_roomix_properties', {
//   query_embedding: queryEmbedding,
//   match_threshold: 0.15,
//   match_count: 10
// });
//
// const roomix = (roomixProps || []).map((rp: any) => ({
//   id: `roomix_${rp.id}`,
//   title: rp.title,
//   address: rp.address || rp.neighborhood || '',
//   city: rp.neighborhood,
//   price: rp.price ? Number(rp.price) : 0,
//   currency: rp.currency || 'USD',
//   property_type: rp.property_type || '',
//   status: rp.operation === 'rent' ? 'Alquiler' : 'Venta',
//   bedrooms: rp.bedrooms || rp.rooms || 0,
//   bathrooms: rp.bathrooms || 0,
//   total_area: rp.area_m2 ? Number(rp.area_m2) : 0,
//   images: rp.images || [],
//   description: rp.description || '',
//   amenities: rp.amenities || [],
//   similarity: rp.similarity || 0,
//   source: 'roomix' as const,
//   roomix_agency_name: rp.roomix_agency_name || 'Inmobiliaria colaboradora',
//   roomix_agency_logo: rp.roomix_agency_logo,
//   roomix_agency_source_url: rp.roomix_agency_source_url,
//   canonical_url: rp.canonical_url,
//   agent_name: rp.roomix_agency_name || 'Inmobiliaria colaboradora',
//   agent_email: '',
// })).slice(0, 10);
//
// // ─── Contexto para el LLM ────────────────────────────────────────────
// const totalResults = propias.length + agencia.length + roomix.length;
// propertyContext = totalResults > 0
//   ? `Se encontraron ${totalResults} propiedades (${propias.length} propias, ${agencia.length} de la agencia, ${roomix.length} de colaboración Roomix). Se muestran como tarjetas agrupadas en 3 secciones en la UI. Respondé con un resumen MUY BREVE.`
//   : `No se encontraron propiedades con esos criterios. Explicá y sugerí alternativas.`;
//
// // ─── Respuesta ───────────────────────────────────────────────────────
// return NextResponse.json({
//   content: assistantContent,
//   reply: assistantContent,
//   sessionId: currentSessionId,
//   matchedProperties: {
//     propias,
//     agencia,
//     roomix
//   }
// });
//
// ```

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 2: TIPOS TYPESCRIPT
// ─────────────────────────────────────────────────────────────────────────────

'use client'

import React, { useState } from 'react'

export type PropertySource = 'own' | 'agency' | 'roomix'

export interface UnifiedProperty {
  id: string
  title: string | null
  description: string | null
  price: number
  currency: string
  property_type: string
  status: string
  bedrooms: number
  bathrooms: number
  total_area: number
  address: string | null
  city?: string | null
  images: string[]
  similarity: number

  // Source discrimination
  source: PropertySource

  // Agent/Agency info (populated differently per source)
  agent_name: string
  agent_email: string

  // Roomix-specific (only when source === 'roomix')
  amenities?: string[]
  roomix_agency_name?: string
  roomix_agency_logo?: string | null
  roomix_agency_source_url?: string | null
  canonical_url?: string
}

export interface MatchedPropertiesResponse {
  propias: UnifiedProperty[]
  agencia: UnifiedProperty[]
  roomix: UnifiedProperty[]
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 3: COMPONENTE <UnifiedPropertyCard>
// ─────────────────────────────────────────────────────────────────────────────
//
// Ubicación futura: components/unified-property-card.tsx
// Reemplaza al <RoomixPropertyCard> anterior.
// Recibe la propiedad y su `source` para cambiar dinámicamente el badge.

const BADGE_CONFIG: Record<PropertySource, {
  gradient: string
  icon: string
  labelPrefix: string
}> = {
  own: {
    gradient: 'from-amber-500 to-orange-600',
    icon: '✨',
    labelPrefix: 'Mis Propiedades',
  },
  agency: {
    gradient: 'from-zinc-700 to-zinc-900',
    icon: '🏢',
    labelPrefix: 'Cartera General',
  },
  roomix: {
    gradient: 'from-blue-600 to-indigo-600',
    icon: '⚡',
    labelPrefix: 'Red de Colaboración',
  },
}

const BORDER_COLORS: Record<PropertySource, { base: string; hover: string }> = {
  own:    { base: 'border-amber-500/20', hover: 'hover:border-amber-500/40' },
  agency: { base: 'border-zinc-500/20',  hover: 'hover:border-zinc-500/40' },
  roomix: { base: 'border-blue-500/20',  hover: 'hover:border-blue-500/40' },
}

export function UnifiedPropertyCard({ property }: { property: UnifiedProperty }) {
  const [imgIdx, setImgIdx] = useState(0)
  const images = property.images && property.images.length > 0
    ? property.images
    : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=400']

  const badge = BADGE_CONFIG[property.source]
  const border = BORDER_COLORS[property.source]

  // Build badge label: "Prefix | Agent Info"
  const agentInfo = property.source === 'roomix'
    ? property.roomix_agency_name || 'Inmobiliaria colaboradora'
    : property.agent_email
      ? `${property.agent_name} — ${property.agent_email}`
      : property.agent_name || 'Sin asignar'
  const badgeLabel = `${badge.icon} ${badge.labelPrefix} | ${agentInfo}`

  return (
    <div className={`overflow-hidden rounded-2xl border ${border.base} bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm group ${border.hover} transition-all shadow-lg hover:shadow-xl relative`}>

      {/* ─── Badge Superior Dinámico ───────────────────────────────── */}
      <div className={`absolute top-0 left-0 right-0 z-20 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-center shadow-md bg-gradient-to-r ${badge.gradient} text-white`}>
        <span className="truncate block">{badgeLabel}</span>
      </div>

      {/* ─── Imagen Principal + Carousel ──────────────────────────── */}
      <div className="relative aspect-video overflow-hidden mt-7">
        <img
          src={images[imgIdx]}
          alt={property.title || 'Propiedad'}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {/* Badges de estado */}
        <div className="absolute top-2 right-2 flex gap-1">
          <span className="bg-black/60 text-white text-[8px] uppercase px-2 py-0.5 rounded-full font-semibold backdrop-blur-sm">
            {property.status}
          </span>
          {property.property_type && (
            <span className={`text-white text-[8px] uppercase px-2 py-0.5 rounded-full font-semibold backdrop-blur-sm ${
              property.source === 'own' ? 'bg-amber-600/80' :
              property.source === 'agency' ? 'bg-zinc-600/80' :
              'bg-blue-600/80'
            }`}>
              {property.property_type}
            </span>
          )}
        </div>

        {/* Navegación de fotos */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setImgIdx((imgIdx - 1 + images.length) % images.length) }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
            >
              ‹
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setImgIdx((imgIdx + 1) % images.length) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
            >
              ›
            </button>
            {/* Indicador de posición */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.slice(0, 5).map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === imgIdx ? 'bg-white scale-125' : 'bg-white/40'}`} />
              ))}
              {images.length > 5 && <span className="text-white/60 text-[8px] ml-1">+{images.length - 5}</span>}
            </div>
          </>
        )}
      </div>

      {/* ─── Cuerpo Principal ─────────────────────────────────────── */}
      <div className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <h4 className="font-bold text-sm line-clamp-1 flex-1">
            {property.title || 'Sin título'}
          </h4>
          <span className={`font-bold text-sm whitespace-nowrap ml-2 ${
            property.source === 'own' ? 'text-amber-600 dark:text-amber-400' :
            property.source === 'agency' ? 'text-foreground' :
            'text-blue-600 dark:text-blue-400'
          }`}>
            {property.currency} {new Intl.NumberFormat().format(property.price)}
          </span>
        </div>

        <div className="flex items-center text-[10px] text-muted-foreground gap-1 mt-1">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate">{property.city || property.address || 'Ubicación no especificada'}</span>
        </div>
      </div>

      {/* ─── Datos Rápidos ────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground border-b border-border/10">
        <div className="flex items-center gap-1">🛏️ {property.bedrooms || '—'} Dorm.</div>
        <div className="flex items-center gap-1">🚿 {property.bathrooms || '—'} Baños</div>
        <div className="flex items-center gap-1">📐 {property.total_area ? `${property.total_area}m²` : '—'}</div>
      </div>

      {/* ─── Amenities (solo Roomix) ──────────────────────────────── */}
      {property.source === 'roomix' && property.amenities && property.amenities.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-1.5">
          {property.amenities.slice(0, 4).map((a) => (
            <span key={a} className="inline-flex items-center text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">
              {a}
            </span>
          ))}
          {property.amenities.length > 4 && (
            <span className="text-[10px] text-muted-foreground px-1">+{property.amenities.length - 4}</span>
          )}
        </div>
      )}

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <div className="p-3 bg-muted/5 transition-colors group-hover:bg-accent/5">
        {property.source === 'roomix' ? (
          <a
            href={property.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1"
          >
            Ver Detalle Completo
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <a
            href={`/asesor/propiedades/${property.id}`}
            target="_blank"
            className="w-full flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-accent transition-colors py-1"
          >
            Ver Ficha Completa
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 4: MODAL DE DETALLE — <UnifiedPropertyDetail>
// ─────────────────────────────────────────────────────────────────────────────

const DETAIL_HEADER_COLORS: Record<PropertySource, string> = {
  own:    'from-amber-500 to-orange-600',
  agency: 'from-zinc-700 to-zinc-900',
  roomix: 'from-blue-600 to-indigo-600',
}

export function UnifiedPropertyDetail({
  property,
  onClose
}: {
  property: UnifiedProperty
  onClose: () => void
}) {
  const [selectedImg, setSelectedImg] = useState(0)
  const images = property.images && property.images.length > 0 ? property.images : []
  const badge = BADGE_CONFIG[property.source]
  const headerGradient = DETAIL_HEADER_COLORS[property.source]

  const agentInfo = property.source === 'roomix'
    ? property.roomix_agency_name || 'Inmobiliaria colaboradora'
    : property.agent_email
      ? `${property.agent_name} — ${property.agent_email}`
      : property.agent_name || 'Sin asignar'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border">

        {/* Header con badge dinámico */}
        <div className={`sticky top-0 z-10 bg-gradient-to-r ${headerGradient} text-white px-6 py-3 rounded-t-2xl flex items-center justify-between`}>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-80">{badge.labelPrefix}</p>
            <p className="font-bold text-sm">{agentInfo}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Galería de fotos */}
        {images.length > 0 && (
          <div className="relative">
            <img
              src={images[selectedImg]}
              alt={property.title || ''}
              className="w-full aspect-video object-cover"
            />
            {images.length > 1 && (
              <div className="flex gap-2 p-4 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImg(i)}
                    className={`w-16 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                      i === selectedImg ? 'border-accent scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contenido */}
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold">{property.title}</h2>
            <p className="text-muted-foreground text-sm mt-1">📍 {property.city || property.address}</p>
            <p className={`text-2xl font-bold mt-2 ${
              property.source === 'own' ? 'text-amber-600 dark:text-amber-400' :
              property.source === 'agency' ? 'text-foreground' :
              'text-blue-600 dark:text-blue-400'
            }`}>
              {property.currency} {new Intl.NumberFormat().format(property.price)}
            </p>
          </div>

          {/* Datos rápidos */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-xl">
            <div className="text-center">
              <p className="text-lg font-bold">{property.bedrooms || '—'}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Dormitorios</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{property.bathrooms || '—'}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Baños</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{property.total_area || '—'}</p>
              <p className="text-[10px] text-muted-foreground uppercase">m²</p>
            </div>
          </div>

          {/* Descripción */}
          {property.description && (
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2">Descripción</h3>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{property.description}</p>
            </div>
          )}

          {/* Amenities (Roomix) */}
          {property.source === 'roomix' && property.amenities && property.amenities.length > 0 && (
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2">Comodidades</h3>
              <div className="flex flex-wrap gap-2">
                {property.amenities.map((a) => (
                  <span key={a} className="inline-flex items-center text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full font-medium">
                    ✓ {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Enlace al origen (Roomix) */}
          {property.source === 'roomix' && property.roomix_agency_source_url && (
            <div className="pt-4 border-t flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Fuente: {property.roomix_agency_name}
              </p>
              <a
                href={property.roomix_agency_source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                Ver en portal original
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 5: SECCIÓN DE RESULTADOS — <ConsultorResultsSection>
// ─────────────────────────────────────────────────────────────────────────────
//
// Ubicación futura: dentro de app/asesor/consultor-ia/page.tsx
// Reemplaza el bloque de renderizado de tarjetas (líneas ~443-524 actuales)
// Se usa en lugar del map directo sobre matchedProperties

const SECTION_CONFIG: Record<PropertySource, {
  title: string
  subtitle: string
  emptyMessage: string
  accentColor: string
  borderColor: string
  iconBg: string
}> = {
  own: {
    title: 'Tus propiedades coincidentes',
    subtitle: 'Resultados de tu cartera personal asignada',
    emptyMessage: 'No se encontraron propiedades propias con esos criterios',
    accentColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-500/20',
    iconBg: 'bg-amber-500/10',
  },
  agency: {
    title: 'Cartera de la agencia',
    subtitle: 'Propiedades de otros asesores en tu inmobiliaria',
    emptyMessage: 'No hay propiedades adicionales de la agencia',
    accentColor: 'text-zinc-600 dark:text-zinc-300',
    borderColor: 'border-zinc-500/20',
    iconBg: 'bg-zinc-500/10',
  },
  roomix: {
    title: 'Red de colaboración',
    subtitle: 'Propiedades disponibles en la red Roomix de otras inmobiliarias',
    emptyMessage: 'No se encontraron propiedades de colaboración',
    accentColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/20',
    iconBg: 'bg-blue-500/10',
  },
}

const SECTION_ICONS: Record<PropertySource, React.ReactNode> = {
  own: <span className="text-lg">✨</span>,
  agency: <span className="text-lg">🏢</span>,
  roomix: <span className="text-lg">⚡</span>,
}

function PropertySection({
  source,
  properties,
}: {
  source: PropertySource
  properties: UnifiedProperty[]
}) {
  const config = SECTION_CONFIG[source]

  // Don't render section if empty
  if (properties.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className={`flex items-center gap-3 px-1 py-2 border-b ${config.borderColor}`}>
        <div className={`w-8 h-8 rounded-xl ${config.iconBg} flex items-center justify-center`}>
          {SECTION_ICONS[source]}
        </div>
        <div>
          <h3 className={`text-sm font-bold uppercase tracking-wider ${config.accentColor}`}>
            {config.title}
          </h3>
          <p className="text-[10px] text-muted-foreground">{config.subtitle}</p>
        </div>
        <span className={`ml-auto text-[10px] font-bold ${config.accentColor} bg-background border ${config.borderColor} px-2 py-0.5 rounded-full`}>
          {properties.length} resultado{properties.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {properties.map((prop) => (
          <UnifiedPropertyCard key={prop.id} property={prop} />
        ))}
      </div>
    </div>
  )
}

/**
 * Main component to render the 3-level unified search results.
 *
 * Usage in consultor-ia/page.tsx:
 *
 * ```tsx
 * {message.matchedProperties && (
 *   <ConsultorResultsSection results={message.matchedProperties} />
 * )}
 * ```
 */
export function ConsultorResultsSection({
  results
}: {
  results: MatchedPropertiesResponse
}) {
  const totalCount = results.propias.length + results.agencia.length + results.roomix.length

  if (totalCount === 0) return null

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-top-4 duration-700 mt-4">
      {/* Nivel 1: Propias */}
      <PropertySection source="own" properties={results.propias} />

      {/* Nivel 2: Agencia */}
      <PropertySection source="agency" properties={results.agencia} />

      {/* Nivel 3: Roomix */}
      <PropertySection source="roomix" properties={results.roomix} />

      {/* Footer resumen */}
      <div className="text-center py-2">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
          Mostrando {totalCount} propiedades de {
            [
              results.propias.length > 0 && 'cartera propia',
              results.agencia.length > 0 && 'agencia',
              results.roomix.length > 0 && 'red de colaboración',
            ].filter(Boolean).join(', ')
          }
        </p>
      </div>
    </div>
  )
}
