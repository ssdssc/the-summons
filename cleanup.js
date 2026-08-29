import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Deleting ID 45 from evo_registrations...');
  const { error } = await supabase.from('evo_registrations').delete().eq('id', 45);
  
  if (error) {
    console.error('Error deleting:', error);
  } else {
    console.log('Successfully deleted S.Thomas\' college (ID 45). They can now register again!');
  }
}

run();
