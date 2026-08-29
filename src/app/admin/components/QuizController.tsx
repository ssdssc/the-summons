'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from './SubjectIcon'
import { AlertTriangle, Play, Square, Trophy, CheckCircle, RotateCcw, Timer, Download } from 'lucide-react'
import styles from './QuizController.module.css'

interface Props {
  subject: Subject
  token: string
  onStateChange: () => void
}

export default function QuizController({ subject, token, onStateChange }: Props) {
  const [state, setState] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const autoAdvancingRef = useRef(false)
  const cfg = SUBJECT_CONFIG[subject]

  const loadState = useCallback(async () => {
    const res = await fetch(`/api/admin/control?subject=${subject}`, {
      headers: { 'x-admin-token': token },
    })
    if (!res.ok) return
    const data = await res.json()
    setState(data.state)
    setQuestions(data.questions ?? [])
  }, [subject, token])

  // Load state + listen realtime
  useEffect(() => {
    loadState()
    const ch = supabase
      .channel(`admin-ctrl-${subject}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${subject}` },
        (p: any) => setState(p.new))
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [subject, loadState])

  // Auto-advance countdown
  useEffect(() => {
    clearInterval(countdownRef.current)
    setCountdown(null)
    autoAdvancingRef.current = false

    if (state?.status !== 'active' || state?.current_question_index < 0) return

    const currentQ = questions[state.current_question_index]
    if (!currentQ || !state.question_started_at) return

    const timeLimitMs = (currentQ.time_seconds ?? 30) * 1000
    const startedAt = new Date(state.question_started_at).getTime()

    function tick() {
      const elapsed = Date.now() - startedAt
      const remaining = Math.ceil((timeLimitMs - elapsed) / 1000)

      if (remaining <= 0) {
        clearInterval(countdownRef.current)
        setCountdown(0)
        if (!autoAdvancingRef.current) {
          autoAdvancingRef.current = true
          doAction('next')
        }
      } else {
        setCountdown(remaining)
      }
    }

    tick()
    countdownRef.current = setInterval(tick, 250)
    return () => clearInterval(countdownRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_question_index, state?.question_started_at, state?.status, questions])

  async function doAction(action: string) {
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/admin/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ action, subject }),
    })
    const json = await res.json()
    if (!res.ok) {
      setMsg('error:' + json.error)
    } else {
      setMsg(action === 'start'          ? 'Quiz started!' :
             action === 'end'            ? 'Quiz ended.' :
             action === 'reset'          ? 'Quiz reset to waiting.' :
             'Results published!')
      onStateChange()
      loadState()
    }
    setLoading(false)
    setTimeout(() => setMsg(''), 3000)
    autoAdvancingRef.current = false
  }

  async function exportCSV() {
    const url = `/api/admin/export-csv?subject=${subject}`
    const res = await fetch(url, { headers: { 'x-admin-token': token } })
    if (!res.ok) { alert('Export failed'); return }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `summons-${subject}-results.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const status = state?.status ?? 'waiting'
  const currentQIdx = state?.current_question_index ?? -1
  const questionCount = questions.length
  const isWaiting = status === 'waiting'
  const isActive  = status === 'active'
  const isEnded   = status === 'ended'
  const isPublished = status === 'results_published'

  const currentQ = isActive && currentQIdx >= 0 ? questions[currentQIdx] : null
  const timeLimitSec = currentQ?.time_seconds ?? 30
  const countdownPct = countdown !== null ? Math.max(0, (countdown / timeLimitSec) * 100) : 100

  return (
    <div className={styles.wrap}>
      {/* Subject header */}
      <div className={styles.subjectBar} style={{ '--col': cfg.color, '--glow': cfg.glow } as any}>
        <span className={styles.icon}><SubjectIcon subject={subject} size={18} /></span>
        <span className={styles.subjectName}>{cfg.label}</span>
        <span className={`${styles.statusBadge} ${styles['s_' + status]}`}>
          {status === 'active' ? <><span className={styles.liveDot} />LIVE</> : status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {/* Progress */}
      <div className={styles.progressWrap}>
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>Question</span>
          <span className={styles.progressVal}>{isActive ? currentQIdx + 1 : '—'} / {questionCount}</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: questionCount > 0 && isActive ? `${((currentQIdx + 1) / questionCount) * 100}%` : '0%' }} />
        </div>
      </div>

      {/* Countdown timer — shown when active */}
      {isActive && countdown !== null && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: countdown <= 5 ? '#ef4444' : 'var(--text-2)' }}>
              <Timer size={14} /> Auto-advancing in
            </span>
            <span style={{ fontWeight: 700, fontSize: 22, color: countdown <= 5 ? '#ef4444' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {countdown}s
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${countdownPct}%`,
              background: countdown <= 5 ? '#ef4444' : 'var(--accent)',
              transition: 'width 0.25s linear, background 0.3s',
              borderRadius: 4,
            }} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.actions}>
        {isWaiting && (
          <button className={`btn btn-success ${styles.bigBtn}`} onClick={() => doAction('start')} disabled={loading || questionCount === 0}>
            {loading ? <span className={styles.spin} /> : <><Play size={16} className="inline-block mr-2" /> Start Quiz</>}
          </button>
        )}

        {isActive && (
          <button className={`btn btn-danger ${styles.bigBtn}`} onClick={() => doAction('end')} disabled={loading}>
            {loading ? <span className={styles.spin} /> : <><Square size={16} className="inline-block mr-2" /> End Quiz</>}
          </button>
        )}

        {isEnded && (
          <>
            <button className={`btn btn-primary ${styles.bigBtn}`} onClick={() => doAction('publish_results')} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><Trophy size={16} /> Publish Results</>}
            </button>
            <button className={`btn btn-ghost ${styles.bigBtn}`} onClick={exportCSV}>
              <Download size={14} /> Export CSV
            </button>
            <button className={`btn btn-ghost ${styles.bigBtn}`} onClick={() => { if (confirm('Reset quiz? This will delete all participant sessions.')) doAction('reset') }} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><RotateCcw size={15} /> Reset to Waiting</>}
            </button>
          </>
        )}

        {isPublished && (
          <>
            <div className={styles.doneBadge}><CheckCircle size={16} /> Results Published</div>
            <button className={`btn btn-ghost ${styles.bigBtn}`} onClick={exportCSV}>
              <Download size={14} /> Export CSV
            </button>
            <button className={`btn btn-ghost ${styles.bigBtn}`} onClick={() => { if (confirm('Reset quiz? This will delete all participant sessions and unpublish results.')) doAction('reset') }} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><RotateCcw size={15} /> Reset to Waiting</>}
            </button>
          </>
        )}
      </div>

      {questionCount === 0 && isWaiting && (
        <p className={styles.warn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} /> No questions added yet. Go to the Questions tab first.
        </p>
      )}

      {msg && (
        <div className={styles.msg} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: msg.startsWith('error:') ? '#ef4444' : 'inherit' }}>
          {msg.startsWith('error:') ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          {msg.startsWith('error:') ? msg.split(':')[1] : msg}
        </div>
      )}

      {/* Started at info */}
      {state?.started_at && (
        <div className={styles.startedAt}>
          Started: {new Date(state.started_at).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
