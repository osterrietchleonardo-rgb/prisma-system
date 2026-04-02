/**
 * Replaces all {{PLACEHOLDER}} tokens in a template body with form data values.
 */
export function interpolateTemplate(
  templateBody: string,
  formData: Record<string, string | number>
): string {
  return templateBody.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
    const value = formData[key]
    if (value !== undefined && value !== null && value !== '') {
      return String(value)
    }
    return match // Leave placeholder if no value
  })
}

/**
 * Extracts all {{PLACEHOLDER}} tokens from a template body.
 */
export function extractPlaceholders(templateBody: string): string[] {
  const matches = templateBody.match(/\{\{([A-Z_]+)\}\}/g)
  if (!matches) return []
  const unique = new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))
  return Array.from(unique)
}

/**
 * Highlights placeholders in template text for preview display (returns HTML).
 */
export function highlightPlaceholders(templateBody: string): string {
  return templateBody.replace(
    /\{\{([A-Z_]+)\}\}/g,
    '<span class="placeholder-highlight" style="background-color: rgba(184, 115, 51, 0.2); color: #b87333; font-weight: 600; padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(184, 115, 51, 0.3);">{{$1}}</span>'
  )
}

/**
 * Checks which required placeholders are missing from the form data.
 */
export function getMissingPlaceholders(
  templateBody: string,
  formData: Record<string, string | number>
): string[] {
  const placeholders = extractPlaceholders(templateBody)
  return placeholders.filter(p => {
    const val = formData[p]
    return val === undefined || val === null || val === ''
  })
}
