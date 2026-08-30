'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from '@/app/admin/components/SubjectIcon'
import { Zap, CalendarClock, AlertTriangle } from 'lucide-react'
import styles from './page.module.css'

interface MemberData {
  id: string
  name: string
  subject: Subject
  isCaptain: boolean
  accessCode: string
}

interface QuizData {
  id: string
  title: string
  scheduledAt: string | null
  durationMinutes: number
  status: string
  currentQuestion: number
  startedAt: string | null
}

interface PortalData {
  member: MemberData
  school: { name: string; logoUrl: string | null }
  quiz: QuizData | null
}

export default function SummonsPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<PortalData | null>(null)
  const [quizStatus, setQuizStatus] = useState<string>('waiting')
  const [langPicked, setLangPicked] = useState(false)
  const [selectedLang, setSelectedLang] = useState<'en' | 'si'>('en')
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<any>(null)
  const [particles, setParticles] = useState<Array<Record<string, string>>>([])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Generate particles client-side only to avoid SSR hydration mismatch
  useEffect(() => {
    setParticles(
      Array.from({ length: 20 }, () => ({
        '--x': `${Math.random() * 100}%`,
        '--y': `${Math.random() * 100}%`,
        '--delay': `${Math.random() * 8}s`,
        '--duration': `${6 + Math.random() * 8}s`,
        '--size': `${2 + Math.random() * 3}px`,
      }))
    )
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!data?.quiz?.scheduledAt) return
    const target = new Date(data.quiz.scheduledAt).getTime()
    const tick = () => {
      const diff = target - Date.now()
      if (diff <= 0) { setCountdown(null); return }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [data?.quiz?.scheduledAt])

  // Supabase Realtime — listen to quiz_state changes
  useEffect(() => {
    if (!data?.member?.subject) return

    const subject = data.member.subject
    setQuizStatus(data.quiz?.status ?? 'waiting')

    channelRef.current = supabase
      .channel(`quiz-state-${subject}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${subject}` },
        (payload: any) => {
          const newStatus = payload.new.status
          setQuizStatus(newStatus)
          if (newStatus === 'active') {
            // Flash notification then navigate
            setTimeout(() => {
              sessionStorage.setItem('summons_member', JSON.stringify(data.member))
              sessionStorage.setItem('summons_school', JSON.stringify(data.school))
              sessionStorage.setItem('summons_quiz', JSON.stringify({ ...data.quiz, status: 'active' }))
              router.push('/summons/quiz')
            }, 1200)
          }
        }
      )
      .subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [data, router])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code.trim() }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Invalid access code. Please check and try again.')
        setLoading(false)
        return
      }

      setData(json)
      setQuizStatus(json.quiz?.status ?? 'waiting')

      // Persist session token for dual-device kick detection
      if (json.sessionToken) {
        sessionStorage.setItem('summons_session_token', json.sessionToken)
      }

      // If already active, go straight to quiz (after lang pick handled below)
      // We still show the member card first so they can pick language

      // If results published
      if (json.quiz?.status === 'results_published' || json.quiz?.status === 'ended') {
        sessionStorage.setItem('summons_member', JSON.stringify(json.member))
        sessionStorage.setItem('summons_school', JSON.stringify(json.school))
        sessionStorage.setItem('summons_quiz', JSON.stringify(json.quiz))
        router.push('/summons/results')
        return
      }

    } catch (err) {
      setError('Connection error. Please try again.')
    }
    setLoading(false)
  }

  function handleEnterQuiz() {
    if (!data) return
    sessionStorage.setItem('summons_member', JSON.stringify(data.member))
    sessionStorage.setItem('summons_school', JSON.stringify(data.school))
    sessionStorage.setItem('summons_quiz', JSON.stringify({ ...data.quiz, status: quizStatus }))
    sessionStorage.setItem('summons_lang', selectedLang)
    router.push('/summons/quiz')
  }

  function handleLangConfirm(lang: 'en' | 'si') {
    setSelectedLang(lang)
    sessionStorage.setItem('summons_lang', lang)
    setLangPicked(true)
    // If quiz is already active at this point, navigate immediately
    if (quizStatus === 'active' && data) {
      sessionStorage.setItem('summons_member', JSON.stringify(data.member))
      sessionStorage.setItem('summons_school', JSON.stringify(data.school))
      sessionStorage.setItem('summons_quiz', JSON.stringify({ ...data.quiz, status: quizStatus }))
      router.push('/summons/quiz')
    }
  }

  const subjectCfg = data ? SUBJECT_CONFIG[data.member.subject] : null

  return (
    <main className={styles.main}>
      {/* Background */}
      <div className="bg-grid" />
      <div className="bg-radial" />
      <div className={styles.bgGlow} />

      {/* Floating particles — rendered client-side only to prevent hydration mismatch */}
      <div className={styles.particles}>
        {particles.map((style, i) => (
          <div key={i} className={styles.particle} style={style as any} />
        ))}
      </div>

      <div className={styles.content}>
        {!data ? (
          /* ── Access Code Entry ── */
          <div className={`${styles.entryCard} anim-fade-up`}>
            {/* Logo / Branding */}
            <div className={`${styles.branding} anim-fade-up delay-1`}>
              <div className={styles.eventBadge}>
                <span className={styles.phaseDot} />
                PHASE 01
              </div>
              <h1 className={styles.title}>THE SUMMONS</h1>
              <p className={styles.subtitle}>Evolvion <span className={styles.year}>'26</span></p>
              <p className={styles.tagline}>Enter your access code to answer the call.</p>
            </div>

            {/* Code form */}
            <form onSubmit={handleVerify} className={`${styles.form} anim-fade-up delay-3`}>
              <div className={styles.inputWrap}>
                <input
                  ref={inputRef}
                  type="text"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
                  placeholder="PHY-2K9X"
                  className={`${styles.codeInput} ${error ? styles.codeInputError : ''}`}
                  maxLength={12}
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className={styles.inputGlow} />
              </div>

              {error && (
                <div className={`${styles.errorMsg} anim-fade-in`}>
                  <AlertTriangle size={14} /> {error}
                </div>
              )}

              <button
                type="submit"
                className={`btn btn-primary ${styles.submitBtn}`}
                disabled={loading || !code.trim()}
              >
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  <>Verify Access</>
                )}
              </button>
            </form>

            <p className={`${styles.hint} anim-fade-up delay-5`}>
              Your access code was sent to your school's registered email.
            </p>
          </div>
        ) : (
          /* ── Member Card ── */
          <div className={`${styles.entryCard} anim-scale-in`}>
            {/* Branding */}
            <div className={`${styles.branding} anim-fade-up delay-1`} style={{ '--subject-glow': subjectCfg?.glow } as any}>
              <div className={styles.eventBadge}>
                <span className={styles.phaseDot} />
                {subjectCfg?.label || data.member.subject}
              </div>
              <h1 className={styles.title} style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.1 }}>
                {data.member.name}
              </h1>
              <p className={styles.subtitle}>{data.school.name}</p>
              <p className={styles.tagline} style={{ marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', fontWeight: 700, fontSize: '24px', color: 'var(--accent-2)' }}>
                {data.member.accessCode}
              </p>
            </div>

            {/* ── Language Picker ── */}
            {!langPicked ? (
              <div className={`${styles.form} anim-fade-up delay-3`} style={{ marginTop: '-12px' }}>
                <p className={styles.hint} style={{ marginBottom: 4 }}>
                  Select your preferred language<br />ඔබේ භාෂාව තෝරන්න
                </p>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <button
                    id="lang-english"
                    className={`btn btn-primary ${styles.submitBtn}`}
                    onClick={() => handleLangConfirm('en')}
                  >
                    English
                  </button>
                  <button
                    id="lang-sinhala"
                    className={`btn btn-primary ${styles.submitBtn}`}
                    onClick={() => handleLangConfirm('si')}
                  >
                    සිංහල
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Selected lang badge */}
                <div className={styles.langSelectedBadge}>
                  {selectedLang === 'en' ? '🇬🇧 English' : '🇱🇰 සිංහල'}
                  <button
                    className={styles.langChangeBtn}
                    onClick={() => setLangPicked(false)}
                  >
                    Change
                  </button>
                </div>

                {/* Quiz status */}
                {data.quiz ? (
                  <div className={styles.quizStatus}>
                {quizStatus === 'waiting' && (
                  <>
                    <div className={styles.statusRow}>
                      <span className="status-dot waiting" />
                      <span className={styles.statusLabel}>Standing By</span>
                    </div>
                    {countdown ? (
                      <div className={styles.countdown}>
                        <div className={styles.countdownTitle}>Quiz begins in</div>
                        <div className={styles.countdownRow}>
                          {countdown.days > 0 && (
                            <div className={styles.countdownUnit}>
                              <span className="countdown-digit">{String(countdown.days).padStart(2,'0')}</span>
                              <span className="countdown-label">days</span>
                            </div>
                          )}
                          <div className={styles.countdownUnit}>
                            <span className="countdown-digit">{String(countdown.hours).padStart(2,'0')}</span>
                            <span className="countdown-label">hrs</span>
                          </div>
                          <div className={styles.countdownSep}>:</div>
                          <div className={styles.countdownUnit}>
                            <span className="countdown-digit">{String(countdown.minutes).padStart(2,'0')}</span>
                            <span className="countdown-label">min</span>
                          </div>
                          <div className={styles.countdownSep}>:</div>
                          <div className={styles.countdownUnit}>
                            <span className="countdown-digit">{String(countdown.seconds).padStart(2,'0')}</span>
                            <span className="countdown-label">sec</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.waitMsg}>
                        <div className={styles.waitDots}>
                          <span /><span /><span />
                        </div>
                        Waiting for admin to start the quiz...
                      </div>
                    )}
                  </>
                )}

                {quizStatus === 'active' && (
                  <div className={styles.liveSection}>
                    <div className={styles.liveIndicator}>
                      <span className="status-dot live" />
                      <span className={styles.liveText}>QUIZ IS LIVE</span>
                    </div>
                    <div className={styles.waitMsg} style={{ marginTop: '14px' }}>
                      <div className={styles.waitDots}>
                        <span /><span /><span />
                      </div>
                      Entering the arena...
                    </div>
                  </div>
                )}

                {(quizStatus === 'ended' || quizStatus === 'results_published') && (
                  <div className={styles.endedSection}>
                    <div className={styles.statusRow}>
                      <span className="status-dot ended" />
                      <span className={styles.statusLabel}>Quiz Concluded</span>
                    </div>
                    {quizStatus === 'results_published' ? (
                      <button
                        onClick={() => router.push('/summons/results')}
                        className={`btn btn-primary ${styles.enterBtn}`}
                      >
                        View Results →
                      </button>
                    ) : (
                      <p className={styles.waitMsg}>Results will be published shortly...</p>
                    )}
                  </div>
                )}
              </div>
              ) : (
                <div className={styles.noQuizBlock}>
                  <div className={styles.noQuizIconRing}>
                    <div className={styles.noQuizIconInner}>
                      <CalendarClock size={24} strokeWidth={1.5} />
                    </div>
                  </div>
                  <div className={styles.noQuizTitle}>Not Scheduled Yet</div>
                  <div className={styles.noQuizDesc}>
                    The quiz for your subject hasn't been scheduled yet. Keep this page open — you'll be notified the moment it goes live.
                  </div>
                  <div className={styles.noQuizPill}>
                    <span className={styles.noQuizPillDot} />
                    Awaiting schedule
                  </div>
                </div>
              )}
              </>
            )}

            {/* Back */}
            <button
              onClick={() => { setData(null); setCode(''); setError(''); setLangPicked(false); setSelectedLang('en') }}
              className={`btn ${styles.submitBtn}`}
              style={{ background: '#3f3f46', color: '#d4d4d8', borderColor: '#52525b', marginTop: '-18px' }}
            >
              Change Access Code
            </button>
          </div>
        )}

        {/* Footer */}
        <div className={`${styles.footer} anim-fade-up delay-8`}>
          <span>Evolvion '26</span>
          <span className={styles.dot}>·</span>
          <span>D.S. Senanayake College Science Society</span>
        </div>
      </div>
    </main>
  )
}
