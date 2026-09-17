import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const sql = (n: string) => readFileSync(path.resolve(__dirname, "../../supabase/migrations", n), "utf8");

describe("las migraciones de prefactibilidad respetan las reglas de la casa", () => {
  const gcba = sql("20260918100000_prefactibilidad_gcba.sql");
  const pref = sql("20260918100100_prefactibilidades.sql");
  it("van en transacción", () => {
    // Los comentarios de cabecera van ANTES del begin (convención del repo): se ignoran para el chequeo.
    const sinComentarios = (s: string) => s.replace(/^--.*$/gm, "").trim();
    for (const s of [gcba, pref]) { expect(sinComentarios(s).startsWith("begin;")).toBe(true); expect(sinComentarios(s).endsWith("commit;")).toBe(true); }
  });
  it("las tablas del GCBA son de solo lectura para la app", () => {
    for (const t of ["gcba_parcelas_cur", "gcba_puertas", "gcba_parcela_cache"]) {
      expect(gcba).toContain(`alter table public.${t} enable row level security`);
      expect(gcba).toContain(`revoke insert, update, delete on public.${t} from authenticated, anon`);
    }
  });
  it("prefactibilidades: RLS por agencia y sin escritura directa; la ficha pública solo por token desde el servidor", () => {
    expect(pref).toContain("alter table public.prefactibilidades enable row level security");
    expect(pref).toContain("user_id = auth.uid()");
    expect(pref).toContain("agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director')");
    expect(pref).toContain("revoke insert, update, delete on public.prefactibilidades from authenticated, anon");
    expect(pref).toContain("token text unique");
  });
  it("la RPC de terrenos usa el índice geográfico y solo la puede ejecutar el servidor", () => {
    expect(pref).toContain("ST_DWithin(m.geom");
    expect(pref).toContain("m.tipo = 'Terrenos'");
    expect(pref).toContain("revoke execute on function public.prefactibilidad_terrenos_cerca");
    expect(pref).toContain("grant execute on function public.prefactibilidad_terrenos_cerca");
  });
});
