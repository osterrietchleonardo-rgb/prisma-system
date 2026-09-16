// Marketing IA · La placa que muestra la FOTO REAL de la propiedad.
//
// POR QUE NO LA HACE GEMINI: hasta el 16-sep-2026 la placa era una imagen inventada de punta a
// punta por el modelo. Maximiliano Filoreto lo marco el 10-sep: el copy decia "La Pampa 1300,
// USD 130.000" y la imagen mostraba un living que no existe. La causa era que
// flow_data.tokko_property_details venia vacio y el prompt caia en "imagen representativa del
// mercado inmobiliario argentino premium".
//
// POR QUE FOTO + PANEL Y NO FOTO A PANTALLA COMPLETA: medidas 40 portadas reales de Central el
// 16-sep-2026, la foto tipica es 4:3 de 1500 px de ancho. Armando el Reel 9:16:
//   pantalla completa -> usa el 42% del ancho de la foto y hay que agrandarla 1,71x (sale blanda)
//   foto + panel      -> usa el 76% y se achica 0,94x (sale nitida)
// En 4:5 y en cuadrado la foto entra ENTERA, sin recortar nada. El panel gana en los tres.
//
// POR QUE EL PANEL SE MIDE Y NO SE FIJA: con un panel de alto fijo (40% de la placa), en 4:5 las
// casillas de datos se metian abajo del aviso legal y el logo se montaba encima. Salio probando
// el mockup con la foto real, antes de que llegara a produccion.
//
// FIX ROUND 1 (16-sep-2026): con el `reservadoAbajo` REAL del cliente (319 px: su aviso legal mide
// 165 px de franja a 1080 de ancho, mas el logo y los margenes — medido con `armarFranjaLegal`
// sobre su texto de verdad), el formato cuadrado desbordaba: ni soltando las 5 casillas ni
// achicando el titulo al minimo alcanzaba, y el precio se dibujaba abajo de la franja legal. La
// causa era `Math.min(altoPanel, techoPanel)`: el piso del 45% se hacia cumplir con un clamp que
// tapaba el desborde en vez de evitarlo — exactamente la colision que este diseño existia para
// prevenir. La solucion agrega una cuarta palanca (soltar la bajada) y vuelve al 45% una
// PREFERENCIA en vez de una ley: recien si ni soltando casillas, ni soltando la bajada, ni
// achicando el titulo alcanza, se le pide a la foto que ceda hasta un piso duro del 30%. Y si ni
// asi entra, la funcion ya no lo esconde: devuelve `desborda: true` para que la ruta lo registre.
// Ver el comentario en el bucle de `medirPanel` para el orden exacto de las cuatro palancas.
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { anchoDelTexto, comoPaths, contornosDeTexto, repartirEnRenglones } from "@/lib/tipografia/contornos";

// Todo se mide contra un ancho de referencia de 1080 px (el lado de una placa de Instagram) y
// despues se escala, igual que el aviso legal.
const ANCHO_REF = 1080;

// De mayor a menor: se usa el cuerpo mas grande que entre. Abajo de 28 (en referencia) un titulo
// de placa deja de tener peso de titulo.
const CUERPOS_TITULO_REF = [66, 60, 54, 48, 44, 40, 36, 32, 28];

const MARGEN_REF = 70;          // aire a los costados del panel
const AIRE_ARRIBA_REF = 74;     // entre el borde de la foto y el titulo
const INTERLINEA_TITULO = 1.2;
const CUERPO_BAJADA_REF = 34;
const CUERPO_PRECIO_REF = 56;
const CUERPO_DATO_REF = 28;
const ALTO_LINEA_REF = 5;       // la linea de acento debajo del titulo
const AIRE_REF = 40;            // separacion entre bloques del panel

/**
 * La foto prefiere no bajar de esto: el panel no deberia comerse la propiedad. Es una preferencia
 * y no una ley — se cede solo si soltar la bajada Y las casillas Y achicar el titulo al minimo
 * no alcanzan igual.
 */
const PISO_FOTO_PREFERIDO = 0.45;

