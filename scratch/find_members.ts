import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: members } = await supabase.from('members').select('id, name, registration_id, access_code');
  const { data: regs } = await supabase.from('registrations').select('id, school_name');
  
  console.log(`Total registrations: ${regs?.length}`);
  console.log(`Total members: ${members?.length}`);
  
  // Try to find if any members belong to the missing schools (based on their registration_id)
  // Let's do a loose search on members.name to see if any names from evo match
  
  const { data: missingEvo } = await supabase.from('evo_registrations')
    .select('school_name, captain_name')
    .in('school_name', [
      'Royal College', 'Isipathana College - Colombo 05', 'Bandaranayake College',
      'Visakha Vidyalaya, Colombo 05', 'R/Eheliyagoda Central College', 'Co/Gothami Balika Vidyalaya',
      'Mahinda Rajapaksha College - Homagama', 'd.s.senanayake college'
    ]);
    
  if (missingEvo) {
    for (const evo of missingEvo) {
      const captainName = evo.captain_name;
      const foundMember = members?.find(m => m.name.toLowerCase() === captainName.toLowerCase());
      if (foundMember) {
        const reg = regs?.find(r => r.id === foundMember.registration_id);
        console.log(`Found captain ${captainName} for ${evo.school_name}!`);
        console.log(` -> They are currently under registration: ${reg?.school_name} (ID: ${reg?.id})`);
        console.log(` -> Code: ${foundMember.access_code}`);
      } else {
        console.log(`Could not find captain ${captainName} (${evo.school_name}) in the members table.`);
      }
    }
  }
}

main();
