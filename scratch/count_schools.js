const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchools() {
  const { count, error } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true });
    
  if (error) {
    console.error('Error fetching registrations:', error);
  } else {
    console.log(`Number of registered schools: ${count}`);
  }
}

checkSchools();
