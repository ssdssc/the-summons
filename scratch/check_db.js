const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Try fetching time_seconds to see if column exists
  const { data, error } = await supabase.from('questions').select('time_seconds').limit(1);
  if (error && error.message.includes('time_seconds')) {
    console.log('❌ time_seconds column MISSING. Run this in Supabase SQL Editor:');
    console.log('ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_seconds INT DEFAULT 30;');
  } else {
    console.log('✅ time_seconds column exists');
  }

  // Check sessions index
  const { data: sessionCheck, error: sessionErr } = await supabase
    .from('quiz_sessions').select('id').limit(1);
  if (!sessionErr) {
    console.log('✅ quiz_sessions table is accessible');
    console.log('');
    console.log('Run these in Supabase SQL Editor for best performance:');
    console.log('CREATE INDEX IF NOT EXISTS idx_sessions_member_quiz ON quiz_sessions(member_id, quiz_id);');
    console.log('ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_seconds INT DEFAULT 30;');
  }
}

check();