/**
 * Piso duro: la foto NUNCA baja de esto, pase lo que pase. Es la ultima de las cuatro palancas.
 * Si ni con la foto en el 30% entra el contenido, no se sigue bajando la foto: se acepta que el
 * panel se pase (`desborda: true`) antes que dejar la placa sin nada de propiedad a la vista.
 * Medido el 16-sep-2026 con el `reservadoAbajo` real del cliente (319 px): en el formato cuadrado
 * el 45% no alcanzaba, pero el 30% si.
 */
const PISO_FOTO_MINIMO = 0.3;

const COLOR_PANEL = "#12161c";
const COLOR_TITULO = "#ffffff";
const COLOR_BAJADA = "#98a4b2";
const COLOR_DATO = "#d6dee8";
const COLOR_ACENTO = "#c98a4b";  // el cobre de la marca

export interface ContenidoPanel {
  /** El hook, YA SIN EMOJIS (lo limpia sellarContenidoPost). */
  titulo: string;
  bajada?: string;
  precio?: string;
  /** Casillas: "1 ambiente", "45 m²", "Pileta". Se sueltan si no entran. */
  datos?: string[];
}

export interface Casilla {
  texto: string;
  left: number;
  top: number;
  ancho: number;
  alto: number;
}

export interface MedidaPanel {
  altoPanel: number;
  altoFoto: number;
  cuerpoTitulo: number;
  renglonesTitulo: string[];
  /** Si la bajada pedida entro, o se solto para hacer lugar (la tercera palanca, ver el bucle). */
  bajadaDibujada: boolean;
  /** Donde termina lo ultimo que se dibuja. Tiene que caer arriba de lo reservado. */
  fondoDelContenido: number;
  casillas: Casilla[];
  datosDibujados: number;
  margen: number;
  yTitulo: number;
  yLinea: number;
  yBajada: number;
  yPrecio: number;
  /**
   * Tiene que ser SIEMPRE false. Si es true, ni soltando casillas y bajada, ni achicando el
   * titulo al minimo, ni bajando la foto hasta su piso duro del 30% alcanzo: el contenido se va
   * a dibujar encima de lo reservado (aviso legal, logo). La funcion no lo esconde: quien llama
   * tiene que registrarlo.
   */
  desborda: boolean;
}

export interface PlacaArmada {
  imagen: Buffer;
  altoFoto: number;
  altoPanel: number;
  cuerpoTitulo: number;
  renglonesTitulo: number;
  /** Tiene que ser SIEMPRE 0. Si no lo es, la placa dice algo distinto de lo que se escribio. */
  letrasSinDibujo: number;
  datosDibujados: number;
  /** <1 = la foto se achica (nitida). >1 = se agranda (sale blanda). */
  escalaFoto: number;
  /** Ver `MedidaPanel.desborda`. Tiene que ser SIEMPRE false; si no, hay que registrarlo. */
  desborda: boolean;
}

/**
 * Cuanto ocupa el panel con este contenido, y por lo tanto cuanto le queda a la foto.
 *
 * Es puro (no toca sharp) a proposito: asi se puede probar la geometria sola, que es donde
 * estaba el choque.
 *
 * `reservadoAbajo` es lo que la ruta va a dibujar DESPUES encima: la franja del aviso legal mas
 * el logo mas su margen. El panel nunca invade esa zona.
 */
