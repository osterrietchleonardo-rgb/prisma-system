"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Save, Target, Copy, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getAgencyAdvisors,
  getObjectivesForEditor,
  saveObjectives,
} from "@/actions/tracking/objetivos";
import {
  MONTH_NAMES,
  OBJECTIVE_METRICS,
  isMonthLocked,
  type ObjectiveMetric,
} from "@/lib/tracking/objetivos-types";

interface Advisor {
  id: string;
  name: string;
}

// key: `${agentId}|${metric}|${month}` -> string (raw input)
type ValuesMap = Record<string, string>;

const cellKey = (agentId: string, metric: ObjectiveMetric, month: number) =>
  `${agentId}|${metric}|${month}`;

export function PerformanceObjectivesEditor() {
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();

  const [year, setYear] = useState<number>(currentYear);
  const [metric, setMetric] = useState<ObjectiveMetric>("facturacion");
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [values, setValues] = useState<ValuesMap>({});
  const [bulk, setBulk] = useState<Record<string, string>>({}); // agentId -> bulk value
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) arr.push(y);
    return arr.reverse();
  }, [currentYear]);

  const metricMeta = OBJECTIVE_METRICS.find((m) => m.key === metric)!;
  const isYearReadOnly = year < currentYear;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [adv, objs] = await Promise.all([
        getAgencyAdvisors(),
        getObjectivesForEditor(year),
      ]);
      setAdvisors(adv);
      const next: ValuesMap = {};
      for (const o of objs) {
        next[cellKey(o.agent_id, o.metric, o.month)] = String(Number(o.target_value) || 0);
      }
      setValues(next);
      setBulk({});
      setDirty(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudieron cargar los objetivos");
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const setCell = (agentId: string, month: number, raw: string) => {
    setValues((prev) => ({ ...prev, [cellKey(agentId, metric, month)]: raw }));
    setDirty(true);
  };

  const applyToAll = (agentId: string) => {
    const raw = bulk[agentId];
    if (raw === undefined || raw === "") {
      toast.error("Escribe un valor para aplicar a todos los meses");
      return;
    }
    setValues((prev) => {
      const next = { ...prev };
      for (let m = 1; m <= 12; m++) {
        if (!isMonthLocked(year, m, now)) {
          next[cellKey(agentId, metric, m)] = raw;
        }
      }
      return next;
    });
    setDirty(true);
    toast.success("Valor aplicado a los meses editables");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Enviamos todas las celdas editables (no cerradas) de AMBAS métricas, para
      // no perder ediciones hechas en la otra pestaña de métrica.
      const cells: { agent_id: string; month: number; metric: ObjectiveMetric; target_value: number }[] = [];
      for (const adv of advisors) {
        for (const mt of OBJECTIVE_METRICS) {
          for (let m = 1; m <= 12; m++) {
            if (isMonthLocked(year, m, now)) continue;
            const raw = values[cellKey(adv.id, mt.key, m)];
            if (raw === undefined || raw === "") continue;
            const num = Number(raw);
            if (!Number.isFinite(num)) continue;
            cells.push({ agent_id: adv.id, month: m, metric: mt.key, target_value: num });
          }
        }
      }
      const res = await saveObjectives({ year, cells });
      toast.success(`Objetivos guardados (${res.saved} valores)`);
      setDirty(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "No se pudieron guardar los objetivos");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Métrica toggle */}
          <div className="flex bg-muted/30 p-1 rounded-xl border border-white/5">
            {OBJECTIVE_METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  metric === m.key
                    ? "bg-accent text-white shadow-lg shadow-accent/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Año */}
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px] h-9 bg-background/30 border-white/10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                  {y === currentYear ? " (actual)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isYearReadOnly && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-white/5">
              <Lock className="w-3 h-3" /> Solo lectura (año cerrado)
            </span>
          )}
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving || isLoading || isYearReadOnly || !dirty}
          className="bg-accent hover:bg-accent/90 text-white font-bold h-10 px-6 rounded-xl gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar objetivos
        </Button>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground border-2 border-dashed border-accent/10 rounded-[2rem] bg-accent/5">
          <Loader2 className="w-10 h-10 animate-spin text-accent/50" />
          <p className="font-medium tracking-wide">Cargando objetivos...</p>
        </div>
      ) : advisors.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground/60 border-2 border-dashed border-accent/10 rounded-[2rem]">
          <Target className="w-10 h-10 opacity-20" />
          <p className="italic text-sm">No hay asesores en la inmobiliaria todavía.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-md overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2 text-accent">
            <Target className="w-4 h-4" />
            <span className="text-sm font-bold">
              Objetivo mensual de {metricMeta.label} {year}
            </span>
            <span className="text-[11px] text-muted-foreground ml-1">
              {metricMeta.unit === "usd" ? "(USD por mes)" : "(cantidad por mes)"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[1100px]">
              <thead className="bg-muted/30 text-muted-foreground/70 border-y border-accent/5">
                <tr>
                  <th className="px-5 py-3 font-bold min-w-[180px] sticky left-0 bg-muted/95 backdrop-blur-md z-10 border-r border-accent/10">
                    Asesor
                  </th>
                  {MONTH_NAMES.map((mn, i) => {
                    const locked = isMonthLocked(year, i + 1, now);
                    return (
                      <th
                        key={mn}
                        className={`px-2 py-3 font-bold text-center text-[11px] ${
                          locked ? "opacity-40" : ""
                        }`}
                      >
                        {mn}
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 font-bold text-center min-w-[200px] border-l border-accent/10">
                    Aplicar a todos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/5">
                {advisors.map((adv) => (
                  <tr key={adv.id} className="hover:bg-accent/5 transition-colors">
                    <td className="px-5 py-3 sticky left-0 bg-card/95 backdrop-blur-md z-10 border-r border-accent/10 font-semibold text-foreground/90 truncate max-w-[180px]">
                      {adv.name}
                    </td>
                    {MONTH_NAMES.map((mn, i) => {
                      const month = i + 1;
                      const locked = isMonthLocked(year, month, now) || isYearReadOnly;
                      const v = values[cellKey(adv.id, metric, month)] ?? "";
                      return (
                        <td key={mn} className="px-1.5 py-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            inputMode="decimal"
                            value={v}
                            disabled={locked}
                            onChange={(e) => setCell(adv.id, month, e.target.value)}
                            placeholder="0"
                            className={`h-8 w-[80px] text-center text-xs px-1 rounded-lg bg-background/40 border-white/5 ${
                              locked ? "opacity-40 cursor-not-allowed" : "focus:border-accent/50"
                            }`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-l border-accent/10">
                      <div className="flex items-center gap-1.5 justify-center">
                        <Input
                          type="number"
                          min={0}
                          value={bulk[adv.id] ?? ""}
                          disabled={isYearReadOnly}
                          onChange={(e) => setBulk((p) => ({ ...p, [adv.id]: e.target.value }))}
                          placeholder="valor"
                          className="h-8 w-[90px] text-center text-xs rounded-lg bg-background/40 border-white/5"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isYearReadOnly}
                          onClick={() => applyToAll(adv.id)}
                          className="h-8 px-2 gap-1 text-[11px] rounded-lg border-accent/20"
                        >
                          <Copy className="w-3 h-3" /> Aplicar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11px] text-muted-foreground border-t border-accent/5">
            Los meses ya cerrados aparecen bloqueados. Solo se pueden editar el mes en curso y los
            futuros. "Aplicar a todos" copia el valor a los meses editables de ese asesor.
          </p>
        </div>
      )}
    </div>
  );
}
