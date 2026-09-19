// ACM · La hoja final (matriz, pirámide, rol de cada uno, conclusiones y contacto) en una o
// dos hojas, según lo que entre.
//
// Todo eso junto no siempre cabe en un A4: depende de cuántos comparables hay, de si la agencia
// cargó "El rol de cada uno" y del largo de SU aviso legal en el pie. Cuando no cabía, en el PDF
// las conclusiones quedaban encimadas sobre el pie y la tarjeta del asesor se perdía (ficha de
// Central, 18-sep-2026). Partirla SIEMPRE dejaba una hoja casi vacía a las fichas que sí entran.
//
// Por eso se mide: primero se arma todo en una hoja; si la hoja creció más que un A4, las
// conclusiones y el contacto pasan a una segunda; si todavía no entra, también el rol de cada
// uno. La hoja en pantalla mide lo mismo que la impresa (ancho y alto en mm), así que medir acá
// es medir el PDF. Se mide con las fuentes ya cargadas: con la de reemplazo el texto ocupa otro alto.
"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** 0 = todo en una hoja · 1 = conclusiones y contacto aparte · 2 = también el rol de cada uno. */
type Nivel = 0 | 1 | 2;

export default function HojaFinal({
  cabecera, principal, roles, cierre, pie,
}: {
  cabecera: ReactNode;
  principal: ReactNode;
  roles: ReactNode;
  cierre: ReactNode;
  pie: ReactNode;
}) {
  const [nivel, setNivel] = useState<Nivel>(0);
  const hoja = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (nivel === 2) return;
    let vigente = true;
    const medir = () => {
      const el = hoja.current;
      if (!vigente || !el) return;
      // offsetHeight ignora el achique del celular (transform), así que da el alto real.
      const alto = parseFloat(getComputedStyle(el).minHeight);
      // Solo sube el nivel que ESTA medición midió: si el efecto corre dos veces (React lo hace
      // en desarrollo), dos mediciones del nivel 0 no pueden saltar derecho al 2.
      if (el.offsetHeight > alto + 1) setNivel((n) => (n === nivel ? ((nivel + 1) as Nivel) : n));
    };
    document.fonts.ready.then(medir);
    return () => { vigente = false; };
  }, [nivel]);

  return (
    <>
      <section className="sheet" ref={hoja}>
        {cabecera}
        <div className="sheet-body">
          {principal}
          {nivel < 2 && roles}
          {nivel < 1 && cierre}
        </div>
        {pie}
      </section>
      {nivel >= 1 && (
        <section className="sheet">
          <div className="sheet-body hoja-cierre">
            {nivel >= 2 && roles}
            {cierre}
          </div>
          {pie}
        </section>
      )}
    </>
  );
}
