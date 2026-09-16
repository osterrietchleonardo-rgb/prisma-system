import { describe, it, expect } from 'vitest'
import { esMensajeDeLaDerivacionPropia, MARCA_DERIVACION, type MensajeReciente } from './derivacion-propia'

/**
 * Lo que se protege:
 *  - el mensaje de derivación de Sofía LLEGA al cliente (antes se descartaba: Elian, 16/9);
 *  - si un asesor tomó la charla a mano, la respuesta de n8n se sigue descartando;
 *  - Sofía no sigue hablando en un turno posterior a su derivación (caso Sonia, 16/9).
 * Los mensajes van del más nuevo al más viejo, como los devuelve la consulta.
 */

const AHORA = new Date('2026-09-16T18:40:42.000Z')
const hace = (seg: number) => new Date(AHORA.getTime() - seg * 1000).toISOString()
const marca = (seg: number): MensajeReciente => ({ role: 'internal', content: `${MARCA_DERIVACION}: El bot se ha desactivado.`, created_at: hace(seg) })
const lead = (seg: number, content = 'hola'): MensajeReciente => ({ role: 'lead', content, created_at: hace(seg) })
const human = (seg: number): MensajeReciente => ({ role: 'human', content: 'Hola, soy Micaela', created_at: hace(seg) })
const bot = (seg: number): MensajeReciente => ({ role: 'bot', content: 'parte 1', created_at: hace(seg) })
const nota = (seg: number): MensajeReciente => ({ role: 'internal', content: 'llamarlo mañana', created_at: hace(seg) })

describe('esMensajeDeLaDerivacionPropia', () => {
  it('Elian (16/9): derivó hace 15 s y no escribió nadie más → el mensaje sale', () => {
    expect(esMensajeDeLaDerivacionPropia([marca(15), lead(84, 'queria consultarte si comparten comision'), lead(113, 'soy Elian')], AHORA)).toBe(true)
  })

  it('mensaje en varias partes: ya salió la parte 1, sale también la parte 2', () => {
    expect(esMensajeDeLaDerivacionPropia([bot(3), marca(20), lead(90)], AHORA)).toBe(true)
  })

  it('una nota interna del equipo entre medio no cambia nada', () => {
    expect(esMensajeDeLaDerivacionPropia([nota(5), marca(20), lead(90)], AHORA)).toBe(true)
  })

  it('el asesor apagó el bot con el botón (no hay marca) → se descarta, como siempre', () => {
    expect(esMensajeDeLaDerivacionPropia([lead(30), bot(200), lead(260)], AHORA)).toBe(false)
  })

  it('un asesor escribió después de la derivación → tomó la charla, se descarta', () => {
    expect(esMensajeDeLaDerivacionPropia([human(5), marca(20), lead(90)], AHORA)).toBe(false)
  })

  it('el cliente volvió a escribir después de la derivación → otro turno, Sofía no contesta', () => {
    expect(esMensajeDeLaDerivacionPropia([lead(10, 'hola?'), marca(40), lead(120)], AHORA)).toBe(false)
  })

  it('derivación vieja (más de 5 minutos) → se descarta', () => {
    expect(esMensajeDeLaDerivacionPropia([marca(6 * 60), lead(7 * 60)], AHORA)).toBe(false)
  })

  it('justo en el borde de los 5 minutos todavía sale', () => {
    expect(esMensajeDeLaDerivacionPropia([marca(5 * 60), lead(6 * 60)], AHORA)).toBe(true)
  })

  it('sin mensajes, fecha rota o marca de otro texto → se descarta (ante la duda, como hoy)', () => {
    expect(esMensajeDeLaDerivacionPropia([], AHORA)).toBe(false)
    expect(esMensajeDeLaDerivacionPropia([{ role: 'internal', content: `${MARCA_DERIVACION}: x`, created_at: 'no-es-fecha' }], AHORA)).toBe(false)
    expect(esMensajeDeLaDerivacionPropia([{ role: 'internal', content: 'Handoff activado sin el aviso', created_at: hace(5) }], AHORA)).toBe(false)
  })
})
