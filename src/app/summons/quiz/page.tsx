'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from '@/app/admin/components/SubjectIcon'
import { CheckCircle, AlertTriangle, Maximize2, Timer } from 'lucide-react'
import styles from './page.module.css'

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
  const [submitting, setSubmitting] = useState(false)
  const [quizStatus, setQuizStatus] = useState<string>('active')
  const [score, setScore] = useState(0)
  const [questionTransition, setQuestionTransition] = useState(false)
  const [lang, setLang] = useState<'en' | 'si'>('en')
  // Timer
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Anti-cheat state
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [showFullscreenModal, setShowFullscreenModal] = useState(false)
  const [showKickedModal, setShowKickedModal] = useState(false)
  const [warningMsg, setWarningMsg] = useState('')

  const channelRef = useRef<any>(null)
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

    // Load initial question_started_at from quiz_state
    if (memberData?.subject) {
      supabase
        .from('quiz_state')
        .select('question_started_at, current_question_index')
        .eq('subject', memberData.subject)
        .single()
        .then(({ data }) => {
          if (data?.question_started_at) setQuestionStartedAt(data.question_started_at)
          if (typeof data?.current_question_index === 'number' && data.current_question_index >= 0) {
            setCurrentIndex(data.current_question_index)
          }
        })
    }
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
    channelRef.current = supabase
      .channel(`quiz-play-${member.subject}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${member.subject}` },
        (payload: any) => {
          const { status, current_question_index, question_started_at } = payload.new
          if (status === 'ended' || status === 'results_published') {
            setQuizStatus(status); return
          }
          if (question_started_at) setQuestionStartedAt(question_started_at)
          if (typeof current_question_index === 'number' && current_question_index !== currentIndex) {
            setQuestionTransition(true)
            setTimeout(() => {
              setCurrentIndex(current_question_index)
              setPendingOption(null)
              setQuestionTransition(false)
            }, 400)
          }
        })
      .subscribe()
    return () => { channelRef.current?.unsubscribe() }
  }, [member?.subject, currentIndex])

  // ── Per-question countdown timer ──────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!questionStartedAt || !questions[currentIndex]) { setTimeLeft(null); return }

    const timeLimitSec = questions[currentIndex].time_seconds ?? 30

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
        setWarningMsg('⚠ Tab switch detected — this has been logged.')
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
      setWarningMsg('⚠ App focus lost — this has been logged.')
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
      if (!document.fullscreenElement) { setShowFullscreenModal(true); logViolation('fullscreen_exit') }
      else setShowFullscreenModal(false)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [logViolation])

  const reEnterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    setShowFullscreenModal(false)
  }

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
    const timeout = setTimeout(() => { check(); heartbeatRef.current = setInterval(check, 15000) }, 3000)
    return () => { clearTimeout(timeout); if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [])

  // ── Answer submission ─────────────────────────────────────────────────────
  const handleAnswer = useCallback(async (option: string) => {
    if (!member || !quiz) return
    const q = questions[currentIndex]
    if (!q || answers[q.id] || pendingOption) return // already answered or pending

    const clientAnsweredAt = new Date().toISOString()

    // Optimistic UI: highlight immediately
    setPendingOption(option)
    setSubmitting(true)

    try {
      const res = await fetch('/api/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, quizId: quiz.id, subject: member.subject, questionId: q.id, questionIndex: currentIndex, selectedOption: option, clientAnsweredAt }),
      })
      const result = await res.json()
      if (res.ok) {
        playSound()
        setAnswers(prev => ({ ...prev, [q.id]: { selected: option, correct: result.correctOption, isCorrect: result.isCorrect } }))
        setScore(prev => Math.max(0, prev + result.pointsEarned))
      }
    } catch (err) { console.error('Failed to submit answer:', err) }
    setPendingOption(null)
    setSubmitting(false)
  }, [member, quiz, questions, currentIndex, answers, pendingOption])

  const currentQuestion = questions[currentIndex]
  const subjectCfg = member ? SUBJECT_CONFIG[member.subject as Subject] : null
  const answered = currentQuestion ? answers[currentQuestion.id] : null
  const progressPct = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0
  const timeLimitSec = currentQuestion?.time_seconds ?? 30
  const timerPct = timeLeft !== null ? Math.max(0, (timeLeft / timeLimitSec) * 100) : 100
  const timerDanger = timeLeft !== null && timeLeft <= 5
  const timerWarn = timeLeft !== null && timeLeft <= 10

  const getOptionClass = (opt: string) => {
    if (pendingOption === opt && !answered) return 'option-btn pending'
    if (!answered) return 'option-btn'
    if (opt === answered.selected) return 'option-btn selected'
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
    return (
      <main className={styles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        <div className={`${styles.waitingCard} anim-scale-in`}>
          <div className={styles.waitingOrbit}><div className={styles.orbitDot} /><div className={styles.orbitDot2} /></div>
          <div className={styles.waitingIcon}><CheckCircle size={36} strokeWidth={1.5} /></div>
          <h2 className={styles.waitingTitle}>Quiz Complete</h2>
          <p className={styles.waitingDesc}>Your answers have been recorded.<br />{quizStatus === 'results_published' ? 'Results are ready!' : 'Waiting for results to be published...'}</p>
          {quizStatus === 'results_published' && (
            <button onClick={() => router.push('/summons/results')} className="btn btn-primary" style={{ marginTop: 16, minWidth: 200 }}>View Results →</button>
          )}
          <div className={styles.finalScore}>
            <span className={styles.finalScoreLabel}>Quiz Ended</span>
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

      {/* Fullscreen exit modal */}
      {showFullscreenModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalCard} anim-scale-in`}>
            <div className={styles.modalIcon}><Maximize2 size={32} /></div>
            <h3 className={styles.modalTitle}>Return to Fullscreen</h3>
            <p className={styles.modalDesc}>You exited fullscreen mode. This has been logged.<br />Please return to fullscreen to continue the quiz.</p>
            <button className="btn btn-primary" onClick={reEnterFullscreen} style={{ minWidth: 200 }}>Re-enter Fullscreen</button>
          </div>
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

        {/* Per-question timer */}
        {timeLeft !== null && !answered && (
          <div className={styles.timerWrap}>
            <div className={styles.timerRow}>
              <span className={styles.timerLabel} style={{ color: timerDanger ? 'var(--red)' : timerWarn ? '#f59e0b' : 'var(--text-3)' }}>
                <Timer size={12} style={{ display: 'inline', marginRight: 4 }} />
                {timerDanger ? 'Time almost up!' : 'Time remaining'}
              </span>
              <span className={styles.timerNum} style={{ color: timerDanger ? 'var(--red)' : timerWarn ? '#f59e0b' : 'var(--text)' }}>
                {timeLeft}s
              </span>
            </div>
            <div className={styles.timerTrack}>
              <div
                className={styles.timerFill}
                style={{
                  width: `${timerPct}%`,
                  background: timerDanger ? '#ef4444' : timerWarn ? '#f59e0b' : 'var(--accent)',
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
                disabled={!!answered || !!pendingOption}
              >
                <span className="option-letter">{opt.key}</span>
                <span className={`${styles.optionText} ${isSi && currentQuestion[`option_${opt.key.toLowerCase()}_si` as keyof Question] ? 'lang-si' : ''}`}>{opt.text}</span>
              </button>
            ))}
          </div>
          {answered && (
            <div className={`${styles.feedback} anim-fade-up`} style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              ✓ Answer submitted.
            </div>
          )}
          {!answered && !pendingOption && (
            <p className={styles.waitNote}>Waiting for next question from admin — answer when ready.</p>
          )}
          {pendingOption && !answered && (
            <p className={styles.waitNote} style={{ color: 'var(--accent-2)' }}>Submitting your answer...</p>
          )}
        </div>

        {/* Member info footer */}
        <div className={`${styles.memberFooter} anim-fade-in delay-2`}>
          <span>{member?.name}</span>
          <span className="text-faint">·</span>
          <span className="text-faint">{school?.name}</span>
        </div>
      </div>
    </main>
  )
}
