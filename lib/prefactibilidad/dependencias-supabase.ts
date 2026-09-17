// Arma las Dependencias del orquestador con el cliente admin: la caché de parcelas, el Código
// por parcela, las puertas y la RPC de terrenos. Corre en el servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteGcba } from "./gcba";
import type { CacheParcela, Dependencias } from "./analizar";
import type { FilaCur, TerrenoCerca } from "./tipos";

export function dependenciasSupabase(admin: SupabaseClient): Dependencias {
  return {
    gcba: crearClienteGcba(),
    async curDe(smp) {
      const { data } = await admin.from("gcba_parcelas_cur").select("smp, uni_edif, plano_l, tipo_mza, catalogado, dist_1_grp, dist_1_esp, dist_cpu_1, barrio, comuna, publicado").eq("smp", smp).maybeSingle();
      if (!data) return null;
      return { smp: data.smp, uniEdif: (data.uni_edif ?? []).map(Number), planoL: data.plano_l, tipoMza: data.tipo_mza, catalogado: data.catalogado ?? 0, distGrp: data.dist_1_grp, distEsp: data.dist_1_esp, distCpu: data.dist_cpu_1, barrio: data.barrio, comuna: data.comuna, publicado: data.publicado } as FilaCur;
    },
    async puertaEsquina(smp) {
      const { data } = await admin.from("gcba_puertas").select("es_esquina").eq("smp", smp).limit(1).maybeSingle();
      return data ? Boolean(data.es_esquina) : null;
    },
    async terrenosCerca(lat, lng, radioM) {
      const { data, error } = await admin.rpc("prefactibilidad_terrenos_cerca", { p_lat: lat, p_lng: lng, p_radio_m: radioM, p_limit: 200 });
      if (error || !data) return [];
      return (data as any[]).map((r): TerrenoCerca => ({ id: r.id, titulo: r.titulo, direccion: r.direccion, barrio: r.barrio, precioUsd: Number(r.precio_usd), superficieM2: Number(r.superficie_total_m2), distanciaM: Number(r.distancia_m), url: r.url_publica, foto: r.foto_portada }));
    },
    cache: {
      async leer(smp) {
        const { data } = await admin.from("gcba_parcela_cache").select("smp, geom_lote, geom_manzana, catastro, volumenes, manzana_tipo, esquina_oficial").eq("smp", smp).maybeSingle();
        if (!data?.geom_lote || !data.catastro) return null;
        return { smp: data.smp, geomLote: data.geom_lote, geomManzana: data.geom_manzana, catastro: data.catastro, volumenes: data.volumenes ?? [], manzanaTipo: data.manzana_tipo, esquinaOficial: Boolean(data.esquina_oficial) } as CacheParcela;
      },
      async guardar(c) {
        // Si la caché no se puede escribir, el análisis sale igual; pero tiene que quedar en el log,
        // si no la parcela se le pide al GCBA en cada consulta sin que nadie se entere.
        const { error } = await admin.from("gcba_parcela_cache").upsert({ smp: c.smp, geom_lote: c.geomLote, geom_manzana: c.geomManzana, catastro: c.catastro, volumenes: c.volumenes, manzana_tipo: c.manzanaTipo, esquina_oficial: c.esquinaOficial, consultado_en: new Date().toISOString() }, { onConflict: "smp" });
        if (error) console.error("Prefactibilidad: no se pudo guardar la caché de la parcela", c.smp, error.message);
      },
    },
  };
}
