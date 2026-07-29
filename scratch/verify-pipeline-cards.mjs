// Comprueba la agrupación del pipeline contra los datos reales.
// Uso: node scratch/verify-pipeline-cards.mjs
import fs from "node:fs";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

// Misma regla que lib/whatsapp/phone.ts (incluido el "9" móvil de Argentina).
function normalizePhoneE164(raw, country = "AR") {
  if (!raw) return null;
  try {
    const pn = parsePhoneNumberFromString(String(raw).trim(), country);
    if (pn && pn.isValid()) {
      let d = pn.number.replace(/\D/g, "");
      if (country === "AR" && d.startsWith("54") && !d.startsWith("549")) d = "549" + d.slice(2);
      return d;
    }
  } catch {}
  return null;
}

const q = async (sql) => {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${get("SUPABASE_PROJECT_REF")}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${get("SUPABASE_API_KEY_MANAGEMENT")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const out = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(out));
  return out;
};

const logs = await q(`
  select pl.id, pl.type, pl.status, pl.created_at, pl.fecha_actividad,
         pl.lead_id, pl.wa_contact_id, pl.propiedad_ref,
         l.full_name lead_name, l.phone lead_phone,
         w.name wa_name, w.phone wa_phone
  from performance_logs pl
  left join leads l on l.id = pl.lead_id
  left join wa_contacts w on w.id = pl.wa_contact_id
  order by pl.created_at desc
`);

const vivos = logs.filter((l) => l.status !== "eliminada");
let sinCliente = 0;
const porCliente = new Map();

for (const log of vivos) {
  let key = null;
  if (log.wa_contact_id) key = normalizePhoneE164(log.wa_phone) ?? `wa:${log.wa_contact_id}`;
  else if (log.lead_id) key = normalizePhoneE164(log.lead_phone) ?? `lead:${log.lead_id}`;
  if (!key) { sinCliente++; continue; }
  if (!porCliente.has(key)) porCliente.set(key, []);
  porCliente.get(key).push(log);
}

console.log(`Actividades vivas: ${vivos.length}`);
console.log(`Sin cliente vinculado (no generan tarjeta): ${sinCliente}`);
console.log(`Tarjetas que se arman: ${porCliente.size}\n`);

for (const [key, items] of porCliente) {
  const ultima = items[0];
  const nombre = ultima.wa_name || ultima.lead_name || key;
  console.log(
    `- ${nombre} [${key}] → etapa ${ultima.type} | ${items.length} activ. | etapas: ${[...new Set(items.map((i) => i.type))].join(", ")}`
  );
}
