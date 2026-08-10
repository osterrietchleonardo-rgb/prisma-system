"use client";

// ACM · Solapa "Mis ACM": historial de búsquedas guardadas.
// Cada fila es un ACM hecho (propiedad sujeto + comparables de cartera y colaboración). Al tocarla se
// reabre la pantalla de resultados con ese snapshot. Si de esa búsqueda salió una ficha, se linkea acá.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ExternalLink, FileText, Loader2, RefreshCw, Scale, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export interface AcmSearchRow {
  id: string;
  operacion: string;
  direccion: string;
  barrio: string;
  tipo: string;
  m2: number | null;
  total_cartera: number;
  total_roomix: number;
  ficha_token: string | null;
  autor: string;
  es_mio: boolean;
  created_at: string;
}

interface Props {
  onAbrir: (id: string) => void;
  abriendoId: string | null;
  refreshKey: number; // cambia cuando se guarda una búsqueda nueva, para recargar la lista
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function MisAcm({ onAbrir, abriendoId, refreshKey }: Props) {
  const [rows, setRows] = useState<AcmSearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipo, setEquipo] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/acm/searches");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo cargar el historial.");
      setRows(data.searches || []);
      setEquipo(Boolean(data.puede_ver_equipo));
    } catch (e: any) {
      toast.error("Error cargando el historial: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar este ACM del historial? La ficha compartida, si la creaste, sigue funcionando.")) return;
    setBorrando(id);
    try {
      const res = await fetch(`/api/acm/searches/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo borrar.");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      toast.error("Error borrando: " + e.message);
    } finally {
      setBorrando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando tus ACM…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Scale className="w-8 h-8 text-accent/40 mx-auto" />
        <p className="font-bold">Todavía no hay ACM guardados</p>
        <p className="text-sm text-muted-foreground">Cada análisis que hagas queda acá para volver a abrirlo cuando quieras.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} análisis guardado{rows.length === 1 ? "" : "s"}
          {equipo && " · de todo tu equipo"}
        </p>
        <Button variant="ghost" size="sm" onClick={cargar} className="text-muted-foreground">
          <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
        </Button>
      </div>

      {rows.map((r) => (
        <div
          key={r.id}
          role="button"
          tabIndex={0}
          onClick={() => onAbrir(r.id)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onAbrir(r.id)}
          className="w-full text-left p-4 rounded-2xl border border-accent/10 bg-card/30 hover:border-accent/30 hover:bg-card/50 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black truncate">{r.direccion || "Propiedad sin dirección"}</p>
                <Badge variant="outline" className="text-[10px] border-accent/20 capitalize">{r.operacion}</Badge>
                {r.ficha_token && (
                  <Badge className="text-[10px] bg-accent/15 text-accent border-0">
                    <FileText className="w-3 h-3 mr-1" /> Con ficha
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {[r.barrio, r.tipo, r.m2 ? `${r.m2} m²` : null].filter(Boolean).join(" · ")}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {r.total_cartera} de cartera
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {r.total_roomix} de colaboración
                </span>
                <span>{fecha(r.created_at)}</span>
                {!r.es_mio && r.autor && <span>· {r.autor}</span>}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {abriendoId === r.id && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
              {r.ficha_token && (
                <Button variant="outline" size="sm" className="border-accent/20" asChild>
                  <a href={`/ficha-acm/${r.ficha_token}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" /> Ficha
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={borrando === r.id}
                onClick={() => borrar(r.id)}
              >
                {borrando === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
