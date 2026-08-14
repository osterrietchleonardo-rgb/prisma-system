// lib/guion.mjs — el analista de guion. Lee la transcripcion con tiempos por
// palabra y devuelve un MAPA del video: dónde están los golpes, los datos, el
// gancho y el remate, más las muletillas candidatas.
//
// Por que existe: sin esto, decidir dónde va cada gráfico es improvisacion, y la
// improvisacion no se puede repetir ni auditar. Esto no reemplaza el criterio
// humano -- lo alimenta. Devuelve candidatos con su razon; la decision de que
// entra al video sigue siendo de quien edita.
//
// NO decide el copy. El texto de cada placa se escribe leyendo lo que la persona
// dijo, no rellenando una plantilla.
//
// LIMITE CONOCIDO, medido con dos videos reales: la calidad del analisis depende
// de si la transcripcion trae puntuacion. Groq a veces devuelve el texto entero
// sin un solo punto. Cuando eso pasa, los beats se cortan por la pausa mas grande
// que haya y quedan a mitad de frase ("Ahora es 5 vendedores o un"), asi que la
// propuesta sirve para ORIENTARSE pero no para copiar y pegar. Con puntuacion, en
// cambio, la propuesta coincidio con las decisiones tomadas a mano.

const SIN_ACENTOS = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const LIMPIA = (s) => SIN_ACENTOS(s).replace(/[^a-z0-9%]/g, "");

/** Muletillas del español rioplatense. Solo se REPORTAN, nunca se cortan solas. */
export const MULETILLAS = [
  "eh", "este", "esto", "osea", "digamos", "viste", "bueno", "tipo", "nada",
  "obviamente", "basicamente", "literal", "ponele", "entonces",
];

/** Marcadores de contraste: casi siempre anuncian la frase que carga el mensaje. */
const CONTRASTE = ["pero", "sino", "aunque", "igual", "encima", "ahora"];

/** Marcadores de conclusion: lo que viene despues suele ser la tesis. */
const CONCLUSION = ["entonces", "asi", "por eso", "la clave", "la unica", "lo que"];

/**
 * Parte el texto en BEATS: bloques separados por las pausas largas de verdad.
 *
 * Se usa la pausa y no la puntuacion porque la puntuacion de whisper es
 * inventada -- pone puntos donde no los hay y se los come donde si. La pausa,
 * en cambio, la hizo la persona: es donde de verdad respiro y cambio de idea.
 */
export function partirEnBeats(palabras, { pausaSeg = 0.55, maxSeg = 6 } = {}) {
  const armar = (ws) => ({
    desde: ws[0].inicioSec,
    hasta: ws.at(-1).finSec ?? ws.at(-1).inicioSec,
    texto: ws.map((w) => w.texto).join(" "),
    palabras: ws,
  });

  // 1) cortar por las pausas de verdad
  const gruesos = [];
  let actual = [];
  for (let i = 0; i < palabras.length; i++) {
    actual.push(palabras[i]);
    const sig = palabras[i + 1];
    const fin = palabras[i].finSec ?? palabras[i].inicioSec;
    if (!sig || sig.inicioSec - fin >= pausaSeg) { gruesos.push(armar(actual)); actual = []; }
  }

  // 2) los bloques largos se subdividen. Tres criterios, en orden:
  //
  //    a) punto final. La puntuacion de whisper es poco confiable y por eso no
  //       es el corte principal, pero cuando alguien habla 13 segundos seguidos
  //       un beat de 13 segundos no sirve para nada.
  //    b) si NO hay puntuacion (pasa: whisper a veces devuelve el texto entero
  //       sin un solo punto), se parte por la pausa mas grande que haya adentro,
  //       aunque sea corta, y se repite hasta que todos los trozos entren.
  //    c) tope de seguridad por cantidad de palabras, para que un audio sin
  //       pausas ni puntuacion no devuelva igual un bloque inservible.
  const cabe = (b) => b.hasta - b.desde <= maxSeg;

  // MIN_PALABRAS es el piso: sin el, la recursion sigue partiendo hasta dejar
  // trozos de dos palabras ("que 5", "el 80%") que puntuan alto por ser cortos
  // y tener un numero, pero no son una frase ni sirven para nada.
  const MIN_PALABRAS = 6;

  const porPausaMasGrande = (ws) => {
    if (ws.length < MIN_PALABRAS * 2) return [armar(ws)];
    let mejor = -1, mayor = -1;
    for (let i = MIN_PALABRAS; i <= ws.length - MIN_PALABRAS; i++) {
      const g = ws[i].inicioSec - (ws[i - 1].finSec ?? ws[i - 1].inicioSec);
      if (g > mayor) { mayor = g; mejor = i; }
    }
    if (mejor < 0) return [armar(ws)];
    const partir = (t) => (cabe(armar(t)) ? [armar(t)] : porPausaMasGrande(t));
    return [...partir(ws.slice(0, mejor)), ...partir(ws.slice(mejor))];
  };

  const beats = [];
  for (const g of gruesos) {
    if (cabe(g)) { beats.push(g); continue; }

    const conPunto = [];
    let trozo = [];
    for (const w of g.palabras) {
      trozo.push(w);
      if (/[.?!]$/.test(w.texto) && trozo.length >= 3) { conPunto.push(armar(trozo)); trozo = []; }
    }
    if (trozo.length) conPunto.push(armar(trozo));

    for (const c of conPunto) {
      if (cabe(c)) beats.push(c);
      else beats.push(...porPausaMasGrande(c.palabras));
    }
  }
  return beats;
}

