/**
 * Utility functions to prevent runtime crashes in sensitive mobile environments (iOS/Safari)
 */

export const safeFormatDate = (date: Date | string | null | undefined, options: Intl.DateTimeFormatOptions = {}): string => {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('es-AR', options)
  } catch (e) {
    console.error('Error formatting date:', e)
    return ''
  }
}

export const safeFormatTime = (date: Date | string | null | undefined, options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }): string => {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('es-AR', options)
  } catch (e) {
    console.error('Error formatting time:', e)
    return ''
  }
}

export const safeGetDayName = (date: Date | string | null | undefined): string => {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(d)
  } catch (e) {
    console.error('Error getting day name:', e)
    return ''
  }
}

export const safeUUID = (): string => {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID()
    }
  } catch (e) {}
  
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export const safeScrollIntoView = (el: HTMLElement | null, behavior: ScrollBehavior = 'auto') => {
  if (!el) return
  try {
    // Some older iOS versions crash or hang with 'smooth' behavior if layout is busy
    el.scrollIntoView({ behavior, block: 'end' })
  } catch (e) {
    try {
      // Fallback to simple scroll if options object is not supported
      el.scrollIntoView()
    } catch (err) {
      console.error('Error scrolling into view:', err)
    }
  }
}
