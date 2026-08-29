const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  // Add time_seconds column with default 30 seconds
  const { error } = await supabase.rpc('exec_sql', {
    sql: 'ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_seconds INT DEFAULT 30;'
  });

  if (error) {
    // Try raw query via REST (service role)
    console.log('RPC method failed, trying direct approach:', error.message);
    
    // Test if column already exists by fetching one row
    const { data, error: fetchErr } = await supabase
      .from('questions')
      .select('time_seconds')
      .limit(1);
    
    if (fetchErr && fetchErr.message.includes('time_seconds')) {
      console.log('Column does not exist. Please run this SQL in Supabase Dashboard → SQL Editor:');
      console.log('ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_seconds INT DEFAULT 30;');
    } else {
      console.log('Column time_seconds already exists or was added successfully!');
    }
  } else {
    console.log('Migration successful: time_seconds column added to questions table.');
  }
}

migrate();
