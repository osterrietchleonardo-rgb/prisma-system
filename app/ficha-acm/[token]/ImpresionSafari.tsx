// ACM · Marca la ficha cuando la abre el motor de Safari, para que el PDF no salga cortado.
//
// La marca sola no cambia nada en pantalla: la regla que la usa vive dentro del @media print
// de la ficha y achica la hoja entera para que entre en los márgenes que Safari agrega.
// Se hace del lado del navegador (y no en el servidor) para no depender de encabezados ni de
// cachés: el que imprime es este navegador, y es él el que se identifica.
"use client";

import { useEffect } from "react";
import { esMotorSafari } from "@/lib/acm/motor-safari";

export default function ImpresionSafari() {
  useEffect(() => {
    if (!esMotorSafari(navigator.userAgent)) return;
    document.querySelector(".acm-root")?.classList.add("acm-safari");
  }, []);

  return null;
}
