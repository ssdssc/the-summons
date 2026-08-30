'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from '@/app/admin/components/SubjectIcon'
import { AlertTriangle, Timer } from 'lucide-react'
import styles from './page.module.css'
import entryStyles from '../page.module.css'

interface Question {
  id: string
  order_index: number
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string | null
  correct_option: string
  points: number
  negative_points: number
  image_url: string | null
  time_seconds: number | null
  question_text_si: string | null
  option_a_si: string | null
  option_b_si: string | null
  option_c_si: string | null
  option_d_si: string | null
  option_e_si: string | null
}

// ── Tiny Web Audio sound effects (no external files needed) ──────────────────
function playSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch { /* audio blocked */ }
}

export default function QuizPage() {
  const router = useRouter()
  const [member, setMember] = useState<any>(null)
  const [school, setSchool] = useState<any>(null)
  const [quiz, setQuiz] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { selected: string; correct: string; isCorrect: boolean }>>({})
  const [pendingOption, setPendingOption] = useState<string | null>(null) // optimistic UI
  const [quizStatus, setQuizStatus] = useState<string>('active')
  const [questionTransition, setQuestionTransition] = useState(false)
  const [lang, setLang] = useState<'en' | 'si'>('en')
  // Timer
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Anti-cheat state
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [showKickedModal, setShowKickedModal] = useState(false)
  const [warningMsg, setWarningMsg] = useState('')

  const channelRef = useRef<any>(null)
  const currentIndexRef = useRef(0)
  const wasHiddenRef = useRef(false)
  const memberRef = useRef<any>(null)
  const quizRef = useRef<any>(null)
  const sessionTokenRef = useRef<string | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load session data ─────────────────────────────────────────────────────
  useEffect(() => {
    const m = sessionStorage.getItem('summons_member')
    const s = sessionStorage.getItem('summons_school')
    const q = sessionStorage.getItem('summons_quiz')
    const l = sessionStorage.getItem('summons_lang') || 'en'
    const token = sessionStorage.getItem('summons_session_token')
    if (!m || !q) { router.replace('/summons'); return }
    const memberData = JSON.parse(m)
    const quizData = JSON.parse(q)
    setMember(memberData)
    memberRef.current = memberData
    setSchool(JSON.parse(s || '{}'))
    setQuiz(quizData)
    quizRef.current = quizData
    setLang(l as 'en' | 'si')
    sessionTokenRef.current = token

  }, [router])

  // ── Load questions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quiz?.id) return
    supabase.from('questions').select('*').eq('quiz_id', quiz.id).order('order_index')
      .then(({ data }) => { if (data) setQuestions(data) })
  }, [quiz?.id])

  // ── Quiz state realtime subscription ─────────────────────────────────────
  useEffect(() => {
    if (!member?.subject) return

    let transitionTimer: ReturnType<typeof setTimeout> | null = null
    const applyState = ({ status, current_question_index, question_started_at }: any) => {
      if (status === 'results_published') {
        router.push('/summons/results')
        return
      }
      setQuizStatus(status)
      if (status === 'ended') return
      if (question_started_at) setQuestionStartedAt(question_started_at)
      if (typeof current_question_index === 'number' && current_question_index !== currentIndexRef.current) {
        currentIndexRef.current = current_question_index
        setQuestionTransition(true)
        if (transitionTimer) clearTimeout(transitionTimer)
        transitionTimer = setTimeout(() => {
          setCurrentIndex(current_question_index)
          setPendingOption(null)
          setQuestionTransition(false)
        }, 400)
      }
    }

    // Spread synchronized joins across two seconds to stay below Free-tier limits.
    const subscribeTimer = setTimeout(() => {
      channelRef.current = supabase
        .channel(`quiz-play-${member.subject}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${member.subject}` },
          (payload: any) => applyState(payload.new))
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          void supabase
            .from('quiz_state')
            .select('status, current_question_index, question_started_at')
            .eq('subject', member.subject)
            .single()
            .then(({ data }) => { if (data) applyState(data) })
        })
    }, Math.floor(Math.random() * 2000))

    return () => {
      clearTimeout(subscribeTimer)
      if (transitionTimer) clearTimeout(transitionTimer)
      channelRef.current?.unsubscribe()
    }
  }, [member?.subject, router])

  // ── Per-question countdown timer ──────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!questionStartedAt || !questions[currentIndex]) { setTimeLeft(null); return }

    const timeLimitSec = questions[currentIndex].time_seconds ?? 120

    const tick = () => {
      const elapsed = (Date.now() - new Date(questionStartedAt).getTime()) / 1000
      const left = Math.max(0, timeLimitSec - elapsed)
      setTimeLeft(Math.ceil(left))
      if (left <= 0) { clearInterval(timerRef.current!); timerRef.current = null }
    }
    tick()
    timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [questionStartedAt, currentIndex, questions])

  // ── Anti-cheat violation logger ───────────────────────────────────────────
  const logViolation = useCallback((type: string) => {
    const m = memberRef.current
    const q = quizRef.current
    if (!m?.id || !q?.id) return
    fetch('/api/log-violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: m.id, quizId: q.id, type, at: new Date().toISOString() }),
    }).catch(() => {})
  }, [])

  // ── Anti-cheat: tab switch ────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && !wasHiddenRef.current) {
        wasHiddenRef.current = true
        setWarningMsg('Tab switch detected — this has been logged.')
        setShowTabWarning(true)
        setTimeout(() => setShowTabWarning(false), 4000)
        logViolation('tab_switch')
      } else if (!document.hidden) { wasHiddenRef.current = false }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [logViolation])

  // ── Anti-cheat: window blur ───────────────────────────────────────────────
  useEffect(() => {
    const handleBlur = () => {
      setWarningMsg('App focus lost — this has been logged.')
      setShowTabWarning(true)
      setTimeout(() => setShowTabWarning(false), 4000)
      logViolation('window_blur')
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [logViolation])

  // ── Anti-cheat: copy / keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'I', 'J', 'C'].includes(e.key)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'I', 'J'].includes(e.key)) ||
        (e.ctrlKey && ['u', 'p', 's', 'a', 'U', 'P', 'S', 'A'].includes(e.key))
      ) { e.preventDefault(); e.stopPropagation(); logViolation('devtools_key') }
    }
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('contextmenu', block)
    document.addEventListener('selectstart', block)
    document.addEventListener('keydown', blockKeys)
    return () => {
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('selectstart', block)
      document.removeEventListener('keydown', blockKeys)
    }
  }, [logViolation])

  // ── Anti-cheat: fullscreen ────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setWarningMsg('Fullscreen exited — this has been logged.')
        setShowTabWarning(true)
        setTimeout(() => setShowTabWarning(false), 4000)
        logViolation('fullscreen_exit')
      }
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [logViolation])

  // ── Anti-cheat: dual-device heartbeat ────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const m = memberRef.current; const token = sessionTokenRef.current
      if (!m?.id || !token) return
      try {
        const res = await fetch('/api/check-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: m.id, sessionToken: token }) })
        const data = await res.json()
        if (data.kicked) { setShowKickedModal(true); if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
      } catch { /* network */ }
    }
    const timeout = setTimeout(() => {
      check()
      heartbeatRef.current = setInterval(check, 45000 + Math.random() * 30000)
    }, 3000 + Math.random() * 12000)
    return () => { clearTimeout(timeout); if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [])

  // ── Answer submission ─────────────────────────────────────────────────────
  const handleAnswer = useCallback(async (option: string) => {
    if (!member || !quiz) return
    const q = questions[currentIndex]
    // Block if: no question, already submitting, timer expired, or same option re-clicked
    if (!q || pendingOption) return
    if (timeLeft !== null && timeLeft <= 0) return   // timer expired — lock
    if (answers[q.id]?.selected === option) return   // same option clicked again

    const clientAnsweredAt = new Date().toISOString()

    // Optimistic UI: highlight immediately
    setPendingOption(option)

    try {
      const res = await fetch('/api/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, quizId: quiz.id, subject: member.subject, questionId: q.id, questionIndex: currentIndex, selectedOption: option, clientAnsweredAt, sessionToken: sessionTokenRef.current }),
      })
      const result = await res.json()
      if (res.ok) {
        playSound()
        setAnswers(prev => ({ ...prev, [q.id]: { selected: option, correct: result.correctOption, isCorrect: result.isCorrect } }))
      }
    } catch (err) { console.error('Failed to submit answer:', err) }
    setPendingOption(null)
  }, [member, quiz, questions, currentIndex, answers, pendingOption, timeLeft])

  const currentQuestion = questions[currentIndex]
  const subjectCfg = member ? SUBJECT_CONFIG[member.subject as Subject] : null
  const answered = currentQuestion ? answers[currentQuestion.id] : null
  const progressPct = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0
  const timeLimitSec = currentQuestion?.time_seconds ?? 120
  const timerPct = timeLeft !== null ? Math.max(0, (timeLeft / timeLimitSec) * 100) : 100
  const timerDanger = timeLeft !== null && timeLeft <= 5
  const timerWarn = timeLeft !== null && timeLeft <= 10

  const timerExpired = timeLeft !== null && timeLeft <= 0

  const getOptionClass = (opt: string) => {
    // If this option is currently being submitted, it's pending
    if (pendingOption === opt) return 'option-btn pending'
    
    // If not pending, check if it's the currently selected answer
    if (answered?.selected === opt) return 'option-btn selected'
    
    // Default state
    return 'option-btn'
  }

  // ── Kicked modal ───────────────────────────────────────────────────────────
  if (showKickedModal) {
    return (
      <main className={styles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        <div className={`${styles.waitingCard} anim-scale-in`}>
          <div className={styles.waitingIcon} style={{ color: 'var(--red)' }}>⚠</div>
          <h2 className={styles.waitingTitle} style={{ color: 'var(--red)' }}>Session Ended</h2>
          <p className={styles.waitingDesc}>Your access code was used on another device.<br />Only one active session is allowed per participant.</p>
          <button onClick={() => { sessionStorage.clear(); router.replace('/summons') }} className="btn btn-primary" style={{ marginTop: 16 }}>Back to Login</button>
        </div>
      </main>
    )
  }

  // ── Quiz ended ────────────────────────────────────────────────────────────
  if (quizStatus === 'ended' || quizStatus === 'results_published') {
    if (quizStatus === 'results_published') return null; // redirecting

    return (
      <main className={entryStyles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        {/* Floating particles */}
        <div className={entryStyles.particles}>
          {/* Simple hardcoded static particles so we don't need the whole state logic here */}
          <div className={entryStyles.particle} style={{ top: '20%', left: '10%', width: '3px', height: '3px', animationDelay: '0s' }} />
          <div className={entryStyles.particle} style={{ top: '60%', left: '80%', width: '4px', height: '4px', animationDelay: '1s' }} />
          <div className={entryStyles.particle} style={{ top: '80%', left: '20%', width: '2px', height: '2px', animationDelay: '2s' }} />
        </div>

        <div className={entryStyles.content}>
          <div className={`${entryStyles.entryCard} anim-scale-in`}>
            {/* Branding */}
            <div className={`${entryStyles.branding} anim-fade-up delay-1`} style={{ '--subject-glow': subjectCfg?.glow } as any}>
              <div className={entryStyles.eventBadge}>
                <span className={entryStyles.phaseDot} />
                {subjectCfg?.label || member?.subject}
              </div>
              <h1 className={entryStyles.title} style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.1 }}>
                {member?.name}
              </h1>
              <p className={entryStyles.subtitle}>{school?.name}</p>
              <p className={entryStyles.tagline} style={{ marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', fontWeight: 700, fontSize: '24px', color: 'var(--accent-2)' }}>
                {member?.accessCode}
              </p>
            </div>

            {/* Quiz Status */}
            <div className={`${entryStyles.quizStatus} anim-fade-up delay-3`} style={{ marginTop: 16 }}>
              <div className={styles.waitingOrbit} style={{ margin: '0 auto 16px' }}><div className={styles.orbitDot} /><div className={styles.orbitDot2} /></div>
              <h2 className={styles.waitingTitle} style={{ textAlign: 'center' }}>Quiz Complete</h2>
              <p className={styles.waitingDesc} style={{ textAlign: 'center', marginBottom: 24 }}>
                Your answers have been recorded.<br />Waiting for results to be published...
              </p>
              
              <div className={styles.finalScore}>
                <span className={styles.finalScoreLabel}>Session Ended</span>
                <span className={styles.finalScoreNum}>🏁</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }
  if (!currentQuestion) {
    return (
      <main className={styles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        <div className={styles.loadingWrap}><div className={styles.loader} /><p>Loading quiz...</p></div>
      </main>
    )
  }

  const isSi = lang === 'si'
  const qText = isSi && currentQuestion.question_text_si ? currentQuestion.question_text_si : currentQuestion.question_text
  const options = [
    { key: 'A', text: isSi && currentQuestion.option_a_si ? currentQuestion.option_a_si : currentQuestion.option_a },
    { key: 'B', text: isSi && currentQuestion.option_b_si ? currentQuestion.option_b_si : currentQuestion.option_b },
    { key: 'C', text: isSi && currentQuestion.option_c_si ? currentQuestion.option_c_si : currentQuestion.option_c },
    { key: 'D', text: isSi && currentQuestion.option_d_si ? currentQuestion.option_d_si : currentQuestion.option_d },
    ...(currentQuestion.option_e || currentQuestion.option_e_si ? [{ key: 'E', text: isSi && currentQuestion.option_e_si ? currentQuestion.option_e_si : (currentQuestion.option_e || '') }] : []),
  ]

  return (
    <main className={styles.main} onDragStart={(e) => e.preventDefault()}>
      <div className="bg-grid" /><div className="bg-radial" />

      {/* Violation toast */}
      {showTabWarning && (
        <div className={`toast error ${styles.tabWarning} anim-slide-right`}>
          <AlertTriangle size={14} /> {warningMsg}
        </div>
      )}


      <div className={styles.quizWrap}>
        {/* Top bar */}
        <div className={`${styles.topBar} anim-fade-in`}>
          <div className={styles.subjectPill} style={{ '--col': subjectCfg?.color } as any}>
            {member?.subject && <SubjectIcon subject={member.subject} size={14} />}
            {subjectCfg?.label}
          </div>
          <div className={styles.questionCounter}>
            <span className={styles.qNum}>{currentIndex + 1}</span>
            <span className={styles.qTotal}>/ {questions.length}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className={`progress-track ${styles.progress}`}>
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Per-question timer — always visible while question is active */}
        {timeLeft !== null && (
          <div className={styles.timerWrap}>
            <div className={styles.timerRow}>
              <span className={styles.timerLabel} style={{ color: answered ? 'var(--green)' : timerDanger ? 'var(--red)' : timerWarn ? '#f59e0b' : 'var(--text-3)' }}>
                <Timer size={12} style={{ display: 'inline', marginRight: 4 }} />
                {answered ? '✓ Answer submitted' : timerDanger ? 'Time almost up!' : 'Time remaining'}
              </span>
              <span className={styles.timerNum} style={{ color: answered ? 'var(--green)' : timerDanger ? 'var(--red)' : timerWarn ? '#f59e0b' : 'var(--text)' }}>
                {timeLeft}s
              </span>
            </div>
            <div className={styles.timerTrack}>
              <div
                className={styles.timerFill}
                style={{
                  width: `${timerPct}%`,
                  background: answered ? 'var(--green)' : timerDanger ? '#ef4444' : timerWarn ? '#f59e0b' : 'var(--accent)',
                  transition: 'width 0.25s linear, background 0.4s',
                }}
              />
            </div>
          </div>
        )}

        {/* Question card */}
        <div
          className={`${styles.questionCard} ${questionTransition ? styles.cardExit : styles.cardEnter}`}
          key={currentIndex}
          style={{ userSelect: 'none' }}
        >
          {currentQuestion.image_url && (
            <div className={styles.imageWrap}>
              <img src={currentQuestion.image_url} alt="Question" className={styles.questionImg} />
            </div>
          )}
          <div className={styles.questionHeader}>
            <div className={styles.qIndex}>Q{currentIndex + 1}</div>
            <p className={`${styles.questionText} ${isSi && currentQuestion.question_text_si ? 'lang-si' : ''}`}>{qText}</p>
          </div>
          <div className={styles.optionsGrid}>
            {options.map(opt => (
              <button
                key={opt.key}
                className={getOptionClass(opt.key)}
                onClick={() => handleAnswer(opt.key)}
                disabled={!!pendingOption || timerExpired}
              >
                <span className="option-letter">{opt.key}</span>
                <span className={`${styles.optionText} ${isSi && currentQuestion[`option_${opt.key.toLowerCase()}_si` as keyof Question] ? 'lang-si' : ''}`}>{opt.text}</span>
              </button>
            ))}
          </div>
          {answered && !timerExpired && (
            <div className={`${styles.feedback} anim-fade-up`} style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              ✓ Answer recorded — tap another option to change it.
            </div>
          )}
          {answered && timerExpired && (
            <div className={`${styles.feedback} anim-fade-up`} style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--green)' }}>
              ✓ Answer locked in.
            </div>
          )}
          {!answered && !pendingOption && !timerExpired && (
            <p className={styles.waitNote}>Waiting for next question from admin — answer when ready.</p>
          )}
          {!answered && timerExpired && (
            <p className={styles.waitNote} style={{ color: 'var(--red)' }}>Time&apos;s up — no answer submitted.</p>
          )}
          {pendingOption && (
            <p className={styles.waitNote} style={{ color: 'var(--accent-2)' }}>Submitting your answer...</p>
          )}
        </div>

        {/* Member info footer */}
        <div className={`${styles.memberFooter} anim-fade-in delay-2`}>
          <span>{member?.name}</span>
          <span className="text-faint">{school?.name}</span>
        </div>
      </div>
    </main>
  )
}
