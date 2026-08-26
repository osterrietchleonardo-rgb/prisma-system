/**
 * Piso de seguridad para la voz de todo lo que escribe Marketing IA.
 *
 * Sin esto, el modelo escribe como el asesor en persona ("Yo me encargo de todo el trabajo
 * pesado") y las oficinas lo prohíben: un compromiso en primera persona del singular lo firma
 * una persona, no la inmobiliaria. La palanca para arreglarlo ya existía —la Directiva Creativa
 * que carga el director— pero solo protege a las agencias que se acordaron de cargarla.
 *
 * Es un piso, no un techo: se imprime ANTES de la Directiva Creativa, así el director puede
 * pedir lo contrario y su indicación gana.
 */
export const REGLA_VOZ = `- VOZ: escribí en primera persona del PLURAL o en impersonal ("nos encargamos", "te acompañamos", "escribinos", "coordinamos las visitas"). PROHIBIDA la primera persona del singular: nada de "yo me encargo", "me ocupo", "mi base de datos", "mi prioridad". Los datos del asesor (años, matrícula, casos, cantidad de compradores) se usan igual, pero contados desde el equipo: "con 12 años en la zona", nunca "con mis 12 años".`
