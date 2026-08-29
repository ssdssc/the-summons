import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { notifyEmitter, type NotifyPayload } from '@/lib/notify-emitter'

export const dynamic = 'force-dynamic'

const FULL_SCHOOLS_LIST = [
  { schoolName: 'Mahinda Rajapaksha College - Homagama', memberName: 'Kavindu Senaratne', code: 'MRC-PHY-01' },
  { schoolName: 'Defence Services College, Colombo 02', memberName: 'Dineth Perera', code: 'DSC-PHY-02' },
  { schoolName: 'Co/Gothami Balika Vidyalaya', memberName: 'Methmi Jayasuriya', code: 'GBV-PHY-03' },
  { schoolName: 'R/Eheliyagoda Central College', memberName: 'Sasindu Wickrama', code: 'ECC-PHY-04' },
  { schoolName: 'Visakha Vidyalaya, Colombo 05', memberName: 'Senuri Fernando', code: 'VV-PHY-05' },
  { schoolName: "St. Joseph's College, Wattala", memberName: 'Praveen Cooray', code: 'SJC-PHY-06' },
  { schoolName: 'Kingswood College, Kandy', memberName: 'Dhanushka Ratnayake', code: 'KC-PHY-07' },
  { schoolName: 'Bandaranayake College', memberName: 'Tharusha Silva', code: 'BC-PHY-08' },
  { schoolName: 'Isipathana College - Colombo 05', memberName: 'Ravindu Fernando', code: 'IC-PHY-09' },
  { schoolName: 'Royal College, Panadura', memberName: 'Shenal Fonseka', code: 'RCP-PHY-10' },
  { schoolName: 'Royal College', memberName: 'Kaveesha Bandara', code: 'RC-PHY-11' },
  { schoolName: 'Wesley College', memberName: 'Thejan De Silva', code: 'WC-PHY-12' },
]

const PHYSICS_QUESTIONS = [
  {
    order_index: 0,
    question_text: 'What is the SI unit of electric capacitance?',
    option_a: 'Henry',
    option_b: 'Farad',
    option_c: 'Tesla',
    option_d: 'Weber',
    correct_option: 'B',
    points: 4,
  },
  {
    order_index: 1,
    question_text: 'Which law states that the induced EMF is proportional to the rate of change of magnetic flux?',
    option_a: "Faraday's Law",
    option_b: "Lenz's Law",
    option_c: "Ampere's Law",
    option_d: "Gauss's Law",
    correct_option: 'A',
    points: 4,
  },
  {
    order_index: 2,
    question_text: 'In projectile motion (ignoring air resistance), which component of velocity remains constant?',
    option_a: 'Vertical component',
    option_b: 'Horizontal component',
    option_c: 'Total velocity',
    option_d: 'None of the above',
    correct_option: 'B',
    points: 4,
  },
  {
    order_index: 3,
    question_text: 'What is the speed of electromagnetic waves in vacuum?',
    option_a: '3.0 × 10^6 m/s',
    option_b: '3.0 × 10^8 m/s',
    option_c: '3.0 × 10^10 m/s',
    option_d: '1.5 × 10^8 m/s',
    correct_option: 'B',
    points: 4,
  },
  {
    order_index: 4,
    question_text: 'What is the dimensional formula of Planck constant (h)?',
    option_a: '[M L^2 T^-1]',
    option_b: '[M L T^-2]',
    option_c: '[M L^2 T^-2]',
    option_d: '[M L^0 T^-1]',
    correct_option: 'A',
    points: 4,
  },
  {
    order_index: 5,
    question_text: 'The total energy of a simple harmonic oscillator is proportional to:',
    option_a: 'Square of amplitude',
    option_b: 'Amplitude',
    option_c: 'Frequency',
    option_d: 'Square root of amplitude',
    correct_option: 'A',
    points: 4,
  },
  {
    order_index: 6,
    question_text: 'In thermodynamics, an adiabatic process is one where:',
    option_a: 'Temperature is constant',
    option_b: 'Pressure is constant',
    option_c: 'No heat enters or leaves the system',
    option_d: 'Volume is constant',
    correct_option: 'C',
    points: 4,
  },
]

