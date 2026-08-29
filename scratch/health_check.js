const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTests() {
  console.log('=== THE SUMMONS — Pre-Event Health Check ===\n');

  // 1. Supabase latency
  const t1 = Date.now();
  const { data: state, error: stateErr } = await supabase
    .from('quiz_state').select('subject, status, current_question_index').limit(10);
  const latency = Date.now() - t1;
  console.log(`1. DB latency: ${latency}ms  ${latency < 300 ? '✅ Fast' : latency < 700 ? '⚠️ OK' : '❌ Slow'}`);
  if (stateErr) console.log('   Error:', stateErr.message);
  else {
    console.log('   Quiz states:', state.map(s => `${s.subject}:${s.status}`).join(', ') || 'none');
  }

  // 2. Questions table + time_seconds
  const t2 = Date.now();
  const { data: questions, error: qErr } = await supabase
    .from('questions').select('id, quiz_id, time_seconds').limit(100);
  const qLatency = Date.now() - t2;
  console.log(`\n2. Questions fetch (100): ${qLatency}ms  ${qLatency < 300 ? '✅' : '⚠️'}`);
  if (qErr) console.log('   Error:', qErr.message);
  else {
    const withTime = questions.filter(q => q.time_seconds !== null && q.time_seconds !== undefined);
    const withoutTime = questions.filter(q => q.time_seconds === null || q.time_seconds === undefined);
    console.log(`   Total questions: ${questions.length}`);
    console.log(`   With time_seconds set: ${withTime.length}  ${withTime.length > 0 ? '✅' : '⚠️ All defaulting to 30s'}`);
    if (withoutTime.length > 0) console.log(`   ⚠️ ${withoutTime.length} questions have null time_seconds — will use 30s default`);
  }

  // 3. Sessions table
  const t3 = Date.now();
  const { data: sessions, error: sErr } = await supabase
    .from('quiz_sessions').select('id').limit(1);
  const sLatency = Date.now() - t3;
  console.log(`\n3. quiz_sessions table: ${sLatency}ms  ${sLatency < 300 ? '✅' : '⚠️'}`);
  if (sErr) console.log('   Error:', sErr.message);
  else console.log('   ✅ Accessible');

  // 4. Schools + members count
  const { data: regs } = await supabase.from('registrations').select('id, school_name').eq('confirmed', true);
  const { data: members } = await supabase.from('members').select('id');
  console.log(`\n4. Registrations: ${regs?.length ?? 0} schools, ${members?.length ?? 0} members`);

  // 5. Realtime channel test (just connectivity)
  console.log('\n5. Supabase Realtime: Connecting...');
  const ch = supabase.channel('health-check-test');
  await new Promise((resolve) => {
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('   ✅ Realtime WebSocket connected OK');
        ch.unsubscribe();
        resolve(null);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log(`   ❌ Realtime failed: ${status}`);
        resolve(null);
      }
    });
    setTimeout(() => { console.log('   ⚠️ Realtime timeout (5s)'); resolve(null); }, 5000);
  });

  console.log('\n=== Summary ===');
  if (latency < 500 && !stateErr && !sErr) {
    console.log('✅ All systems GO for tomorrow\'s event!');
  } else {
    console.log('⚠️ Some issues detected — review above');
  }
}

runTests().catch(console.error);
