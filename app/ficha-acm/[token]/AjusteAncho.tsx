// ACM · Hace entrar la hoja A4 en la pantalla de un celular.
//
// La ficha es un documento de ancho FIJO (210 mm = 794 px): eso es lo que la hace un A4 exacto
// en el PDF y no se puede tocar sin romper la impresión. En un celular de 390 px, esa hoja se
// salía de la pantalla y el cliente veía la mitad izquierda de cada página, cortada a mitad de
// palabra ("Análisis Comparat…").
//
// La solución es achicar la hoja ENTERA, no reacomodarla: en el celular se ve exactamente el
// mismo documento, más chico. Nada se mueve de lugar, así que la vista de escritorio y el PDF
// quedan intactos (el CSS que lo aplica está dentro de un `@media screen` con tope de ancho).
//
// Por qué hace falta JavaScript para algo tan simple: CSS no puede dividir dos longitudes
// (`calc(100vw / 794px)` no es válido), y el factor exacto depende del ancho real de la
// pantalla. Con breakpoints fijos habría que adivinar cada modelo de teléfono.
"use client";

import { useEffect } from "react";

/** 210 mm en píxeles CSS. Tiene que coincidir con `--w` de la hoja. */
const ANCHO_HOJA = 793.7;
/** Respiro a los costados en pantallas chicas (8 px de cada lado). */
const AIRE = 16;

export default function AjusteAncho() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(".acm-root");
    if (!raiz) return;

    const ajustar = () => {
      const disponible = document.documentElement.clientWidth - AIRE;
      // Nunca agranda: en una pantalla ancha el factor es 1 y no pasa nada.
      const k = Math.min(1, disponible / ANCHO_HOJA);
      raiz.style.setProperty("--acm-k", String(Math.round(k * 1000) / 1000));
    };

    ajustar();
    window.addEventListener("resize", ajustar);
    window.addEventListener("orientationchange", ajustar);
    return () => {
      window.removeEventListener("resize", ajustar);
      window.removeEventListener("orientationchange", ajustar);
    };
  }, []);

  return null;
}
