const { createClient } = require('@supabase/supabase-js');
const { normalizeLead } = require('./app/director/leads/components/tokko-leads-utils');

const supabase = createClient('https://vutopjvdrwmvrkgnrfno.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dG9wanZkcndtdnJrZ25yZm5vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcwNzg3MSwiZXhwIjoyMDg5MjgzODcxfQ.4vgtdLyJFPmnL66tKwk7rCLgaL1wr5eYfqAgbl6H5no');

async function run() {
  const { data, error } = await supabase.from('leads').select('*').limit(50);
  if (error) {
    console.error('DB ERROR:', error.message);
    return;
  }
  let successCount = 0;
  for (let lead of data) {
    if (lead.tokko_raw) {
      try {
        let raw = lead.tokko_raw;
        raw.created_at = lead.tokko_created_date || raw.created_at || raw.created_date || raw.date || lead.created_at;
        // Mock date-fns methods
        normalizeLead(raw);
        successCount++;
      } catch (e) {
        console.error('Failed to normalize:', lead.id);
        console.error(e);
      }
    }
  }
  console.log('Successfully normalized', successCount, 'leads');
}
run();
