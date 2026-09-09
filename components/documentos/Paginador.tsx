// Arma la versión IMPRESA del documento: hojas A4 de alto fijo, cada una con el header arriba,
// el footer abajo y el cuerpo en el hueco del medio. En pantalla el documento sigue siendo el
// continuo (.documento); esta copia (.documento-impresion) solo se muestra al imprimir.
//
// Por qué no se hace con CSS: Chrome repite un <thead> en cada hoja pero NO un <tfoot>, y una
// franja fija corrida al margen de @page se recorta y aparece en la hoja siguiente. Se probó
// (spike 9-sep-2026) y se midió en el PDF. Paginar a mano es lo único que deja el texto SIEMPRE
// entre las dos franjas. Un párrafo que no entra en el hueco se parte por palabra, conservando
// negritas y cursivas; una lista se parte por ítem.
//
// El HTML que se copia (innerHTML de las franjas y del cuerpo) es el que generó el servidor con
// la lista fija de extensiones de Tiptap: no entra nada que no haya pasado por generarHtml.
"use client";
import { useEffect } from "react";

const RESPIRO = 12; // px entre franja y cuerpo

type Corte = { nodo: Text; offset: number };

/** Todos los espacios (menos el primero de cada texto) donde se puede cortar un bloque. */
function cortesDe(bloque: HTMLElement): Corte[] {
  const w = document.createTreeWalker(bloque, NodeFilter.SHOW_TEXT);
  const out: Corte[] = [];
  let t: Text | null;
  while ((t = w.nextNode() as Text | null)) {
    for (let i = 1; i < t.data.length; i++) if (t.data[i] === " ") out.push({ nodo: t, offset: i });
  }
  return out;
}

/** Saca de `bloque` todo lo que sigue al corte k y lo devuelve; `bloque` queda con el principio. */
function extraerDesde(bloque: HTMLElement, k: number): DocumentFragment {
  const c = cortesDe(bloque)[k];
  const r = document.createRange();
  r.setStart(c.nodo, c.offset);
  r.setEnd(bloque, bloque.childNodes.length);
  const frag = r.extractContents();
  bloque.normalize();
  return frag;
}

