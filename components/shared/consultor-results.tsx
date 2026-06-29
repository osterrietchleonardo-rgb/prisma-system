'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'

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
  match_pct?: number   // % de coincidencia con lo pedido (ambientes + amenities + zona)

  // Source discrimination
  source: PropertySource

  // Agent/Agency info
  agent_name: string
  agent_email: string

  // Roomix-specific
  amenities?: string[]
  roomix_agency_name?: string
  roomix_agency_logo?: string | null
  roomix_agency_source_url?: string | null
  canonical_url?: string

  // Tokko-specific
  public_url?: string | null
}

export interface MatchedPropertiesResponse {
  propias: UnifiedProperty[]
  agencia: UnifiedProperty[]
  roomix: UnifiedProperty[]
}

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
  const [showDetail, setShowDetail] = useState(false)
  const images = property.images && property.images.length > 0
    ? property.images
    : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=400']

  const badge = BADGE_CONFIG[property.source]
  const border = BORDER_COLORS[property.source]

  const agentInfo = property.source === 'roomix'
    ? property.roomix_agency_name || 'Inmobiliaria colaboradora'
    : property.agent_email
      ? `${property.agent_name} — ${property.agent_email}`
      : property.agent_name || 'Sin asignar'
  const badgeLabel = `${badge.icon} ${badge.labelPrefix} | ${agentInfo}`

  return (
    <>
      <div className={`overflow-hidden rounded-2xl border ${border.base} bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm group ${border.hover} transition-all shadow-lg hover:shadow-xl relative cursor-pointer flex flex-col h-full`} onClick={() => setShowDetail(true)}>
        
        {/* Badge Superior Dinámico */}
        <div className={`absolute top-0 left-0 right-0 z-20 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-center shadow-md bg-gradient-to-r ${badge.gradient} text-white`}>
          <span className="truncate block">{badgeLabel}</span>
        </div>

        {/* Imagen Principal + Carousel */}
        <div className="relative aspect-video overflow-hidden mt-7 shrink-0">
          <img
            src={images[imgIdx]}
            alt={property.title || 'Propiedad'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />

          {/* Badge de % de coincidencia (verde = exacto, ámbar = comparable, gris = lejano) */}
          {typeof property.match_pct === 'number' && (
            <div className="absolute top-2 left-2 z-10">
              <span className={`text-white text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-full backdrop-blur-sm shadow-md ${
                property.match_pct >= 85 ? 'bg-emerald-600/90' :
                property.match_pct >= 60 ? 'bg-amber-600/90' :
                'bg-zinc-700/90'
              }`}>
                {property.match_pct}% coincidencia
              </span>
            </div>
          )}

          <div className="absolute top-2 right-2 flex gap-1 z-10">
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

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setImgIdx((imgIdx - 1 + images.length) % images.length) }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-black/50 z-10"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setImgIdx((imgIdx + 1) % images.length) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-black/50 z-10"
              >
                ›
              </button>
            </>
          )}
        </div>

        {/* Cuerpo Principal */}
        <div className="p-4 pb-2 flex-1">
          <div className="flex justify-between items-start gap-2">
            <h4 className="font-bold text-sm line-clamp-2 flex-1 leading-tight">
              {property.title || 'Sin título'}
            </h4>
            <span className={`font-bold text-sm whitespace-nowrap ${
              property.source === 'own' ? 'text-amber-600 dark:text-amber-400' :
              property.source === 'agency' ? 'text-foreground' :
              'text-blue-600 dark:text-blue-400'
            }`}>
              {property.currency} {new Intl.NumberFormat().format(property.price)}
            </span>
          </div>

          <div className="flex items-center text-[10px] text-muted-foreground gap-1 mt-2">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{property.city || property.address || 'Ubicación no especificada'}</span>
          </div>
        </div>

        {/* Datos Rápidos */}
        <div className="px-4 pt-2 pb-3 flex items-center justify-between text-[11px] font-medium text-muted-foreground border-t border-border/10 shrink-0">
          <div className="flex items-center gap-1">🛏️ {property.bedrooms || '—'} Dorm.</div>
          <div className="flex items-center gap-1">🚿 {property.bathrooms || '—'} Baños</div>
          <div className="flex items-center gap-1">📐 {property.total_area ? `${property.total_area}m²` : '—'}</div>
        </div>

        {/* Amenities (solo Roomix) */}
        {property.source === 'roomix' && property.amenities && property.amenities.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 shrink-0">
            {property.amenities.slice(0, 3).map((a) => (
              <span key={a} className="inline-flex items-center text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">
                {a}
              </span>
            ))}
            {property.amenities.length > 3 && (
              <span className="text-[9px] text-muted-foreground px-1">+{property.amenities.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {showDetail && (
        <UnifiedPropertyDetail property={property} onClose={() => setShowDetail(false)} />
      )}
    </>
  )
}

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
  const [sharing, setSharing] = useState(false)
  const images = property.images && property.images.length > 0 ? property.images : []
  const badge = BADGE_CONFIG[property.source]
  const headerGradient = DETAIL_HEADER_COLORS[property.source]

  // Genera una ficha pública de lujo (con la marca de la agencia + datos del asesor logueado) y la abre.
  const handleShare = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const res = await fetch('/api/ficha/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: property.source, id: property.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo generar la ficha')
      const url = `${window.location.origin}${data.path}`
      try { await navigator.clipboard.writeText(url) } catch { /* sin clipboard */ }
      window.open(data.path, '_blank', 'noopener')
      toast.success('Ficha lista y link copiado al portapapeles')
    } catch (e: any) {
      toast.error(e.message || 'Error al generar la ficha')
    } finally {
      setSharing(false)
    }
  }

  const agentInfo = property.source === 'roomix'
    ? property.roomix_agency_name || 'Inmobiliaria colaboradora'
    : property.agent_email
      ? `${property.agent_name} — ${property.agent_email}`
      : property.agent_name || 'Sin asignar'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header con badge dinámico */}
        <div className={`sticky top-0 z-10 bg-gradient-to-r ${headerGradient} text-white px-6 py-3 rounded-t-2xl flex items-center justify-between`}>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-80">{badge.labelPrefix}</p>
            <p className="font-bold text-sm">{agentInfo}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors focus:outline-none"
          >
            ✕
          </button>
        </div>

        {/* Galería de fotos */}
        {images.length > 0 && (
          <div className="relative bg-black">
            <img
              src={images[selectedImg]}
              alt={property.title || ''}
              className="w-full aspect-video object-contain"
            />
            {images.length > 1 && (
              <div className="flex gap-2 p-4 overflow-x-auto bg-black/90">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImg(i)}
                    className={`w-16 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                      i === selectedImg ? 'border-primary scale-105' : 'border-transparent opacity-60 hover:opacity-100'
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

          {/* Botón Compartir ficha (página pública de lujo con la marca + datos del asesor) */}
          <div className="pt-4 border-t flex justify-end">
            <button
              onClick={handleShare}
              disabled={sharing}
              className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-60"
            >
              {sharing ? 'Generando ficha…' : 'Compartir ficha'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          </div>

          {/* Acciones Footer */}
          <div className="pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {property.source === 'roomix' && property.roomix_agency_source_url ? (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Fuente: {property.roomix_agency_name}
                </p>
                <a
                  href={property.canonical_url || property.roomix_agency_source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  Ver en portal original
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {property.public_url ? 'Ficha pública' : `ID Interno: ${property.id}`}
                </p>
                <a
                  href={property.public_url || `/asesor/propiedades/${property.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  Ver Ficha Completa
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

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

  if (properties.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className={`flex items-center gap-3 px-2 py-2 border-b ${config.borderColor}`}>
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

export function ConsultorResultsSection({
  results
}: {
  results: MatchedPropertiesResponse | UnifiedProperty[]
}) {
  // Manejo de compatibilidad hacia atrás:
  // Si los resultados son un array (chats anteriores), tratarlos todos como de la "agencia"
  // para que no se rompa la UI del historial del chat.
  let propias: UnifiedProperty[] = [];
  let agencia: UnifiedProperty[] = [];
  let roomix: UnifiedProperty[] = [];

  if (Array.isArray(results)) {
    agencia = results.map(r => ({ ...r, source: 'agency', agent_name: 'Histórico', agent_email: '' } as UnifiedProperty));
  } else if (results) {
    propias = results.propias || [];
    agencia = results.agencia || [];
    roomix = results.roomix || [];
  }

  const totalCount = propias.length + agencia.length + roomix.length;

  if (totalCount === 0) return null

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-top-4 duration-700 mt-6">
      {/* Nivel 1: Propias */}
      <PropertySection source="own" properties={propias} />

      {/* Nivel 2: Agencia */}
      <PropertySection source="agency" properties={agencia} />

      {/* Nivel 3: Roomix */}
      <PropertySection source="roomix" properties={roomix} />

      {/* Footer resumen */}
      <div className="text-center pt-4 pb-2 border-t">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold">
          Mostrando {totalCount} propiedades de {
            [
              propias.length > 0 && 'cartera propia',
              agencia.length > 0 && 'agencia',
              roomix.length > 0 && 'red de colaboración',
            ].filter(Boolean).join(', ')
          }
        </p>
      </div>
    </div>
  )
}
