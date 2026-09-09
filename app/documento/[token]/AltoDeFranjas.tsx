// Mide el alto real del header y del footer y lo deja en variables CSS, para que al imprimir
// el cuerpo tenga el relleno justo y no quede debajo de las franjas fijas.
"use client";
import { useEffect } from "react";

export default function AltoDeFranjas() {
  useEffect(() => {
    const medir = () => {
      const h = document.querySelector<HTMLElement>(".documento-header");
      const f = document.querySelector<HTMLElement>(".documento-footer");
      const root = document.querySelector<HTMLElement>(".documento-root");
      if (!root) return;
      root.style.setProperty("--alto-header", `${h?.offsetHeight ?? 0}px`);
      root.style.setProperty("--alto-footer", `${f?.offsetHeight ?? 0}px`);
    };
    medir();
    window.addEventListener("beforeprint", medir);
    window.addEventListener("resize", medir);
    const imgs = Array.from(document.querySelectorAll("img"));
    imgs.forEach((img) => img.addEventListener("load", medir));
    return () => {
      window.removeEventListener("beforeprint", medir);
      window.removeEventListener("resize", medir);
      imgs.forEach((img) => img.removeEventListener("load", medir));
    };
  }, []);
  return null;
}