export function medirPanel(opciones: {
  ancho: number;
  alto: number;
  reservadoAbajo: number;
  contenido: ContenidoPanel;
}): MedidaPanel {
  const { ancho, alto, reservadoAbajo, contenido } = opciones;
  const escala = ancho / ANCHO_REF;
  const ent = (ref: number) => Math.max(1, Math.round(ref * escala));

  const margen = ent(MARGEN_REF);
  const anchoUtil = ancho - margen * 2;
  const techoPreferido = alto * (1 - PISO_FOTO_PREFERIDO);
  const techoMinimo = alto * (1 - PISO_FOTO_MINIMO);
  const datosPedidos = (contenido.datos ?? []).filter(Boolean);
  // Si no hay bajada pedida, no hay nada que soltar: la unica opcion es "no dibujarla" siempre.
  const opcionesBajada = contenido.bajada ? [true, false] : [false];

  let mejor: MedidaPanel | null = null;

  // Las cuatro palancas, de la mas barata a la mas cara — este orden es el que importa, y es
  // al reves de "primero se achica la letra": en una placa inmobiliaria el titular ES el mensaje
  // (lo que hace parar el pulgar en el feed) y la foto es la prueba de que la propiedad existe;
  // las casillas y la bajada son decoracion informativa, prescindible antes que cualquiera de
  // esas dos. Y por encima de las cuatro, una regla que no tiene excepcion: la franja del aviso
  // legal (mas el logo) NUNCA se pisa a proposito — eso es lo que devuelve `reservadoAbajo`.
  //   1) soltar las casillas de datos, de a una      (la mas barata: es la unica decoracion)
  //   2) soltar la bajada entera                     (mas cara que una casilla: es una oracion)
  //   3) achicar el cuerpo del titulo, un escalon     (cara: el titulo pierde peso en el feed)
  //   4) bajar el piso de la foto del 45% al 30%      (la mas cara: la propiedad se ve mas chica)
  // El bucle repite las tres primeras palancas ENTERAS con el piso preferido de la foto (45%)
  // antes de tocar la cuarta: recien si NINGUNA combinacion de titulo+bajada+casillas entra en
  // ese 45%, se repite la busqueda entera permitiendole a la foto bajar hasta el piso duro (30%).
  // Asi salio el choque del fix (16-sep-2026, ver el comentario de mas arriba): con el
  // `reservadoAbajo` real (319 px) el formato cuadrado no entraba ni al minimo del titulo sin
  // soltar tambien la bajada, y ni asi entraba dentro del 45% — necesitaba el 30%.
  for (const techo of [techoPreferido, techoMinimo]) {
    for (const cuerpoRef of CUERPOS_TITULO_REF) {
      for (const conBajada of opcionesBajada) {
        for (let cuantosDatos = datosPedidos.length; cuantosDatos >= 0; cuantosDatos--) {
          const cuerpoTitulo = ent(cuerpoRef);
          const renglones = repartirEnRenglones(contenido.titulo || "", cuerpoTitulo, anchoUtil);

          const yTitulo = ent(AIRE_ARRIBA_REF) + cuerpoTitulo;
          const fondoTitulo = yTitulo + (renglones.length - 1) * cuerpoTitulo * INTERLINEA_TITULO;

          const yLinea = fondoTitulo + ent(AIRE_REF);
          let y = yLinea + ent(ALTO_LINEA_REF);

          const dibujarBajada = Boolean(contenido.bajada) && conBajada;
          const cuerpoBajada = ent(CUERPO_BAJADA_REF);
          const yBajada = dibujarBajada ? y + ent(AIRE_REF) + cuerpoBajada : y;
          y = yBajada;

          const cuerpoPrecio = ent(CUERPO_PRECIO_REF);
          const yPrecio = contenido.precio ? y + ent(AIRE_REF) + cuerpoPrecio : y;
          y = yPrecio;

          // Las casillas: se colocan a lo ancho y la que no entra corta la fila.
          const cuerpoDato = ent(CUERPO_DATO_REF);
          const altoCasilla = cuerpoDato + ent(26);
          const yCasillas = cuantosDatos > 0 ? y + ent(AIRE_REF) + altoCasilla : y;
          const casillas: Casilla[] = [];
          if (cuantosDatos > 0) {
            let x = margen;
            for (const texto of datosPedidos.slice(0, cuantosDatos)) {
              const anchoTexto = anchoDelTexto(texto, cuerpoDato);
              const anchoCasilla = anchoTexto + ent(36);
              if (x + anchoCasilla > ancho - margen) break;
              casillas.push({ texto, left: x, top: yCasillas - altoCasilla, ancho: anchoCasilla, alto: altoCasilla });
              x += anchoCasilla + ent(12);
            }
          }
          const fondoDelContenido = (casillas.length ? yCasillas : y) + ent(AIRE_REF);

          const altoPanel = Math.ceil(fondoDelContenido + reservadoAbajo);

          const entra = altoPanel <= techo;
          const esElUltimoIntento =
            techo === techoMinimo &&
            cuerpoRef === CUERPOS_TITULO_REF[CUERPOS_TITULO_REF.length - 1] &&
            conBajada === opcionesBajada[opcionesBajada.length - 1] &&
            cuantosDatos === 0;

          if (entra || esElUltimoIntento) {
            // Si `entra`, el clamp no hace nada (altoPanel ya es <= techo). Si es el ultimo
            // intento y NO entra, el clamp es lo que fija la foto en su piso duro del 30% — y
            // por eso `desborda` queda en true: el contenido de verdad no entraba ahi.
            const altoPanelFinal = Math.min(altoPanel, Math.ceil(techo));
            mejor = {
              altoPanel: altoPanelFinal,
              altoFoto: alto - altoPanelFinal,
              cuerpoTitulo,
              renglonesTitulo: renglones,
              bajadaDibujada: dibujarBajada,
              fondoDelContenido: 0, // se completa abajo, ya en coordenadas de la placa
              casillas,
              datosDibujados: casillas.length,
              margen,
              yTitulo,
              yLinea,
              yBajada,
              yPrecio,
              desborda: !entra,
            };
            break;
          }
        }
        if (mejor) break;
      }
      if (mejor) break;
    }
    if (mejor) break;
  }

  // `mejor` no puede ser null: el ultimo intento se acepta siempre.
  const m = mejor as MedidaPanel;
  // Las `y` de arriba son relativas al borde de arriba del panel. Se pasan a coordenadas de la
  // placa entera, que es lo que necesita quien dibuja.
  const base = m.altoFoto;
  m.yTitulo += base;
  m.yLinea += base;
  m.yBajada += base;
  m.yPrecio += base;
  for (const c of m.casillas) c.top += base;
  m.fondoDelContenido = Math.max(
    m.yPrecio,
    m.yBajada,
    m.yTitulo + (m.renglonesTitulo.length - 1) * m.cuerpoTitulo * INTERLINEA_TITULO,
    ...m.casillas.map((c) => c.top + c.alto)
  );
  return m;
}

