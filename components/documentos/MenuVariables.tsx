// El menú que aparece al tipear @ en el editor: las cinco variables del asesor, con lo que
// es cada una. Flechas para moverse, Enter para poner.
"use client";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { VARIABLES } from "@/lib/documentos/variables";

export type ItemVariable = { id: string; label: string; descripcion: string };
export type MenuVariablesRef = { onKeyDown: (p: { event: KeyboardEvent }) => boolean };
type Props = { items: ItemVariable[]; command: (item: { id: string; label: string }) => void };

export const MenuVariables = forwardRef<MenuVariablesRef, Props>(function MenuVariables({ items, command }, ref) {
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === "ArrowUp") { setSel((s) => (s + items.length - 1) % items.length); return true; }
      if (event.key === "ArrowDown") { setSel((s) => (s + 1) % items.length); return true; }
      if (event.key === "Enter") { const it = items[sel]; if (it) command({ id: it.id, label: it.label }); return true; }
      return false;
    },
  }));

  if (!items.length) {
    return <div className="rounded-lg border bg-card p-2 text-xs text-muted-foreground shadow">No hay variables con ese nombre.</div>;
  }
  return (
    <div className="rounded-lg border bg-card shadow-lg overflow-hidden min-w-[260px]" data-testid="menu-variables">
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command({ id: it.id, label: it.label })}
          className={`w-full text-left px-3 py-2 text-sm ${i === sel ? "bg-accent/15" : "hover:bg-muted/60"}`}
        >
          <span className="font-semibold text-accent">{it.label}</span>
          <span className="block text-[11px] text-muted-foreground">{it.descripcion}</span>
        </button>
      ))}
    </div>
  );
});

export const itemsDeVariables = (query: string): ItemVariable[] =>
  VARIABLES
    .filter((v) => v.id.startsWith(query.toLowerCase()))
    .map((v) => ({ id: v.id, label: v.label, descripcion: v.descripcion }));
