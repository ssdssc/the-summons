import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
const SUBJECT = process.argv[2] || 'biology'
const MAX_USERS = parseInt(process.argv[3] || '35')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log(`Starting load test for subject: ${SUBJECT}`)
  
  // 1. Fetch member access codes
  const { data: members, error } = await supabase
    .from('members')
    .select('id, name, access_code')
    .eq('subject', SUBJECT)
    .limit(MAX_USERS)
    
  if (error || !members || members.length === 0) {
    console.error('Failed to fetch members:', error)
    return
  }
  
  console.log(`Found ${members.length} members. Logging them in...`)
  
  const bots: any[] = []
  
  for (const member of members) {
    try {
      const res = await fetch(`${BASE_URL}/api/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: member.access_code })
      })
      const data = await res.json()
      if (res.ok && data.member && data.quiz) {
        bots.push({
          id: data.member.id,
          name: data.member.name,
          token: data.member.session_token,
          quizId: data.quiz.id
        })
      } else {
        console.log(`Failed to login ${member.name}:`, data.error)
      }
    } catch (err) {
      console.log(`Failed to login ${member.name} (network error)`)
    }
  }
  
  console.log(`Successfully logged in ${bots.length} bots!`)
  if (bots.length === 0) return
  
  // Subscribe to quiz state
  let currentQuestionIndex = -1
  
  const channel = supabase
    .channel(`load-test-${SUBJECT}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${SUBJECT}` }, async (payload) => {
      const newState = payload.new
      console.log(`\n[QUIZ STATE] ${newState.status.toUpperCase()} | Question Index: ${newState.current_question_index}`)
      
      if (newState.status === 'active' && newState.current_question_index !== currentQuestionIndex) {
        currentQuestionIndex = newState.current_question_index
        
        // Fetch question details (we need question_id for the answer api)
        const { data: questions } = await supabase.from('questions').select('id').eq('quiz_id', bots[0].quizId).order('order_index')
        const questionId = questions?.[currentQuestionIndex]?.id
        if (!questionId) return
        
        console.log(`--- NEW QUESTION (${currentQuestionIndex + 1}) - Scheduling ${bots.length} answers ---`)
        
        // Schedule bots to answer
        bots.forEach((bot) => {
          // Random delay between 1s and 12s
          const delayMs = Math.floor(Math.random() * 11000) + 1000
          setTimeout(async () => {
            const options = ['A', 'B', 'C', 'D']
            const randomOption = options[Math.floor(Math.random() * options.length)]
            
            try {
              const res = await fetch(`${BASE_URL}/api/submit-answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  memberId: bot.id,
                  quizId: bot.quizId,
                  subject: SUBJECT,
                  questionId: questionId,
                  questionIndex: currentQuestionIndex,
                  selectedOption: randomOption,
                  clientAnsweredAt: new Date().toISOString()
                })
              })
              if (res.ok) {
                console.log(`[Bot] ${bot.name} answered ${randomOption} at ${(delayMs/1000).toFixed(1)}s`)
              } else {
                console.log(`[Bot] ${bot.name} answer failed: ${res.statusText}`)
              }
            } catch (err) {
              console.log(`[Bot] ${bot.name} error`)
            }
          }, delayMs)
        })
      }
    })
    .subscribe((status) => {
      console.log(`Supabase Realtime: ${status}`)
      console.log(`Bots are waiting for admin to start the quiz...`)
    })
}

run()
