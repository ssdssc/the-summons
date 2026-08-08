'use client'

import { useState, useEffect } from 'react'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from './SubjectIcon'
import { AlertTriangle, Play, Pause, Square, Trophy, Save, ChevronRight, CheckCircle, RotateCcw } from 'lucide-react'
import styles from './QuizController.module.css'

interface Props {
  subject: Subject
  token: string
  onStateChange: () => void
}

export default function QuizController({ subject, token, onStateChange }: Props) {
  const [state, setState] = useState<any>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const cfg = SUBJECT_CONFIG[subject]

  // Load state + listen realtime
  useEffect(() => {
    loadState()
    const ch = supabase
      .channel(`admin-ctrl-${subject}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${subject}` },
        (p: any) => setState(p.new))
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [subject])

  async function loadState() {
    const res = await fetch(`/api/admin/control?subject=${subject}`, {
      headers: { 'x-admin-token': token },
    })
    if (!res.ok) return
    const data = await res.json()
    setState(data.state)
    setQuestionCount(data.questions?.length ?? 0)
  }

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
             action === 'next'           ? `Advanced to Q${(state?.current_question_index ?? 0) + 2}` :
             action === 'end'            ? 'Quiz ended.' :
             action === 'reset'          ? 'Quiz reset to waiting.' :
             'Results published!')
      onStateChange()
    }
    setLoading(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const status = state?.status ?? 'waiting'
  const currentQ = state?.current_question_index ?? -1
  const isWaiting = status === 'waiting'
  const isActive  = status === 'active'
  const isEnded   = status === 'ended'
  const isPublished = status === 'results_published'

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
          <span className={styles.progressVal}>{isActive ? currentQ + 1 : '—'} / {questionCount}</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: questionCount > 0 && isActive ? `${((currentQ + 1) / questionCount) * 100}%` : '0%' }} />
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.actions}>
        {isWaiting && (
          <button className={`btn btn-success ${styles.bigBtn}`} onClick={() => doAction('start')} disabled={loading || questionCount === 0}>
            {loading ? <span className={styles.spin} /> : <><Play size={16} className="inline-block mr-2" /> Start Quiz</>}
          </button>
        )}

        {isActive && (
          <>
            <button className={`btn btn-primary ${styles.bigBtn}`} onClick={() => doAction('next')} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><ChevronRight size={16} className="inline-block mr-2" /> Next Question</>}
            </button>
            <button className={`btn btn-danger ${styles.bigBtn}`} onClick={() => doAction('end')} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><Square size={16} className="inline-block mr-2" /> End Quiz</>}
            </button>
          </>
        )}

        {isEnded && (
          <>
            <button className={`btn btn-primary ${styles.bigBtn}`} onClick={() => doAction('publish_results')} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><Trophy size={16} /> Publish Results</>}
            </button>
            <button className={`btn btn-ghost ${styles.bigBtn}`} onClick={() => { if (confirm('Reset quiz? This will delete all participant sessions.')) doAction('reset') }} disabled={loading}>
              {loading ? <span className={styles.spin} /> : <><RotateCcw size={15} /> Reset to Waiting</>}
            </button>
          </>
        )}

        {isPublished && (
          <>
            <div className={styles.doneBadge}><CheckCircle size={16} /> Results Published</div>
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
