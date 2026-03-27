
import { createClient } from './lib/supabase/server';

async function checkColumns() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('consultor_chat_sessions').select('*').limit(1);
  if (error) {
    console.error("Error fetching session record:", error);
    return;
  }
  if (data && data.length > 0) {
    console.log("Existing columns:", Object.keys(data[0]));
  } else {
    console.log("No sessions found to check columns, attempting query from information_schema via RPC if possible...");
    // Fallback if no records exist:
    const { data: columns, error: colError } = await (supabase as any).rpc('get_table_columns_manual', { t_name: 'consultor_chat_sessions' });
    console.log(columns || colError);
  }
}

checkColumns();