/** Numeros, porcentajes y cantidades: son el argumento, no un adorno. */
export function buscarDatos(palabras) {
  return palabras
    .filter((w) => /^\d+([.,]\d+)?%?$/.test(LIMPIA(w.texto)))
    .map((w) => ({
      valor: w.texto.replace(/[^\d.,%]/g, ""),
      segundo: w.inicioSec,
      contexto: null, // lo completa analizarGuion
    }));
}

/**
 * Puntua cada beat por cuanto "pega". No es magia: son señales que en la
 * practica coinciden con la frase que uno subrayaria al leer la transcripcion.
 */
function puntuarBeat(beat, i, total) {
  let p = 0;
  const t = SIN_ACENTOS(beat.texto);
  const n = beat.palabras.length;

  // Demasiado corto no es "contundente", es un fragmento suelto.
  if (n < 4) return -1;

  // Corto y contundente. Las frases que pegan son cortas.
  if (n <= 8) p += 2;
  else if (n <= 12) p += 1;
  else if (n > 20) p -= 1;

  // Tiene un numero: el dato ES el argumento.
  if (beat.palabras.some((w) => /^\d+([.,]\d+)?%?$/.test(LIMPIA(w.texto)))) p += 2;

  // Estructura de contraste ("eso no es X, es Y"): el patron mas fuerte que hay.
  if (/\bno es\b.*\bes\b/.test(t) || /\bno\b.*\bsino\b/.test(t)) p += 3;
  if (CONTRASTE.some((c) => t.startsWith(c + " "))) p += 1;
  if (CONCLUSION.some((c) => t.includes(c + " "))) p += 1;

  // Una pregunta directa interpela.
  if (/\?/.test(beat.texto)) p += 2;

  // Posicion: la apertura y el remate pesan mas.
  if (i === 0) p += 1;
  if (i >= total - 2) p += 1;

  return p;
}

/**
 * Analiza la transcripcion y devuelve el mapa del video.
 *
 * `beats`        bloques separados por pausas reales
 * `datos`        numeros con su segundo y su frase
 * `fuertes`      beats ordenados por cuanto pegan (candidatos a placa)
 * `enumeraciones` beats con 3+ items separados por coma (candidatos a panel)
 * `muletillas`   candidatas, SOLO para reportar
 * `sugerencias`  propuesta de dónde poner que, con la razon de cada una
 */
