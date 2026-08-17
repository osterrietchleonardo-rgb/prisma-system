// ACM · El bloque donde el asesor revisa la hoja del entorno antes de crear la ficha.
//
// El texto es editable; los datos duros NO. Se muestran igual, de solo lectura, porque revisar
// un texto sin ver sobre qué se escribió es revisar al aire: sin esto el asesor no tiene cómo
// darse cuenta de que la IA se inventó una estación de subte.
"use client";

import { CheckSquare, Square, MapPin } from "lucide-react";
import type { FichaZona } from "@/lib/acm/ficha";

const ETIQUETA: Record<string, string> = {
  // "Estación" y no "Subte": fuera de CABA esta categoría trae la estación de TREN.
  subte: "Estación",
  espacio_verde: "Espacio verde",
  escuela: "Escuelas",
  hospital: "Hospital",
  farmacia: "Farmacias",
  parada_colectivo: "Colectivos",
  comisaria: "Comisaría",
  ecobici: "Ecobici",
  ciclovia: "Ciclovía",
};

export function RevisionZona({
  zona, incluir, onIncluir, onRelato,
}: {
  zona: FichaZona | null;
  incluir: boolean;
  onIncluir: (v: boolean) => void;
  onRelato: (v: string) => void;
}) {
  if (!zona) {
    return (
      <div className="p-3.5 rounded-xl border border-accent/15 bg-muted/30 text-sm text-muted-foreground">
        No pudimos armar el análisis del entorno para esta dirección. La ficha se crea igual, sin esa hoja.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
        <button
          type="button"
          onClick={() => onIncluir(!incluir)}
          className="text-accent"
          aria-label={incluir ? "Sacar la hoja del entorno" : "Incluir la hoja del entorno"}
        >
          {incluir ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground/50" />}
        </button>
        Incluir la hoja &ldquo;La propiedad y su entorno&rdquo;
      </label>

      {incluir && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-accent">
            <MapPin className="w-3.5 h-3.5" />
            {zona.barrio}
            {zona.comuna != null ? ` · Comuna ${zona.comuna}` : ""}
          </div>

          <textarea
            value={zona.relato}
            onChange={(e) => onRelato(e.target.value)}
            rows={8}
            placeholder="El texto del barrio. Podés reescribirlo entero; si lo dejás vacío, la hoja no sale."
            className="w-full rounded-xl border border-accent/20 bg-background/50 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent"
          />

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
              Datos con los que se escribió — van en la hoja tal cual y no se editan:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {zona.pois.map((p) => (
                <span
                  key={p.categoria}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-accent/15 bg-background/60"
                >
                  <span className="text-muted-foreground">{ETIQUETA[p.categoria] || p.categoria}:</span>{" "}
                  <span className="font-semibold">{p.titulo}</span>
                  {p.detalle ? <span className="text-muted-foreground"> · {p.detalle}</span> : null}
                  {p.metros != null ? <span className="text-muted-foreground"> · {p.metros} m</span> : null}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
