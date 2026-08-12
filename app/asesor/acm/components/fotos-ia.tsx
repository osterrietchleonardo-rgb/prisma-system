"use client";

// ACM · Fotos de la propiedad + análisis con IA de visión.
//
// Hasta 4 fotos opcionales. Se achican en el navegador antes de subirlas (menos espera y
// menos costo) y NO se guardan en ningún lado: van al endpoint, vuelve el texto y se
// descartan. El análisis se hace UNA sola vez; si el texto no convence, se edita a mano.
import { useState } from "react";
import { Loader2, ImagePlus, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Sujeto } from "@/lib/tasacion/types";
import { MAX_DESC_IA } from "@/lib/acm/descripcion-ia";

const MAX_FOTOS = 4;
const MAX_LADO = 1280;

interface FotoLocal {
  preview: string; // data URL (achicada) solo para la miniatura, no se manda al endpoint
  data: string; // base64 ya redimensionado (sin el prefijo data:...;base64,)
  mimeType: string;
}

/** Redimensiona a 1280px de lado mayor y devuelve JPEG base64 (sin el prefijo data:). */
async function achicar(file: File): Promise<FotoLocal> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { preview: dataUrl, data: dataUrl.split(",")[1], mimeType: "image/jpeg" };
}

export function FotosIA({
  sujeto, descripcion, incluirEnFicha, onDescripcionChange, onIncluirEnFichaChange,
}: {
  sujeto: Sujeto;
  descripcion: string;
  incluirEnFicha: boolean;
  onDescripcionChange: (v: string) => void;
  onIncluirEnFichaChange: (v: boolean) => void;
}) {
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [foco, setFoco] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // El análisis se hace una sola vez: se marca en `analizar()` cuando la llamada
  // a la IA responde OK (nunca en el catch/finally, para que un fallo siga
  // siendo reintentable). El estado en sí NO se infiere de `descripcion` en cada
  // render (el asesor puede borrar todo el texto para reescribirlo a mano, y eso
  // no debe resucitar el botón de analizar). Lo que SÍ se infiere una única vez,
  // al montar, es el valor inicial: si el componente se remonta con una
  // `descripcion` ya cargada (volver de "Editar" tras buscar comparables, o
  // reabrir un ACM guardado desde "Mis ACM"), tiene que arrancar en `analizado`
  // para no dejar la descripción, el contador y la casilla de la ficha
  // invisibles mientras el valor sigue viajando a la búsqueda y a la ficha.
  // Un remount real (cambio de solapa vía `key={modo}`, o "Nuevo ACM") sigue
  // siendo el único reset legítimo.
  const [analizado, setAnalizado] = useState(() => descripcion.trim().length > 0);

  const agregar = async (files: FileList | null, input: HTMLInputElement) => {
    if (!files?.length) return;
    setError(null);
    setInfo(null);
    const elegidos = [...files];
    const libres = MAX_FOTOS - fotos.length;
    const aProcesar = elegidos.slice(0, libres);
    const descartadasPorTope = elegidos.length - aProcesar.length;

    // allSettled (no all): si una foto no se puede leer, las demás del mismo lote
    // igual se agregan en vez de perderse todas por culpa de una.
    const resultados = await Promise.allSettled(aProcesar.map(achicar));
    const nuevas = resultados
      .filter((r): r is PromiseFulfilledResult<FotoLocal> => r.status === "fulfilled")
      .map((r) => r.value);
    const fallidas = resultados.length - nuevas.length;

    if (nuevas.length) setFotos((f) => [...f, ...nuevas]);
    // Permite volver a elegir el mismo archivo (si no se limpia, el navegador no dispara
    // onChange de nuevo cuando se selecciona exactamente la misma foto que antes).
    input.value = "";

    if (fallidas > 0 && descartadasPorTope > 0) {
      setError(
        `No se pudo leer ${fallidas === 1 ? "una imagen" : `${fallidas} imágenes`} y no se agregaron ${descartadasPorTope} más por superar el máximo de ${MAX_FOTOS} fotos.`
      );
    } else if (fallidas > 0) {
      setError(
        fallidas === 1
          ? "No se pudo leer una de las imágenes. Probá con otro archivo."
          : `No se pudieron leer ${fallidas} de las imágenes.`
      );
    } else if (descartadasPorTope > 0) {
      setError(`Ya llegaste al máximo de ${MAX_FOTOS} fotos, no se agregaron ${descartadasPorTope} más.`);
    } else if (fotos.length + nuevas.length >= MAX_FOTOS) {
      // Aviso neutral (no es un error): explica por qué el recuadro de "agregar" desaparece.
      setInfo(`Llegaste al máximo de ${MAX_FOTOS} fotos.`);
    }
  };

  const analizar = async () => {
    setAnalizando(true);
    setError(null);
    setInfo(null); // saca el "Llegaste al máximo de 4 fotos": el bloque de resultado la reemplaza.
    try {
      const r = await fetch("/api/acm/analizar-fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotos: fotos.map(({ data, mimeType }) => ({ data, mimeType })),
          foco,
          sujeto,
        }),
      });
      // Guardado: si la respuesta no es JSON (timeout de plataforma, página de
      // gateway — el endpoint tiene maxDuration=60), `.json()` tira un SyntaxError
      // que no es un TypeError y se escapaba con el mensaje técnico del navegador.
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(j?.error || "No se pudo analizar las fotos.");
      onDescripcionChange(j.descripcion);
      // Recién acá cuenta como analizado: un fallo (catch) nunca llega a esta línea,
      // así que el botón sigue disponible para reintentar.
      setAnalizado(true);
    } catch (e: any) {
      // Si se cortó la conexión, fetch tira un TypeError con un mensaje técnico del
      // navegador ("Failed to fetch"): no le sirve al asesor, se cambia por uno en
      // español. Los demás errores ya vienen en español: los que arma este mismo
      // componente (throw de arriba) o el catch-all del endpoint, que devuelve un
      // mensaje fijo en español para cualquier falla que no sea uno de los 400
      // validados (ver app/api/acm/analizar-fotos/route.ts) — nunca el texto crudo
      // de Gemini.
      setError(
        e instanceof TypeError
          ? "No se pudo conectar. Revisá tu conexión a internet y probá de nuevo."
          : e?.message || "No se pudo analizar las fotos."
      );
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-2xl border border-accent/10 bg-card/20">
      <div>
        <Label className="text-sm font-bold">Fotos de la propiedad (opcional)</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Hasta {MAX_FOTOS}. La IA las mira y redacta una descripción que afina la búsqueda de
          comparables. Las fotos no se guardan.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.preview} alt={`Foto ${i + 1}`} className="w-20 h-20 rounded-xl object-cover" />
            {!analizado && (
              <button
                type="button"
                onClick={() => {
                  setFotos((prev) => prev.filter((_, j) => j !== i));
                  setInfo(null); // el recuadro de "agregar" vuelve a aparecer: el aviso de tope quedaría desactualizado.
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-accent/20 flex items-center justify-center"
                aria-label="Quitar foto"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {fotos.length < MAX_FOTOS && !analizado && (
          <label className="w-20 h-20 rounded-xl border border-dashed border-accent/30 flex items-center justify-center cursor-pointer hover:bg-accent/5">
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => agregar(e.target.files, e.target)}
            />
          </label>
        )}
      </div>

      {fotos.length > 0 && !analizado && (
        <>
          <div className="space-y-1">
            <Label className="text-xs font-bold">¿En qué querés que se enfoque el análisis?</Label>
            <Input
              value={foco}
              maxLength={300}
              onChange={(e) => setFoco(e.target.value)}
              placeholder="Ej: estado de la cocina y los baños, luminosidad y vista, calidad de las terminaciones"
              className="bg-card/50 border-accent/10"
            />
          </div>
          <Button onClick={analizar} disabled={analizando} className="bg-accent hover:bg-accent/90">
            {analizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {analizando ? "Analizando fotos..." : "Analizar fotos con IA"}
          </Button>
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {!error && info && <p className="text-xs text-muted-foreground">{info}</p>}

      {analizado && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold">Descripción (editable)</Label>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {descripcion.length}/{MAX_DESC_IA}
            </span>
          </div>
          <Textarea
            value={descripcion}
            maxLength={MAX_DESC_IA}
            rows={5}
            onChange={(e) => onDescripcionChange(e.target.value)}
            className="bg-card/50 border-accent/10 text-sm"
          />
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={incluirEnFicha}
              onCheckedChange={(v) => onIncluirEnFichaChange(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs">
              <span className="font-bold">Incluir esta descripción en la ficha del cliente</span>
              <span className="block text-muted-foreground mt-0.5">
                Revisala antes: lo que quede acá es lo que va a leer tu cliente.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
