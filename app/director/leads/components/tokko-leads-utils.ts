import { differenceInDays, differenceInYears } from "date-fns";

export interface TokkoTag {
  id: number;
  group_name: string | null;
  name: string;
}

export interface TokkoLead {
  id: number | string;
  name: string;
  email: string;
  other_email: string;
  work_email: string;
  phone: string;
  cellphone: string;
  other_phone: string;
  birthdate: string | null;
  document_number: string;
  work_name: string;
  work_position: string;
  lead_status: string;
  is_owner: boolean;
  is_company: boolean;
  created_at: string;
  deleted_at: string | null;
  agent?: {
    id: number;
    name: string;
    email: string;
    phone: string;
    cellphone: string;
    picture: string;
    position: string;
  };
  tags: TokkoTag[];
  related_to_companies: any[];
}

export interface NormalizedLead extends TokkoLead {
  dias_en_sistema: number;
  pipeline_stage: string;
  tiempo_de_cierre: number | null;
  tiempo_de_cierre_horas: number | null;
  telefono_principal: string | null;
  telefonos_secundarios: string[];
  email_principal: string | null;
  emails_secundarios: string[];
  tiene_contacto: boolean;
  tiene_nombre: boolean;
  es_corporativo: boolean;
  agente_activo: boolean;
  edad: number | null;
  origen: string;
  tipo_cliente: string | null;
  tipo_propiedad: string[];
  operacion: string;
  tags_sin_grupo: TokkoTag[];
  score_calidad_lead: number;
  nombre_mostrar: string;
}

export const normalizeLead = (lead: TokkoLead): NormalizedLead => {
  const hoy = new Date();
  
  // Safe date parsing
  const createdDate = new Date(lead.created_at || (lead as any).created_date || (lead as any).date || Date.now());
  const deletedDate = lead.deleted_at ? new Date(lead.deleted_at) : null;
  
  const createdValid = !isNaN(createdDate.getTime());
  const deletedValid = deletedDate && !isNaN(deletedDate.getTime());
  
  const dias_en_sistema = createdValid ? differenceInDays(hoy, createdDate) : 0;
  const tiempo_de_cierre = deletedValid && createdValid && lead.deleted_at !== lead.created_at
    ? differenceInDays(deletedDate, createdDate)
    : null;
    
  const diffMs = deletedValid && createdValid ? deletedDate.getTime() - createdDate.getTime() : 0;
  const tiempo_de_cierre_horas = deletedValid && createdValid && diffMs > 0
    ? Math.max(0.1, Math.round(diffMs / (1000 * 60 * 60) * 10) / 10)
    : null;

  // Safe string array filters
  const validPhones = [lead.cellphone, lead.phone, lead.other_phone]
    .filter(p => !!p && typeof p === "string" && p.trim() !== "")
    .map(p => String(p).trim());
    
  const telefono_principal = validPhones[0] || null;
  const telefonos_secundarios = validPhones.slice(1);

  const validEmails = [lead.email, lead.work_email, lead.other_email]
    .filter(e => !!e && typeof e === "string" && e.trim() !== "")
    .map(e => String(e).trim());
    
  const email_principal = validEmails[0] || null;
  const emails_secundarios = validEmails.slice(1);

  const tiene_contacto = telefono_principal !== null || email_principal !== null;
  
  const rawNameStr = typeof lead.name === "string" ? lead.name.trim() : String(lead.name || "").trim();
  let nombre_mostrar = rawNameStr;
  let tiene_nombre = true;
  if (!rawNameStr || rawNameStr === "Sin nombre") {
    tiene_nombre = false;
    if (email_principal) {
      nombre_mostrar = email_principal.split("@")[0];
    } else {
      nombre_mostrar = "Sin nombre";
    }
  }

  const es_corporativo = Boolean(lead.is_company || (Array.isArray(lead.related_to_companies) && lead.related_to_companies.length > 0));
  const agente_activo = Boolean(lead.agent && typeof lead.agent.picture === "string" && !lead.agent.picture.includes("user_disabled"));

  let edad: number | null = null;
  if (lead.birthdate) {
    const bdate = new Date(lead.birthdate);
    if (!isNaN(bdate.getTime())) {
      edad = differenceInYears(hoy, bdate);
    }
  }

  const safeTags = Array.isArray(lead.tags) ? lead.tags : [];

  const origen = 
    safeTags.find((t) => t && t.group_name === "Origen de contacto")?.name ??
    safeTags.find((t) => t && t.group_name === null && ["ICasas", "Clienapp"].includes(t.name))?.name ??
    "Sin etiqueta";

  const tipo_cliente = safeTags.find((t) => t && t.group_name === "Tipo de cliente")?.name ?? null;
  const tipo_propiedad = safeTags.filter((t) => t && t.group_name === "Tipo de propiedad").map((t) => t.name) ?? [];
  const operacion = safeTags.find((t) => t && t.group_name === "Operación")?.name ?? "Sin dato";
  const tags_sin_grupo = safeTags.filter((t) => t && t.group_name === null) ?? [];

  const score_calidad_lead = [
    tiene_nombre ? 25 : 0,
    email_principal ? 25 : 0,
    telefono_principal ? 25 : 0,
    safeTags.length > 0 ? 25 : 0,
  ].reduce((a, b) => a + b, 0);

  return {
    ...lead,
    dias_en_sistema,
    pipeline_stage: (lead as any).pipeline_stage || "nuevo",
    tiempo_de_cierre,
    tiempo_de_cierre_horas,
    telefono_principal,
    telefonos_secundarios,
    email_principal,
    emails_secundarios,
    tiene_contacto,
    tiene_nombre,
    es_corporativo,
    agente_activo,
    edad,
    origen,
    tipo_cliente,
    tipo_propiedad,
    operacion,
    tags_sin_grupo,
    score_calidad_lead,
    nombre_mostrar
  };
};
