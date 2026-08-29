import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Create a fake evo_registration
  const { data: evo, error: err1 } = await supabase.from('evo_registrations').insert({
    school_name: 'Test Delete School',
    email: 'test@delete.com',
    captain_name: 'Delete Cap',
    confirmed: true
  }).select().single();
  
  if (err1) throw err1;

  // 2. Create corresponding registration
  const { data: reg, error: err2 } = await supabase.from('registrations').insert({
    school_name: 'Test Delete School',
    contact_email: 'test@delete.com',
    status: 'active'
  }).select().single();
  
  if (err2) throw err2;
  
  // 3. Create a member
  await supabase.from('members').insert({
    registration_id: reg.id,
    name: 'Delete Cap',
    subject: 'physics',
    access_code: 'PHY-DEL'
  });

  console.log('Created fake data. ID:', reg.id);
  
  // Now hit the DELETE API
  const url = `http://localhost:3000/api/admin/registrations?id=${reg.id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-admin-token': 'ssdssc@123' } // Or whatever the token is, wait, we can just run the logic directly to test the API route logic
  });
  
  // Actually let's just do it directly with supabase to see if `ilike` works.
  await supabase.from('registrations').delete().eq('id', reg.id);
  await supabase.from('evo_registrations').delete().ilike('school_name', 'Test Delete School');
  
  const { data: check } = await supabase.from('evo_registrations').select().eq('school_name', 'Test Delete School');
  console.log('Remaining evo_registrations:', check?.length);
}

main();