export function analizarGuion(palabras, { duracion, pausaSeg = 0.55 } = {}) {
  const beats = partirEnBeats(palabras, { pausaSeg });
  const total = beats.length;

  const conPuntaje = beats
    .map((b, i) => ({ ...b, i, puntaje: puntuarBeat(b, i, total) }))
    .sort((a, b) => b.puntaje - a.puntaje);

  const datos = buscarDatos(palabras).map((d) => {
    const b = beats.find((x) => d.segundo >= x.desde && d.segundo <= x.hasta);
    return { ...d, contexto: b?.texto ?? null };
  });

  // Enumeracion de VERDAD: se parte por comas y por " y ", y tienen que quedar
  // 3 o mas items con sustancia. Contar comas sueltas daba falsos positivos como
  // "Te dicen, fue un buen mes y punto", que no enumera nada.
  const enumeraciones = beats.filter((b) => {
    const items = b.texto.split(/,|\sy\s/i).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2);
    return items.length >= 3;
  });

  const muletillas = palabras
    .filter((w) => MULETILLAS.includes(LIMPIA(w.texto)))
    .map((w) => ({ palabra: w.texto, segundo: w.inicioSec }));

  // Un contraste puede quedar partido en dos beats seguidos ("Eso no es una
  // empresa." + "Eso es jugar al casino."). Suelto, ninguno de los dos puntua
  // alto; juntos son la mejor linea del video. Por eso se evaluan los PARES.
  const pares = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const a = beats[i], b = beats[i + 1];
    const junto = String(a.texto + " " + b.texto)
      .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const hayContraste = /no es[\s\S]*\bes\b/.test(junto) || /\bno\b[\s\S]*\bsino\b/.test(junto);
    const cortos = a.palabras.length + b.palabras.length <= 16;
    if (hayContraste && cortos && b.desde - a.hasta < 1.2) {
      pares.push({
        desde: a.desde, hasta: b.hasta,
        texto: `${a.texto} ${b.texto}`,
        puntaje: puntuarBeat({ texto: a.texto + " " + b.texto, palabras: [...a.palabras, ...b.palabras] }, 0, total) + 1,
        esPar: true,
      });
    }
  }

  const candidatos = [...pares, ...conPuntaje].sort((a, b) => b.puntaje - a.puntaje);

  const sugerencias = [];
  const fuerte = candidatos[0];
  if (fuerte) {
    sugerencias.push({
      tipo: "placa",
      desde: fuerte.desde, hasta: fuerte.hasta + 0.6,
      razon: `${fuerte.esPar ? "contraste partido en dos frases" : "el beat con mas fuerza"} (puntaje ${fuerte.puntaje}): "${fuerte.texto}"`,
    });
  }
  for (const e of enumeraciones.slice(0, 2)) {
    sugerencias.push({
      tipo: "panel",
      desde: e.desde - 0.2, hasta: e.hasta + 0.4,
      razon: `enumera varios items, es informacion para mostrar: "${e.texto}"`,
    });
  }
  for (const d of datos.slice(0, 3)) {
    sugerencias.push({
      tipo: "dato",
      desde: d.segundo - 0.2, hasta: d.segundo + 2.4,
      razon: `el numero ${d.valor} es el argumento: "${d.contexto}"`,
    });
  }

  return {
    duracion,
    beats,
    fuertes: candidatos.slice(0, 5),
    datos,
    enumeraciones,
    muletillas,
    sugerencias: sugerencias.sort((a, b) => a.desde - b.desde),
  };
}

/** Reporte legible para decidir con la vista, no leyendo JSON. */
export function reporteDeGuion(a) {
  const L = [];
  const seg = (s) => s.toFixed(1).padStart(5) + "s";

  L.push(`GUION — ${a.beats.length} beats en ${a.duracion?.toFixed(1) ?? "?"}s\n`);

  L.push("BEATS (los cortes son las pausas que hizo, no la puntuacion de whisper)");
  for (const b of a.beats) L.push(`  ${seg(b.desde)}  ${b.texto}`);

  L.push("\nLO QUE MAS PEGA (candidatos a placa a pantalla completa)");
  for (const f of a.fuertes) L.push(`  ${seg(f.desde)}  [${f.puntaje}]  ${f.texto}`);

  if (a.datos.length) {
    L.push("\nDATOS (el numero es el argumento)");
    for (const d of a.datos) L.push(`  ${seg(d.segundo)}  ${d.valor}  —  ${d.contexto}`);
  }

  if (a.enumeraciones.length) {
    L.push("\nENUMERACIONES (candidatas a panel dividido)");
    for (const e of a.enumeraciones) L.push(`  ${seg(e.desde)}  ${e.texto}`);
  }

  L.push(
    a.muletillas.length
      ? `\nMULETILLAS (${a.muletillas.length}) — se REPORTAN, no se cortan solas:\n  ` +
        a.muletillas.map((m) => `${m.palabra}@${m.segundo.toFixed(1)}s`).join("  ")
      : "\nMULETILLAS: ninguna."
  );

  L.push("\nPROPUESTA (cada una con su razon; la decision sigue siendo humana)");
  for (const s of a.sugerencias) {
    L.push(`  ${seg(s.desde)}–${seg(s.hasta)}  ${s.tipo.toUpperCase().padEnd(6)} ${s.razon}`);
  }

  L.push(
    "\nEl COPY no sale de aca. El texto de cada pieza se escribe leyendo lo que dijo,\n" +
    "no rellenando una plantilla. Ver references/estilo-reel-vakdor.md seccion 6."
  );
  return L.join("\n");
}
