import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: evoData, error: evoError } = await supabase.from('evo_registrations').select('school_name');
  if (evoError) {
    console.error('Error fetching evo_registrations:', evoError);
    process.exit(1);
  }
  
  const { data: regData, error: regError } = await supabase.from('registrations').select('school_name');
  if (regError) {
    console.error('Error fetching registrations:', regError);
    process.exit(1);
  }
  
  const regNames = regData?.map(r => (r.school_name || '').trim().toLowerCase()) || [];
  
  const missingSchools = evoData
    ?.filter(evo => {
      const evoName = (evo.school_name || '').trim().toLowerCase();
      return !regNames.includes(evoName);
    })
    .map(evo => evo.school_name) || [];
    
  console.log(`Found ${missingSchools.length} missing schools:`);
  missingSchools.forEach((name, idx) => {
    console.log(`${idx + 1}. ${name}`);
  });
}

main();
