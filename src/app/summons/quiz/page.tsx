'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from '@/app/admin/components/SubjectIcon'
import { CheckCircle, AlertTriangle } from 'lucide-react'
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
}

const OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const

export default function QuizPage() {
  const router = useRouter()
  const [member, setMember] = useState<any>(null)
  const [school, setSchool] = useState<any>(null)
  const [quiz, setQuiz] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { selected: string; correct: string; isCorrect: boolean }>>({})
  const [submitting, setSubmitting] = useState(false)
  const [quizStatus, setQuizStatus] = useState<string>('active')
  const [score, setScore] = useState(0)
  const [questionTransition, setQuestionTransition] = useState(false)
  const [feedbackOption, setFeedbackOption] = useState<string | null>(null)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const channelRef = useRef<any>(null)
  const wasHiddenRef = useRef(false)

  // Load session data from sessionStorage
  useEffect(() => {
    const m = sessionStorage.getItem('summons_member')
    const s = sessionStorage.getItem('summons_school')
    const q = sessionStorage.getItem('summons_quiz')
    if (!m || !q) { router.replace('/summons'); return }
    const memberData = JSON.parse(m)
    const quizData = JSON.parse(q)
    setMember(memberData)
    setSchool(JSON.parse(s || '{}'))
    setQuiz(quizData)
  }, [router])

  // Load questions from Supabase
  useEffect(() => {
    if (!quiz?.id) return

    async function loadQuestions() {
      const { data } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quiz.id)
        .order('order_index')
      if (data) setQuestions(data)
    }
    loadQuestions()
  }, [quiz?.id])

  // Subscribe to quiz_state changes (admin advancing questions / ending)
  useEffect(() => {
    if (!member?.subject) return

    channelRef.current = supabase
      .channel(`quiz-play-${member.subject}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${member.subject}` },
        (payload: any) => {
          const { status, current_question_index } = payload.new

          if (status === 'ended' || status === 'results_published') {
            setQuizStatus(status)
            return
          }

          if (typeof current_question_index === 'number' && current_question_index !== currentIndex) {
            setQuestionTransition(true)
            setTimeout(() => {
              setCurrentIndex(current_question_index)
              setFeedbackOption(null)
              setQuestionTransition(false)
            }, 400)
          }
        }
      )
      .subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [member?.subject, currentIndex])

  // Anti-cheat: detect tab switching
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && !wasHiddenRef.current) {
        wasHiddenRef.current = true
        setShowTabWarning(true)
        setTimeout(() => setShowTabWarning(false), 4000)
      } else if (!document.hidden) {
        wasHiddenRef.current = false
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const handleAnswer = useCallback(async (option: string) => {
    if (!member || !quiz) return
    const q = questions[currentIndex]
    if (!q) return
    if (answers[q.id]) return // already answered

    setSubmitting(true)
    setFeedbackOption(option)

    try {
      const res = await fetch('/api/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          quizId: quiz.id,
          subject: member.subject,
          questionId: q.id,
          questionIndex: currentIndex,
          selectedOption: option,
        }),
      })

      const result = await res.json()

      if (res.ok) {
        setAnswers(prev => ({
          ...prev,
          [q.id]: {
            selected: option,
            correct: result.correctOption,
            isCorrect: result.isCorrect,
          },
        }))
        setScore(prev => Math.max(0, prev + result.pointsEarned))
      }
    } catch (err) {
      console.error('Failed to submit answer:', err)
    }
    setSubmitting(false)
  }, [member, quiz, questions, currentIndex, answers])

  const currentQuestion = questions[currentIndex]
  const subjectCfg = member ? SUBJECT_CONFIG[member.subject as Subject] : null
  const answered = currentQuestion ? answers[currentQuestion.id] : null
  const progressPct = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0

  const getOptionClass = (opt: string) => {
    if (!answered) return 'option-btn'
    if (opt === answered.correct) return 'option-btn correct'
    if (opt === answered.selected && !answered.isCorrect) return 'option-btn wrong'
    return 'option-btn'
  }

  // Quiz ended state
  if (quizStatus === 'ended' || quizStatus === 'results_published') {
    return (
      <main className={styles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        <div className={`${styles.waitingCard} anim-scale-in`}>
          <div className={styles.waitingOrbit}>
            <div className={styles.orbitDot} />
            <div className={styles.orbitDot2} />
          </div>
          <div className={styles.waitingIcon}><CheckCircle size={36} strokeWidth={1.5} /></div>
          <h2 className={styles.waitingTitle}>Quiz Complete</h2>
          <p className={styles.waitingDesc}>
            Your answers have been recorded.<br />
            {quizStatus === 'results_published'
              ? 'Results are ready!'
              : 'Waiting for results to be published...'}
          </p>
          {quizStatus === 'results_published' && (
            <button
              onClick={() => router.push('/summons/results')}
              className="btn btn-primary"
              style={{ marginTop: 16, minWidth: 200 }}
            >
              View Results →
            </button>
          )}
          <div className={styles.finalScore}>
            <span className={styles.finalScoreLabel}>Your Score</span>
            <span className={styles.finalScoreNum}>{score}</span>
          </div>
        </div>
      </main>
    )
  }

  if (!currentQuestion) {
    return (
      <main className={styles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        <div className={styles.loadingWrap}>
          <div className={styles.loader} />
          <p>Loading quiz...</p>
        </div>
      </main>
    )
  }

  const options = [
    { key: 'A', text: currentQuestion.option_a },
    { key: 'B', text: currentQuestion.option_b },
    { key: 'C', text: currentQuestion.option_c },
    { key: 'D', text: currentQuestion.option_d },
    ...(currentQuestion.option_e ? [{ key: 'E', text: currentQuestion.option_e }] : []),
  ]

  return (
    <main className={styles.main}>
      <div className="bg-grid" />
      <div className="bg-radial" />

      {/* Tab warning */}
      {showTabWarning && (
        <div className={`toast error ${styles.tabWarning} anim-slide-right`}>
          <AlertTriangle size={14} /> Tab switch detected — this has been logged.
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
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreLabel}>Score</span>
            <span className={styles.scoreNum}>{score}</span>
          </div>
        </div>

        {/* Progress */}
        <div className={`progress-track ${styles.progress}`}>
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Question card */}
        <div
          className={`${styles.questionCard} ${questionTransition ? styles.cardExit : styles.cardEnter}`}
          key={currentIndex}
        >
          {/* Question image */}
          {currentQuestion.image_url && (
            <div className={styles.imageWrap}>
              <img src={currentQuestion.image_url} alt="Question" className={styles.questionImg} />
            </div>
          )}

          {/* Question text */}
          <div className={styles.questionHeader}>
            <div className={styles.qIndex}>Q{currentIndex + 1}</div>
            <p className={styles.questionText}>{currentQuestion.question_text}</p>
          </div>

          {/* Points info */}
          <div className={styles.pointsInfo}>
            <span className={styles.pointsCorrect}>+{currentQuestion.points} correct</span>
            {currentQuestion.negative_points > 0 && (
              <span className={styles.pointsWrong}>−{currentQuestion.negative_points} wrong</span>
            )}
          </div>

          {/* Options */}
          <div className={styles.optionsGrid}>
            {options.map(opt => (
              <button
                key={opt.key}
                className={getOptionClass(opt.key)}
                onClick={() => handleAnswer(opt.key)}
                disabled={!!answered || submitting}
              >
                <span className="option-letter">{opt.key}</span>
                <span className={styles.optionText}>{opt.text}</span>
                {answered && opt.key === answered.correct && (
                  <span className={styles.correctMark}>✓</span>
                )}
                {answered && opt.key === answered.selected && !answered.isCorrect && (
                  <span className={styles.wrongMark}>✗</span>
                )}
              </button>
            ))}
          </div>

          {/* Feedback */}
          {answered && (
            <div className={`${styles.feedback} ${answered.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong} anim-fade-up`}>
              {answered.isCorrect
                ? `✓ Correct! +${currentQuestion.points} points`
                : `✗ Incorrect. Correct answer: ${answered.correct}`
              }
            </div>
          )}

          {!answered && (
            <p className={styles.waitNote}>
              Waiting for next question from admin — answer when ready.
            </p>
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
