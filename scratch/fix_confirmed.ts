import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: evoData } = await supabase.from('evo_registrations').select('id, school_name, confirmed');
  const { data: regData } = await supabase.from('registrations').select('school_name');
  
  const regNames = regData?.map(r => (r.school_name || '').trim().toLowerCase()) || [];
  
  const missingIds = evoData
    ?.filter(evo => {
      const evoName = (evo.school_name || '').trim().toLowerCase();
      return evo.confirmed && !regNames.includes(evoName);
    })
    .map(evo => evo.id) || [];
    
  if (missingIds.length > 0) {
    console.log(`Fixing ${missingIds.length} stuck schools by setting confirmed = false...`);
    const { error } = await supabase.from('evo_registrations').update({ confirmed: false }).in('id', missingIds);
    if (error) {
      console.error('Error updating:', error);
    } else {
      console.log('Fixed! They can now be re-approved in the admin panel.');
    }
  } else {
    console.log('No stuck schools found.');
  }
}

main();