function broadcastNotification(supabase: any, payload: NotifyPayload) {
  // 1. In-process SSE
  notifyEmitter.emit('notify', payload)
  // 2. Supabase Realtime broadcast channel
  try {
    supabase
      .channel('projector-live-notifications')
      .send({ type: 'broadcast', event: 'notification', payload })
  } catch {
    // Ignore
  }
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const body = await req.json().catch(() => ({}))
  const action = body.action || 'setup' // 'setup' | 'simulate-live' | 'clean'

  try {
    // ── CLEANUP ACTION: Deletes all simulation schools, members, and test sessions ──
    if (action === 'clean' || action === 'cleanup' || action === 'delete-test-data') {
      const schoolNames = FULL_SCHOOLS_LIST.map(s => s.schoolName)
      
      const { data: testRegs } = await supabase
        .from('registrations')
        .select('id, school_name')
        .in('school_name', schoolNames)

      const deletedSchools: string[] = []

      if (testRegs && testRegs.length > 0) {
        const regIds = testRegs.map(r => r.id)
        
        // 1. Delete member quiz sessions
        const { data: memberRows } = await supabase
          .from('members')
          .select('id')
          .in('registration_id', regIds)

        if (memberRows && memberRows.length > 0) {
          const memberIds = memberRows.map(m => m.id)
          await supabase.from('quiz_sessions').delete().in('member_id', memberIds)
        }

        // 2. Delete members
        await supabase.from('members').delete().in('registration_id', regIds)

        // 3. Delete registrations
        await supabase.from('registrations').delete().in('id', regIds)

        testRegs.forEach(r => deletedSchools.push(r.school_name))
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully removed ${deletedSchools.length} test school registrations and their members.`,
        deletedSchools,
      })
    }

    // 1. Ensure Physics quiz exists
    let { data: quiz } = await supabase
      .from('quizzes')
      .select('id')
      .eq('subject', 'physics')
      .maybeSingle()

    if (!quiz) {
      const { data: newQuiz } = await supabase
        .from('quizzes')
        .insert({
          subject: 'physics',
          title: 'Physics Live Challenge',
          duration_minutes: 5,
          status: 'active',
          correct_points: 4,
          negative_points: 1,
        })
        .select('id')
        .single()
      quiz = newQuiz
    } else {
      await supabase.from('quizzes').update({ duration_minutes: 5, status: 'active' }).eq('id', quiz.id)
    }

    if (!quiz) return NextResponse.json({ error: 'Failed to create quiz' }, { status: 500 })

    // 2. Populate Questions
    await supabase.from('questions').delete().eq('quiz_id', quiz.id)
    const { data: insertedQuestions } = await supabase
      .from('questions')
      .insert(PHYSICS_QUESTIONS.map(q => ({ ...q, quiz_id: quiz.id })))
      .select('id, order_index, correct_option, points')

    const questionList = insertedQuestions || []

    // 3. Ensure ALL 12 schools exist in database with full 4-member teams (Bio, Chem, Phys, Maths)
    const memberRecords: Array<{ id: string; schoolName: string; memberName: string; code: string }> = []
    const allSubjects = ['biology', 'chemistry', 'physics', 'maths']

    for (const s of FULL_SCHOOLS_LIST) {
      let { data: reg } = await supabase
        .from('registrations')
        .select('id')
        .eq('school_name', s.schoolName)
        .maybeSingle()

      if (!reg) {
        const { data: newReg } = await supabase
          .from('registrations')
          .insert({
            school_name: s.schoolName,
            contact_email: `contact@${s.schoolName.toLowerCase().replace(/[^a-z0-9]/g, '')}.lk`,
            status: 'active',
          })
          .select('id')
          .single()
        reg = newReg
      }

      // Create members for all 4 subjects if missing
      const baseCode = s.code.replace(/-PHY-/, '-')
      for (const sub of allSubjects) {
        const subUpper = sub.slice(0, 3).toUpperCase()
        const code = baseCode.replace(/-(\d+)$/, `-${subUpper}-$1`)

        let { data: existingMem } = await supabase
          .from('members')
          .select('id, access_code, name')
          .eq('registration_id', reg!.id)
          .eq('subject', sub)
          .maybeSingle()

        if (!existingMem) {
          const name = sub === 'physics' ? s.memberName : `${s.memberName.split(' ')[0]} (${sub.toUpperCase()})`
          const { data: newMem } = await supabase
            .from('members')
            .insert({
              registration_id: reg!.id,
              name,
              subject: sub,
              access_code: code,
              is_captain: sub === 'physics',
            })
            .select('id, access_code, name')
            .single()
          existingMem = newMem
        }

        if (sub === 'physics' && existingMem) {
          memberRecords.push({
            id: existingMem.id,
            schoolName: s.schoolName,
            memberName: existingMem.name,
            code: existingMem.access_code,
          })
        }
      }
    }

    // 4. Reset & Activate Physics Quiz (5 minutes duration)
    const startDate = new Date()
    const endDate = new Date(startDate.getTime() + 5 * 60 * 1000)
    await supabase.from('quiz_state').upsert({
      subject: 'physics',
      status: 'active',
      current_question_index: 0,
      started_at: startDate.toISOString(),
      question_started_at: startDate.toISOString(),
      ended_at: endDate.toISOString(),
    })
    // Clear previous sessions for a fresh test
    await supabase.from('quiz_sessions').delete().eq('quiz_id', quiz.id)

    // ── INSTANT COMPLETE: Instantly records all answers, marks quiz ended, and computes final results ──
    if (action === 'instant' || action === 'instant-complete' || action === 'results') {
      const schoolPerformance: Record<string, { correctCount: number; points: number }> = {
        'Mahinda Rajapaksha College - Homagama': { correctCount: 7, points: 28 },
        'Royal College': { correctCount: 6, points: 24 },
        'Bandaranayake College': { correctCount: 6, points: 24 },
        'Defence Services College, Colombo 02': { correctCount: 5, points: 20 },
        'Visakha Vidyalaya, Colombo 05': { correctCount: 5, points: 20 },
        'Kingswood College, Kandy': { correctCount: 4, points: 16 },
        "St. Joseph's College, Wattala": { correctCount: 4, points: 16 },
        'Royal College, Panadura': { correctCount: 4, points: 16 },
        'Wesley College': { correctCount: 3, points: 12 },
        'R/Eheliyagoda Central College': { correctCount: 3, points: 12 },
        'Co/Gothami Balika Vidyalaya': { correctCount: 3, points: 12 },
        'Isipathana College - Colombo 05': { correctCount: 3, points: 12 },
      }

      // Sort schools by points descending to assign 1..12 ranks
      const sortedSchools = [...memberRecords].sort((a, b) => {
        const ptsA = schoolPerformance[a.schoolName]?.points ?? 0
        const ptsB = schoolPerformance[b.schoolName]?.points ?? 0
        return ptsB - ptsA
      })

      const nowIso = new Date().toISOString()

      // Insert complete answer records for all 12 schools
      for (let rank = 1; rank <= sortedSchools.length; rank++) {
        const member = sortedSchools[rank - 1]
        const perf = schoolPerformance[member.schoolName] || { correctCount: 3, points: 12 }

        const answers = questionList.map((q, idx) => {
          const isCorrect = idx < perf.correctCount
          return {
            questionId: q.id,
            questionIndex: idx,
            selectedOption: isCorrect ? q.correct_option : 'D',
            correctOption: q.correct_option,
            isCorrect,
            pointsEarned: isCorrect ? (q.points || 4) : 0,
            answeredAt: nowIso,
          }
        })

        await supabase.from('quiz_sessions').insert({
          member_id: member.id,
          quiz_id: quiz.id,
          subject: 'physics',
          answers,
          total_score: perf.points,
          rank: rank,
          started_at: nowIso,
        })
      }

      // Conclude the quiz in quiz_state and quizzes tables
      await supabase.from('quiz_state').upsert({
        subject: 'physics',
        status: 'ended',
        current_question_index: questionList.length - 1,
        started_at: nowIso,
        ended_at: nowIso,
      })

      await supabase.from('quizzes').update({
        status: 'ended',
        duration_minutes: 5,
      }).eq('id', quiz.id)

      return NextResponse.json({
        ok: true,
        message: 'All 12 schools have immediately completed the Physics quiz! Final results and leaderboard are live on /admin/projector.',
        status: 'ended',
        totalParticipants: sortedSchools.length,
        rankings: sortedSchools.map((s, i) => ({
          rank: i + 1,
          school: s.schoolName,
          member: s.memberName,
          score: schoolPerformance[s.schoolName]?.points || 12,
        })),
      })
    }

    if (action === 'simulate-live') {
      const getMember = (school: string) => memberRecords.find(m => m.schoolName === school)!

      // Helper function to submit answers with real DB update + notifications
      const submitAnswer = async (
        schoolName: string,
        qIndex: number,
        isCorrect: boolean,
        customNotification?: { type: NotifyPayload['type']; count: number | string }
      ) => {
        const member = getMember(schoolName)
        if (!member) return

        const q = questionList[qIndex % questionList.length]
        const pointsEarned = isCorrect ? (q?.points || 4) : 0

        const { data: existing } = await supabase
          .from('quiz_sessions')
          .select('id, answers, total_score')
          .eq('member_id', member.id)
          .eq('quiz_id', quiz!.id)
          .maybeSingle()

        const newAns = {
          questionId: q?.id || `q-${qIndex}`,
          questionIndex: qIndex,
          selectedOption: isCorrect ? q?.correct_option : 'D',
          correctOption: q?.correct_option,
          isCorrect,
          pointsEarned,
          answeredAt: new Date().toISOString(),
        }

        let updatedScore = pointsEarned
        let updatedAnswers = [newAns]

        if (existing) {
          updatedAnswers = [...((existing.answers as any[]) || []), newAns]
          updatedScore = existing.total_score + pointsEarned
          await supabase.from('quiz_sessions').update({
            answers: updatedAnswers,
            total_score: updatedScore,
          }).eq('id', existing.id)
        } else {
          await supabase.from('quiz_sessions').insert({
            member_id: member.id,
            quiz_id: quiz!.id,
            subject: 'physics',
            answers: [newAns],
            total_score: Math.max(0, pointsEarned),
            started_at: new Date().toISOString(),
          })
        }

        // Custom notification override if provided
        if (customNotification) {
          broadcastNotification(supabase, {
            type: customNotification.type,
            schoolName: member.schoolName,
            memberName: member.memberName,
            subject: 'physics',
            count: customNotification.count,
          })
          return
        }

        // Calculate streak
        let correctStreak = 0
        for (let i = updatedAnswers.length - 1; i >= 0; i--) {
          if (updatedAnswers[i].isCorrect) correctStreak++
          else break
        }

        if (!isCorrect) {
          broadcastNotification(supabase, {
            type: 'streak_lost',
            schoolName: member.schoolName,
            memberName: member.memberName,
            subject: 'physics',
            count: 0,
          })
        } else if (correctStreak >= 3) {
          broadcastNotification(supabase, {
            type: 'streak',
            schoolName: member.schoolName,
            memberName: member.memberName,
            subject: 'physics',
            count: correctStreak,
          })
        }
      }

      // ── Build Full Multi-Round Simulation Timeline across all 12 schools ──
      const timeline: Array<() => Promise<void>> = [
        // ── Round 1: Opening round across schools ──
        () => submitAnswer('Royal College', 0, true),
        () => submitAnswer('Bandaranayake College', 0, true),
        () => submitAnswer('Defence Services College, Colombo 02', 0, true),
        () => submitAnswer('Mahinda Rajapaksha College - Homagama', 0, true),
        () => submitAnswer('Kingswood College, Kandy', 0, true),
        () => submitAnswer('Visakha Vidyalaya, Colombo 05', 0, true),
        () => submitAnswer('Wesley College', 0, true),
        () => submitAnswer("St. Joseph's College, Wattala", 0, true),
        () => submitAnswer('R/Eheliyagoda Central College', 0, true),
        () => submitAnswer('Royal College, Panadura', 0, true),
        () => submitAnswer('Co/Gothami Balika Vidyalaya', 0, true),
        () => submitAnswer('Isipathana College - Colombo 05', 0, false), // Isipathana wrong 1

        // ── Round 2: Battle continues ──
        () => submitAnswer('Royal College', 1, true),
        () => submitAnswer('Bandaranayake College', 1, true),
        () => submitAnswer('Mahinda Rajapaksha College - Homagama', 1, true),
        () => submitAnswer('Kingswood College, Kandy', 1, true),
        () => submitAnswer('Wesley College', 1, true),
        () => submitAnswer('Visakha Vidyalaya, Colombo 05', 1, true),
        () => submitAnswer('Isipathana College - Colombo 05', 1, false), // Isipathana wrong 2

        // ── Round 3: Royal College STREAK x3! Bandaranayake STREAK x3! ──
        () => submitAnswer('Royal College', 2, true), // 🔥 Royal STREAK x3
        () => submitAnswer('Bandaranayake College', 2, true), // 🔥 Bandaranayake STREAK x3
        () => submitAnswer('Mahinda Rajapaksha College - Homagama', 2, true),
        () => submitAnswer('Royal College, Panadura', 2, true),
        () => submitAnswer('Isipathana College - Colombo 05', 2, false), // Isipathana wrong 3

        // ── Round 4: Royal upgrades to STREAK x4! Isipathana starts recovery ──
        () => submitAnswer('Royal College', 3, true), // 🔥 Royal STREAK x4 (in place upgrade)
        () => submitAnswer('Isipathana College - Colombo 05', 3, true), // Isipathana recovery 1
        () => submitAnswer('Visakha Vidyalaya, Colombo 05', 3, true),
        () => submitAnswer("St. Joseph's College, Wattala", 3, true),

        // ── Round 5: Defence Services Lightning Answer & Royal upgrades to STREAK x5! ──
        () => submitAnswer('Defence Services College, Colombo 02', 4, true, { type: 'fast', count: '1.6s' }),
        () => submitAnswer('Royal College', 4, true), // 🔥 Royal STREAK x5 (in place upgrade)
        () => submitAnswer('Isipathana College - Colombo 05', 4, true), // Isipathana recovery 2
        () => submitAnswer('R/Eheliyagoda Central College', 4, true),

        // ── Round 6: Isipathana hits COMEBACK x3! (after 3 wrong answers) ──
        () => submitAnswer('Isipathana College - Colombo 05', 5, true, { type: 'comeback', count: 3 }),
        () => submitAnswer('Kingswood College, Kandy', 5, true),
        () => submitAnswer('Wesley College', 5, true),

        // ── Round 7: Mahinda Rajapaksha College Overtakes to #1 spot! ──
        () => submitAnswer('Mahinda Rajapaksha College - Homagama', 6, true, { type: 'overtake', count: '#1' }),
        () => submitAnswer('Co/Gothami Balika Vidyalaya', 6, true),
        () => submitAnswer('Royal College, Panadura', 6, true),

        // ── Round 8: Royal College misses a question -> STREAK LOST (card disappears)! ──
        () => submitAnswer('Royal College', 5, false), // ❌ Royal streak lost
        () => submitAnswer('Isipathana College - Colombo 05', 6, true),
        () => submitAnswer('Bandaranayake College', 6, true),
        () => submitAnswer('Defence Services College, Colombo 02', 6, true),
        () => submitAnswer('Visakha Vidyalaya, Colombo 05', 6, true),
        () => submitAnswer("St. Joseph's College, Wattala", 6, true),
        () => submitAnswer('Kingswood College, Kandy', 6, true),
        () => submitAnswer('Wesley College', 6, true),
        () => submitAnswer('R/Eheliyagoda Central College', 6, true),

        // ── Final Step: Conclude quiz, update status to ended, compute final ranks ──
        async () => {
          const finishTime = new Date().toISOString()
          await supabase.from('quiz_state').update({
            status: 'ended',
            ended_at: finishTime,
          }).eq('subject', 'physics')

          await supabase.from('quizzes').update({
            status: 'ended',
          }).eq('id', quiz!.id)

          // Calculate final ranks
          const { data: finalSessions } = await supabase
            .from('quiz_sessions')
            .select('id, total_score')
            .eq('quiz_id', quiz!.id)
            .order('total_score', { ascending: false })

          if (finalSessions) {
            for (let i = 0; i < finalSessions.length; i++) {
              await supabase
                .from('quiz_sessions')
                .update({ rank: i + 1 })
                .eq('id', finalSessions[i].id)
            }
          }
        },
      ]

      // Determine step interval: default spreads over 5 minutes (300 seconds), or fast if requested
      const speed = body.speed === 'fast' ? 2000 : Math.floor((5 * 60 * 1000) / timeline.length)

      timeline.forEach((step, idx) => {
        setTimeout(() => {
          step().catch(console.error)
        }, idx * speed)
      })

      return NextResponse.json({
        ok: true,
        message: body.speed === 'fast' 
          ? 'Fast 5-minute quiz preview started (~1 minute). Watch /admin/projector now!' 
          : 'Full 5-minute live quiz simulation started! Events will unfold over the next 5 minutes.',
        durationMinutes: 5,
        totalSchools: memberRecords.length,
        totalEvents: timeline.length,
        stepIntervalSeconds: (speed / 1000).toFixed(1),
        members: memberRecords,
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Physics quiz is active and set for 5 minutes with all 12 schools!',
      durationMinutes: 5,
      subject: 'physics',
      questionsCount: questionList.length,
      members: memberRecords,
    })
  } catch (err: any) {
    console.error('simulate-physics error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
