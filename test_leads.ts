import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data } = await supabase.from('leads').select('id, phone, source').limit(10);
  console.log('Leads limit 10:', data);

  const { data: specificLead } = await supabase.from('leads').select('id, phone, source, pipeline_stage').eq('phone', '5492213089334');
  console.log('Specific Lead 5492213089334:', specificLead);

  const { data: convData } = await supabase.from('wa_conversations').select('*');
  console.log(`Found ${convData?.length} conversations.`);

  for (const conv of convData || []) {
    const { data: lead } = await supabase.from('leads').select('id').eq('phone', conv.contact_phone).single();
    if (!lead) {
      console.log(`Creating lead for ${conv.contact_phone}...`);
      const newLead = {
        agency_id: conv.agency_id,
        phone: conv.contact_phone,
        full_name: conv.contact_name || 'Sin nombre',
        source: 'WhatsApp',
        tokko_origin: 'WhatsApp',
        pipeline_stage: 'nuevo',
        status: 'pending',
        assigned_agent_id: conv.agent_id
      };
      await supabase.from('leads').insert([newLead]);
      console.log(`Created lead for ${conv.contact_phone}`);
    }

    const { data: contact } = await supabase.from('wa_contacts').select('id').eq('phone', conv.contact_phone).single();
    if (!contact) {
      console.log(`Creating contact for ${conv.contact_phone}...`);
      const newContact = {
        agency_id: conv.agency_id,
        phone: conv.contact_phone,
        name: conv.contact_name || 'Sin nombre',
        lead_id: lead ? lead.id : null // We might need the new lead id here
      };
      // Let's get the lead again to ensure we have the ID
      const { data: currentLead } = await supabase.from('leads').select('id').eq('phone', conv.contact_phone).single();
      if (currentLead) {
         newContact.lead_id = currentLead.id;
      }
      await supabase.from('wa_contacts').insert([newContact]);
      console.log(`Created contact for ${conv.contact_phone}`);
    }
  }
  console.log('Done!');
}
run();
