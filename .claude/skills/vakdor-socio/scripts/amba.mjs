/**
 * ¿La ubicacion que muestra LinkedIn cae dentro del AMBA (CABA + conurbano + La Plata)?
 *
 * POR QUE EXISTE. El 14/09/2026 Leonardo pidio enfocar el outbound en inmobiliarias de AMBA.
 * La busqueda guardada de Sales Navigator es de toda Latinoamerica y Espana: de 311 fichas del
 * pipeline, solo 38 mencionaban Argentina y apenas 3 de AMBA seguian sin contactar.
 *
 * LA TRAMPA. "Provincia de Buenos Aires" NO es AMBA: Mar del Plata, Bahia Blanca o Tandil
 * aparecen como "X, Provincia de Buenos Aires, Argentina". Por eso no alcanza con buscar
 * "Buenos Aires": se exige que la localidad de adelante sea del AMBA, o que diga CABA / Gran
 * Buenos Aires. Y "Buenos Aires, Argentina" solo vale si NO viene de "Provincia de".
 */
const LOCALIDADES = [
  'buenos aires', 'la plata', 'city bell', 'ensenada', 'berisso',
  // norte
  'vicente l[oó]pez', 'olivos', 'florida', 'munro', 'la lucila', 'san isidro', 'mart[ií]nez', 'acassuso',
  'b[eé]ccar', 'boulogne', 'victoria', 'san fernando', 'tigre', 'nordelta', 'benav[ií]dez', 'escobar',
  'pilar', 'del viso', 'malvinas argentinas', 'jos[eé] c\\. paz', 'san miguel', 'bella vista', 'mu[nñ]iz',
  'san mart[ií]n', 'villa ballester',
  // oeste
  'tres de febrero', 'caseros', 'hurlingham', 'ituzaing[oó]', 'mor[oó]n', 'castelar', 'haedo', 'merlo',
  'moreno', 'la matanza', 'san justo', 'ramos mej[ií]a',
  // sur
  'avellaneda', 'lan[uú]s', 'lomas de zamora', 'banfield', 'temperley', 'quilmes', 'bernal', 'berazategui',
  'florencio varela', 'almirante brown', 'adrogu[eé]', 'burzaco', 'esteban echeverr[ií]a', 'ezeiza', 'canning',
];

const AMBA_RE = new RegExp(
  '(ciudad aut[oó]noma de buenos aires|capital federal|\\bcaba\\b|gran buenos aires|[aá]rea metropolitana de buenos aires'
  + `|\\b(${LOCALIDADES.join('|')}),\\s*(provincia de )?buenos aires`
  + '|(?<!provincia de )\\bbuenos aires,\\s*argentina)',
  'i',
);

export const esAmba = (texto) => AMBA_RE.test(String(texto || ''));
