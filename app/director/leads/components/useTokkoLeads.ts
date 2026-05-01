import { useState, useCallback, useEffect } from "react";
import { TokkoLead, NormalizedLead, normalizeLead } from "./tokko-leads-utils";
import { createClient } from "@/lib/supabase/client";

// Helper to normalize a single DB lead (extracted from the loop for performance/cleanliness)
const normalizeDbLead = (dbLead: any): NormalizedLead | null => {
  try {
    let norm: NormalizedLead;

    // 1. Si el lead viene de Tokko y tiene su JSON original, lo mapeamos
    if (dbLead.tokko_raw) {
      // Merge DB fields into the raw data for normalization
      const raw = { 
        ...dbLead.tokko_raw,
        pipeline_stage: dbLead.pipeline_stage 
      };
      
      if (dbLead.assigned_agent) {
         raw.agent = {
           id: dbLead.assigned_agent.id,
           name: dbLead.assigned_agent.full_name,
           email: dbLead.assigned_agent.email || "",
           phone: dbLead.assigned_agent.phone || "",
           cellphone: dbLead.assigned_agent.phone || "",
           position: "Agente Asignado",
           picture: dbLead.assigned_agent.avatar_url || ""
         };
      }
      
      // Ensure original tokko date is used for dias_en_sistema and created_at
      raw.created_at = dbLead.tokko_created_date || raw.created_at || raw.created_date || raw.date || dbLead.created_at;

      norm = normalizeLead(raw);
    } else {
      // 2. Si es un lead manual de Supabase (creado en la interfaz), construimos un TokkoLead compatible
      const validPhones = [dbLead.phone].filter(Boolean);
      const mapStatus = (stage: string) => {
        if (stage === "perdido") return "Perdido";
        if (stage === "ganado") return "Cerrado";
        if (stage === "nuevo") return "Activo";
        return "En negociación";
      };

      const manualTokko: TokkoLead = {
        id: dbLead.id,
        name: dbLead.full_name || "Sin nombre",
        email: dbLead.email || "",
        other_email: "",
        work_email: "",
        phone: validPhones[0] || "",
        cellphone: validPhones[0] || "",
        other_phone: "",
        birthdate: null,
        document_number: "",
        work_name: "",
        work_position: "",
        lead_status: mapStatus(dbLead.pipeline_stage),
        is_owner: false,
        is_company: false,
        created_at: dbLead.created_at,
        deleted_at: null,
        tags: [],
        related_to_companies: []
      };
      
      if (dbLead.assigned_agent) {
           manualTokko.agent = {
             id: dbLead.assigned_agent.id as any,
             name: dbLead.assigned_agent.full_name,
             email: dbLead.assigned_agent.email || "",
             phone: dbLead.assigned_agent.phone || "",
             cellphone: dbLead.assigned_agent.phone || "",
             picture: dbLead.assigned_agent.avatar_url || "",
             position: ""
           };
      }
      
      norm = normalizeLead(manualTokko);
      if (dbLead.source) norm.origen = dbLead.source;
    }

    // Always ensure the Supabase UUID is the ID used in the UI
    norm.id = dbLead.id;
    return norm;
  } catch (e) {
    console.error("Failed to normalize lead:", dbLead.id, e);
    return null;
  }
};

export const useTokkoLeads = () => {
  const [leads, setLeads] = useState<NormalizedLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetchLeads = useCallback(async (isRefetch = false) => {
    setLoading(true);
    setError(null);
    if (isRefetch) setLeads([]); // Reset on manual refresh

    let allLeads: NormalizedLead[] = [];

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("agency_id")
        .eq("id", session.user.id)
        .single();
      
      if (!profile?.agency_id) throw new Error("Sin agencia");

      const CHUNK_SIZE = 500; 
      let currentOffset = 0;
      let hasMore = true;
      let firstBatchDone = false;
      const totalToLimit = 5000; 

      while (hasMore && currentOffset < totalToLimit) {
        const { data: dbLeadsChunk, error: dbError } = await supabase
          .from("leads")
          .select(`
            *,
            assigned_agent:profiles(id, full_name, avatar_url, email, phone)
          `)
          .eq("agency_id", profile.agency_id)
          .order("created_at", { ascending: false })
          .range(currentOffset, currentOffset + CHUNK_SIZE - 1);

        if (dbError) throw dbError;

        if (dbLeadsChunk && dbLeadsChunk.length > 0) {
          const chunkNormalized = dbLeadsChunk.map(dbLead => normalizeDbLead(dbLead)).filter(Boolean) as NormalizedLead[];
          
          allLeads = [...allLeads, ...chunkNormalized];
          
          // Incremental update to keep UI responsive
          setLeads([...allLeads]);
          
          if (!firstBatchDone) {
             setLoading(false); 
             firstBatchDone = true;
          }

          if (dbLeadsChunk.length < CHUNK_SIZE) {
            hasMore = false;
          } else {
            currentOffset += CHUNK_SIZE;
          }
        } else {
          hasMore = false;
        }
      }

      setLastSync(new Date());
      return allLeads;
    } catch (err: any) {
      console.error("useTokkoLeads DB error:", err.message);
      setError(err.message || "Error al obtener leads");
      return allLeads;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads(false).catch(() => {});
  }, [fetchLeads]);

  return { leads, loading, error, refetch: () => fetchLeads(true), lastSync };
};
