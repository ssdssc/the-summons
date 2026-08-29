import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const schoolName = 'R/Eheliyagoda Central College';
  
  // 1. Get raw evo registration to pull the email
  const { data: raw, error: fetchErr } = await supabase
    .from('evo_registrations')
    .select('*')
    .eq('school_name', schoolName)
    .single();
    
  if (fetchErr || !raw) {
    console.error('Could not find raw registration:', fetchErr);
    return;
  }
  
  // Cleanup any failed registration from earlier attempt without members
  await supabase.from('registrations').delete().eq('school_name', schoolName);

  // 2. Insert into registrations
  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .insert({ 
      school_name: raw.school_name, 
      contact_email: raw.email, 
      status: 'active' 
    })
    .select()
    .single();
    
  if (regErr || !reg) {
    console.error('Failed to create registration:', regErr);
    return;
  }

  // 3. Insert specific members with exact codes
  const membersData = [
    { registration_id: reg.id, name: 'P.A.Kethaka Gimhan', subject: 'chemistry', is_captain: true, access_code: 'CHE-LKKE' },
    { registration_id: reg.id, name: 'A.A.Nushada Seneth Kalpa', subject: 'physics', is_captain: false, access_code: 'PHY-ZGDZ' },
    { registration_id: reg.id, name: 'R.L.A,Kavindu Peshan Rathnayake', subject: 'biology', is_captain: false, access_code: 'BIO-4VS5' },
    { registration_id: reg.id, name: 'M.M.Salinda Sadaruwan Rathnayaka', subject: 'maths', is_captain: false, access_code: 'MAT-WSMV' }
  ];

  const { error: memErr } = await supabase.from('members').insert(membersData);
  if (memErr) {
    console.error('Failed to insert members:', memErr);
    return;
  }

  // 4. Mark evo_registration as confirmed
  await supabase.from('evo_registrations').update({ confirmed: true }).eq('id', raw.id);

  console.log(`Successfully recovered ${schoolName} with exact access codes!`);
}

main();
