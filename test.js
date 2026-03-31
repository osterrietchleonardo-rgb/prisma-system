const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://vutopjvdrwmvrkgnrfno.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dG9wanZkcndtdnJrZ25yZm5vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcwNzg3MSwiZXhwIjoyMDg5MjgzODcxfQ.4vgtdLyJFPmnL66tKwk7rCLgaL1wr5eYfqAgbl6H5no');
async function run() {
  const { data, error } = await supabase.from('leads').select('*, assigned_agent:profiles(id, full_name, avatar_url, email, phone)').limit(1);
  if (error) console.error('DB ERROR:', error.message);
  else console.log('SUCCESS:', data.length);
}
run();