function armar(root: HTMLElement) {
  const src = root.querySelector<HTMLElement>(".documento");
  if (!src) return;
  root.querySelector(".documento-impresion")?.remove();

  const cont = document.createElement("div");
  cont.className = "documento-impresion";
  // Los colores y la marca de agua de la agencia vienen como variables CSS en línea sobre
  // .documento; la copia paginada vive afuera, así que se copian.
  cont.style.cssText = src.style.cssText;
  root.appendChild(cont);

  const headerHtml = src.querySelector(".documento-header")?.innerHTML ?? "";
  const footerHtml = src.querySelector(".documento-footer")?.innerHTML ?? "";
  const bloques = Array.from(src.querySelector(".documento-cuerpo")?.children ?? []) as HTMLElement[];

  let cuerpo: HTMLElement = document.createElement("div");
  let hueco = 0;

  const nuevaHoja = () => {
    const hoja = document.createElement("section");
    hoja.className = "hoja";
    const h = document.createElement("header");
    h.className = "documento-header";
    h.innerHTML = headerHtml;
    const f = document.createElement("footer");
    f.className = "documento-footer";
    f.innerHTML = footerHtml;
    cuerpo = document.createElement("div");
    cuerpo.className = "documento-cuerpo";
    hoja.append(h, cuerpo, f);
    cont.appendChild(hoja);
    // Con la hoja en el DOM (a 794 px), el alto de cada franja es el real.
    const hH = headerHtml ? h.offsetHeight : 0;
    const fH = footerHtml ? f.offsetHeight : 0;
    cuerpo.style.top = `${hH + (hH ? RESPIRO : 0)}px`;
    cuerpo.style.bottom = `${fH + (fH ? RESPIRO : 0)}px`;
    hueco = cuerpo.clientHeight;
  };

  /** Alto real del contenido del cuerpo. No sirve scrollHeight: con overflow hidden nunca baja
   *  del alto visible, y "libre" daría siempre cero. Se mide el borde inferior del último bloque. */
  const usado = () => {
    const ultimo = cuerpo.lastElementChild as HTMLElement | null;
    if (!ultimo) return 0;
    return ultimo.getBoundingClientRect().bottom - cuerpo.getBoundingClientRect().top + parseFloat(getComputedStyle(ultimo).marginBottom || "0");
  };
  const entra = () => usado() <= hueco + 1;

  /** Deja en `bloque` lo que entra en la hoja y devuelve el resto como bloque nuevo, o null si no se puede partir. */
  const partirPorPalabra = (bloque: HTMLElement): HTMLElement | null => {
    const total = cortesDe(bloque).length;
    if (!total) return null;
    // Búsqueda binaria del último corte con el que el principio entra en la hoja.
    let lo = 0, hi = total - 1, mejor = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const frag = extraerDesde(bloque, mid);
      const entro = entra();
      bloque.appendChild(frag);
      bloque.normalize();
      if (entro) { mejor = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (mejor < 0) return null;
    const resto = bloque.cloneNode(false) as HTMLElement;
    resto.appendChild(extraerDesde(bloque, mejor));
    return resto;
  };

  /** Espacio libre en la hoja actual, en px. */
  const libre = () => hueco - usado();

  const colocar = (original: HTMLElement) => {
    // Un párrafo vacío (el Enter final del editor) no ocupa una hoja.
    if (!original.textContent?.trim() && !original.querySelector("img")) return;
    const b = original.cloneNode(true) as HTMLElement;
    cuerpo.appendChild(b);
    if (entra()) return;
    b.remove();
    // Un párrafo se parte como en Word si en la hoja quedan al menos tres líneas libres; si no,
    // queda media hoja en blanco. Títulos y listas cortas pasan enteros a la hoja siguiente.
    const MIN_LIBRE = 3 * 15 * 1.7;
    if (cuerpo.children.length > 0 && !(b.tagName === "P" && libre() >= MIN_LIBRE)) {
      nuevaHoja();
      cuerpo.appendChild(b);
      if (entra()) return;
      b.remove();
    }
    // En una hoja vacía y no entra: hay que partirlo.
    if (b.tagName === "UL" || b.tagName === "OL") {
      let lista = b.cloneNode(false) as HTMLElement;
      cuerpo.appendChild(lista);
      for (const item of Array.from(b.children) as HTMLElement[]) {
        lista.appendChild(item);
        if (!entra()) {
          item.remove();
          if (!lista.children.length) lista.remove();
          nuevaHoja();
          lista = b.cloneNode(false) as HTMLElement;
          cuerpo.appendChild(lista);
          lista.appendChild(item);
        }
      }
      return;
    }
    let actual: HTMLElement | null = b;
    while (actual) {
      cuerpo.appendChild(actual);
      if (entra()) break;
      const resto = partirPorPalabra(actual);
      if (!resto) break; // no se puede partir más: queda como está, con el sobrante oculto
      nuevaHoja();
      actual = resto;
    }
  };

  nuevaHoja();
  for (const bloque of bloques) colocar(bloque);

  // "Hoja 1 de 3", arriba del footer, a la derecha. Solo si hay más de una.
  const hojas = Array.from(cont.querySelectorAll<HTMLElement>(".hoja"));
  if (hojas.length > 1) {
    hojas.forEach((hoja, i) => {
      const n = document.createElement("div");
      n.className = "hoja-numero";
      n.textContent = `Hoja ${i + 1} de ${hojas.length}`;
      const f = hoja.querySelector<HTMLElement>(".documento-footer");
      n.style.bottom = `${(f?.offsetHeight ?? 0) + 4}px`;
      hoja.appendChild(n);
    });
  }
}

export default function Paginador() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".documento-root");
    if (!root) return;
    let pendiente = 0;
    const correr = () => { cancelAnimationFrame(pendiente); pendiente = requestAnimationFrame(() => armar(root)); };
    correr();
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>(".documento img"));
    imgs.forEach((img) => { if (!img.complete) img.addEventListener("load", correr); });
    document.fonts?.ready.then(correr);
    window.addEventListener("beforeprint", correr);
    return () => {
      cancelAnimationFrame(pendiente);
      window.removeEventListener("beforeprint", correr);
      imgs.forEach((img) => img.removeEventListener("load", correr));
    };
  }, []);
  return null;
}
