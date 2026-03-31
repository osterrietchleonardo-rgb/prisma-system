import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { normalizeLead } from './app/director/leads/components/tokko-leads-utils';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  const { data, error } = await supabase.from('leads').select('*').limit(50);
  if (error) {
    console.error("DB Error:", error);
    return;
  }
  let successCount = 0;
  for (let lead of data) {
    if (lead.tokko_raw) {
      try {
        let raw = lead.tokko_raw;
        raw.created_at = lead.tokko_created_date || raw.created_at || raw.created_date || raw.date || lead.created_at;
        normalizeLead(raw);
        successCount++;
      } catch (e) {
        console.error('Failed to normalize:', lead.id);
        console.error(e);
      }
    } else {
        console.log('No tokko raw for', lead.id);
    }
  }
  console.log('Successfully normalized', successCount, 'leads');
}
run();
