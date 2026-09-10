"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Link2Off, MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  unirComoUnaOperacion,
  marcarComoOperacionesDistintas,
  separarOperacion,
  type OperacionesDelEquipo,
  type FilaDeOperacion,
} from "@/actions/tracking/operacionesDelEquipo";

const plata = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "sin fecha";

function Fila({ f }: { f: FilaDeOperacion }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="font-semibold">{f.asesor}</span>
      {f.participacion && (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
          {f.participacion}
        </Badge>
      )}
      <span className="text-muted-foreground text-xs">
        {fechaCorta(f.fecha)} · {plata(f.monto)} · {f.comision}%
      </span>
    </div>
  );
}

export default function OperacionesClient({ datos }: { datos: OperacionesDelEquipo }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const correr = async (clave: string, accion: () => Promise<{ ok: boolean }>, exito: string) => {
    setOcupado(clave);
    try {
      const { ok } = await accion();
      if (ok) {
        toast.success(exito);
        router.refresh();
      } else {
        toast.error("No se pudo guardar. Probá de nuevo.");
      }
    } finally {
      setOcupado(null);
    }
  };

  const sinNada = datos.sospechosos.length === 0 && datos.enlazadas.length === 0;

  if (sinNada) {
    return (
      <Card className="p-8 text-center space-y-2">
        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600 dark:text-emerald-500" />
        <p className="text-sm font-medium">No hay operaciones para revisar</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Cuando dos asesores carguen cierres que parezcan la misma operación, van a aparecer acá
          para que decidas si se cuentan como un solo negocio.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {datos.sospechosos.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-accent">
              Parecen la misma operación
            </h3>
            <p className="text-xs text-muted-foreground">
              Dos cierres en la misma dirección, uno de cada punta. Si son el mismo negocio, la
              propiedad tiene que contarse una sola vez en el volumen.
            </p>
          </div>

          {datos.sospechosos.map(({ a, b }) => {
            const clave = `${a.id}|${b.id}`;
            return (
              <Card key={clave} className="p-4 space-y-3 border-accent/20">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="font-medium text-foreground">{a.direccion}</span>
                </div>
                <div className="space-y-1.5 pl-1 border-l-2 border-accent/30">
                  <Fila f={a} />
                  <Fila f={b} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="accent"
                    className="h-8 text-xs"
                    disabled={ocupado === clave}
                    onClick={() =>
                      correr(clave, () => unirComoUnaOperacion(a.id, b.id), "Se cuentan como un solo negocio")
                    }
                  >
                    <Link2 className="w-3.5 h-3.5 mr-1.5" />
                    Es la misma operación
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={ocupado === clave}
                    onClick={() =>
                      correr(
                        clave,
                        () => marcarComoOperacionesDistintas(a.id, b.id),
                        "Quedan como operaciones distintas"
                      )
                    }
                  >
                    Son operaciones distintas
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>
      )}

      {datos.enlazadas.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Ya enlazadas
            </h3>
            <p className="text-xs text-muted-foreground">
              Cierres que se cuentan como un solo negocio. Si alguno se enlazó por error, separalos
              acá y vuelven a quedar como estaban.
            </p>
          </div>

          {datos.enlazadas.map((g) => (
            <Card key={g.operacionId} className="p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">{g.filas[0]?.direccion}</span>
              </div>
              <div className="space-y-1.5 pl-1 border-l-2 border-emerald-500/40">
                {g.filas.map((f) => (
                  <Fila key={f.id} f={f} />
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={ocupado === g.operacionId}
                onClick={() =>
                  correr(
                    g.operacionId,
                    () => separarOperacion(g.filas.map((f) => f.id)),
                    "Se separaron: vuelven a contarse por separado"
                  )
                }
              >
                <Link2Off className="w-3.5 h-3.5 mr-1.5" />
                Separar
              </Button>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