/** Dibuja un texto como contornos, en su propio lienzo del alto justo. Un renglon por lienzo. */
async function renglon(
  texto: string,
  x: number,
  cuerpo: number,
  ancho: number,
  color: string,
  opacidad = 1
): Promise<{ capa: OverlayOptions; alto: number; rotas: number }> {
  const altoLienzo = Math.ceil(cuerpo * 1.45);
  const c = contornosDeTexto(texto, x, Math.round(cuerpo * 1.08), cuerpo);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${altoLienzo}">${comoPaths(
    c.paths,
    color,
    opacidad
  )}</svg>`;
  return {
    capa: { input: await sharp(Buffer.from(svg)).png().toBuffer(), top: 0, left: 0 },
    alto: altoLienzo,
    rotas: c.letrasRotas,
  };
}

/**
 * Arma la placa: la foto real arriba, el panel de marca abajo.
 *
 * Devuelve la imagen SIN el logo ni el aviso legal: esos los pone la ruta encima, igual que
 * siempre, en el hueco que dejo `reservadoAbajo`.
 */
export async function armarPlacaConFoto(opciones: {
  foto: Buffer;
  ancho: number;
  alto: number;
  reservadoAbajo: number;
  contenido: ContenidoPanel;
  colorAcento?: string;
}): Promise<PlacaArmada> {
  const { foto, ancho, alto, reservadoAbajo, contenido } = opciones;
  const acento = opciones.colorAcento || COLOR_ACENTO;
  const m = medirPanel({ ancho, alto, reservadoAbajo, contenido });
  const escala = ancho / ANCHO_REF;
  const ent = (ref: number) => Math.max(1, Math.round(ref * escala));

  // ─── Cuanto hay que estirar la foto ──────────────────────────────────
  // Se calcula ANTES de recortar: es el dato que le dice al asesor si la foto que eligio es
  // demasiado chica para la placa. 7 de 40 portadas de Central lo son.
  const medidaFoto = await sharp(foto).metadata();
  const anchoOriginal = medidaFoto.width ?? ancho;
  const altoOriginal = medidaFoto.height ?? m.altoFoto;
  const ratioZona = ancho / m.altoFoto;
  const anchoUsado =
    anchoOriginal / altoOriginal > ratioZona ? altoOriginal * ratioZona : anchoOriginal;
  const escalaFoto = ancho / anchoUsado;

  // La foto se lleva a la zona que le toca. `cover` no la deforma: recorta.
  const fotoLista = await sharp(foto)
    .resize(ancho, m.altoFoto, { fit: "cover", position: "centre" })
    .toBuffer();

  // ─── El lienzo: el panel de color, con la foto pegada arriba ─────────
  const base = sharp({
    create: { width: ancho, height: alto, channels: 4, background: COLOR_PANEL },
  });

  const capas: OverlayOptions[] = [{ input: fotoLista, top: 0, left: 0 }];
  let letrasSinDibujo = 0;

  // El titulo, un renglon por lienzo (un <path> grande se rasteriza incompleto sin avisar).
  for (let i = 0; i < m.renglonesTitulo.length; i++) {
    const r = await renglon(
      m.renglonesTitulo[i],
      m.margen,
      m.cuerpoTitulo,
      ancho,
      COLOR_TITULO
    );
    letrasSinDibujo += r.rotas;
    capas.push({
      ...r.capa,
      top: Math.round(m.yTitulo + i * m.cuerpoTitulo * INTERLINEA_TITULO - m.cuerpoTitulo),
    });
  }

  // La linea de acento debajo del titulo.
  capas.push({
    input: await sharp({
      create: {
        width: ent(110),
        height: ent(ALTO_LINEA_REF),
        channels: 4,
        background: acento,
      },
    })
      .png()
      .toBuffer(),
    top: Math.round(m.yLinea),
    left: m.margen,
  });

  if (contenido.bajada && m.bajadaDibujada) {
    const cuerpo = ent(CUERPO_BAJADA_REF);
    const r = await renglon(contenido.bajada, m.margen, cuerpo, ancho, COLOR_BAJADA);
    letrasSinDibujo += r.rotas;
    capas.push({ ...r.capa, top: Math.round(m.yBajada - cuerpo) });
  }

  if (contenido.precio) {
    const cuerpo = ent(CUERPO_PRECIO_REF);
    const r = await renglon(contenido.precio, m.margen, cuerpo, ancho, acento);
    letrasSinDibujo += r.rotas;
    capas.push({ ...r.capa, top: Math.round(m.yPrecio - cuerpo) });
  }

  for (const c of m.casillas) {
    const cuerpo = ent(CUERPO_DATO_REF);
    // El fondo redondeado de la casilla.
    const fondo = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.ancho}" height="${c.alto}"><rect width="${c.ancho}" height="${c.alto}" rx="${Math.round(
      c.alto / 2
    )}" fill="#ffffff" fill-opacity="0.07"/></svg>`;
    capas.push({
      input: await sharp(Buffer.from(fondo)).png().toBuffer(),
      top: Math.round(c.top),
      left: Math.round(c.left),
    });
    const r = await renglon(c.texto, c.left + ent(18), cuerpo, ancho, COLOR_DATO);
    letrasSinDibujo += r.rotas;
    capas.push({ ...r.capa, top: Math.round(c.top + (c.alto - cuerpo) / 2 - cuerpo * 0.1) });
  }

  const imagen = await base.composite(capas).jpeg({ quality: 92 }).toBuffer();

  return {
    imagen,
    altoFoto: m.altoFoto,
    altoPanel: m.altoPanel,
    cuerpoTitulo: m.cuerpoTitulo,
    renglonesTitulo: m.renglonesTitulo.length,
    letrasSinDibujo,
    datosDibujados: m.datosDibujados,
    escalaFoto: +escalaFoto.toFixed(2),
    desborda: m.desborda,
  };
}
