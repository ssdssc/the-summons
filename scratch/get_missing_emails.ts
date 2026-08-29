import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

const missingSchools = [
  'Royal College', 
  'Isipathana College - Colombo 05', 
  'Bandaranayake College',
  'Visakha Vidyalaya, Colombo 05', 
  'R/Eheliyagoda Central College', 
  'Co/Gothami Balika Vidyalaya',
  'Mahinda Rajapaksha College - Homagama', 
  'd.s.senanayake college'
];

async function main() {
  const { data, error } = await supabase
    .from('evo_registrations')
    .select('school_name, email')
    .in('school_name', missingSchools);
    
  if (error) {
    console.error(error);
  } else {
    data.forEach(s => {
      console.log(`- **${s.school_name}** (${s.email})`);
    });
  }
}

main();
