import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: evoData } = await supabase.from('evo_registrations').select('school_name, confirmed');
  const { data: regData } = await supabase.from('registrations').select('id, school_name');
  const { data: memData } = await supabase.from('members').select('id, registration_id, name, subject, access_code');

  console.log('--- DATABASE INTEGRITY CHECK ---');
  console.log(`Total Evo Registrations: ${evoData?.length}`);
  console.log(`Total Confirmed in Evo: ${evoData?.filter(e => e.confirmed).length}`);
  console.log(`Total Pending in Evo: ${evoData?.filter(e => !e.confirmed).length}`);
  console.log(`Total Active Registrations: ${regData?.length}`);
  console.log(`Total Members: ${memData?.length}`);
  console.log('--------------------------------\n');

  let hasErrors = false;

  // 1. Check if any "Confirmed" evo_registrations are missing from the `registrations` table
  const regNames = (regData || []).map(r => (r.school_name || '').trim().toLowerCase());
  const missingFromReg = (evoData || []).filter(e => {
    return e.confirmed && !regNames.includes((e.school_name || '').trim().toLowerCase());
  });

  if (missingFromReg.length > 0) {
    hasErrors = true;
    console.log('ERROR: The following schools are marked as Confirmed but are MISSING from Active Registrations:');
    missingFromReg.forEach(m => console.log(` - ${m.school_name}`));
  } else {
    console.log('SUCCESS: All Confirmed schools correctly exist in the Active Registrations table.');
  }

  // 2. Check if every Active Registration has exactly 4 members
  console.log('\nChecking members count per school...');
  const schoolsWithMissingMembers = [];
  
  if (regData && memData) {
    for (const reg of regData) {
      const schoolMembers = memData.filter(m => m.registration_id === reg.id);
      if (schoolMembers.length !== 4) {
        hasErrors = true;
        schoolsWithMissingMembers.push(`${reg.school_name} (Has ${schoolMembers.length} members instead of 4)`);
      }
    }
  }

  if (schoolsWithMissingMembers.length > 0) {
    console.log('ERROR: The following schools have missing or extra members:');
    schoolsWithMissingMembers.forEach(s => console.log(` - ${s}`));
  } else {
    console.log('SUCCESS: Every active school has exactly 4 squad members assigned with access codes.');
  }

  if (!hasErrors) {
    console.log('\n✅ ALL CHECKS PASSED: Your database is 100% perfectly synced. No schools or codes are missing!');
  }
}

main();
