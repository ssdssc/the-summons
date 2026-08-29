import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://dzzblbrmdaryttwplfrb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6emJsYnJtZGFyeXR0d3BsZnJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0OTM0MywiZXhwIjoyMDk2MTI1MzQzfQ.shLBFLbiL-dzo-w9T6Bl58Cf9V96HwcxCWhxJPo7Q1s';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: members } = await supabase.from('members').select('*');
  const { data: regs } = await supabase.from('registrations').select('*');
  
  const allData = {
    registrations: regs,
    members: members
  };
  
  fs.writeFileSync('e:\\ssdssc\\the-summons\\scratch\\db_dump.json', JSON.stringify(allData, null, 2));
  console.log(`Dumped ${regs?.length} registrations and ${members?.length} members to db_dump.json`);
}

main();
