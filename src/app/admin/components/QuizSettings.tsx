'use client'

import { useState, useEffect } from 'react'
import { SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from './SubjectIcon'
import { Check, AlertTriangle } from 'lucide-react'
import styles from './QuizSettings.module.css'

interface Props { subject: Subject; token: string }

const SUBJECTS: Subject[] = ['biology', 'chemistry', 'physics', 'maths']

export default function QuizSettings({ subject, token }: Props) {
  const [form, setForm] = useState({ title: '', scheduledAt: '', correctPoints: 4, negativePoints: 0 })
  const [allSchedules, setAllSchedules] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const cfg = SUBJECT_CONFIG[subject]

  useEffect(() => { loadSettings() }, [subject])

  async function loadSettings() {
    const res = await fetch('/api/admin/quizzes', { headers: { 'x-admin-token': token } })
    if (!res.ok) return
    const { quizzes } = await res.json()

    // Build schedule map for all subjects
    const schedMap: Record<string, string> = {}
    for (const q of (quizzes ?? [])) {
      schedMap[q.subject] = q.scheduled_at ?? ''
    }
    setAllSchedules(schedMap)

    const q = quizzes?.find((x: any) => x.subject === subject)
    if (q) {
      setForm({
        title: q.title ?? `${cfg.label} Quiz`,
        scheduledAt: q.scheduled_at ? new Date(q.scheduled_at).toISOString().slice(0, 16) : '',
        correctPoints: q.correct_points ?? 4,
        negativePoints: 0,
      })
    } else {
      setForm(f => ({ ...f, title: `${cfg.label} Quiz`, negativePoints: 0 }))
    }
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ subject, title: form.title, scheduledAt: form.scheduledAt || null, correctPoints: form.correctPoints, negativePoints: 0 }),
    })
    setSaving(false)
    if (res.ok) {
      setAllSchedules(prev => ({ ...prev, [subject]: form.scheduledAt }))
      setMsg('success:Settings saved')
    } else {
      setMsg('error:Failed to save')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span><SubjectIcon subject={subject} /></span>
        <span className={styles.title}>{cfg.label} — Quiz Settings</span>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label}>Quiz Title</label>
          <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Biology Quiz — THE SUMMONS" />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Scheduled Start Time</label>
          <input type="datetime-local" className="input" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
          <p className={styles.hint}>Members will see a countdown to this time on the portal.</p>
        </div>

        <div className={styles.scoring}>
          <h4 className={styles.scoringTitle}>Scoring System</h4>
          <div className={styles.scoringGrid} style={{ gridTemplateColumns: '1fr' }}>
            <div className={styles.field}>
              <label className={styles.label}>Points for Correct Answer</label>
              <input type="number" className="input" min={1} value={form.correctPoints} onChange={e => setForm(f => ({ ...f, correctPoints: +e.target.value }))} />
              <p className={styles.hint}>No points are deducted for wrong or skipped answers.</p>
            </div>
          </div>
          <div className={styles.scoringPreview}>
            <span className={styles.spCorrect}>+{form.correctPoints} correct</span>
            <span className={styles.spSep}>/</span>
            <span className={styles.spSkip}>0 wrong or skipped</span>
          </div>
        </div>

        {msg && (
          <div className={styles.msg} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {msg.startsWith('success:') ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{msg.split(':')[1]}</span>
          </div>
        )}

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* All subject schedules overview */}
      <div className={styles.scheduleSection}>
        <h4 className={styles.scheduleTitle}>All Subject Schedules</h4>
        <div className={styles.scheduleGrid}>
          {SUBJECTS.map(sub => {
            const rawTime = sub === subject && form.scheduledAt
              ? form.scheduledAt
              : allSchedules[sub] ?? ''
            const display = rawTime
              ? new Date(rawTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—'
            return (
              <div key={sub} className={`${styles.scheduleCard} ${sub === subject ? styles.scheduleCardActive : ''}`}>
                <span><SubjectIcon subject={sub} /></span>
                <span className={styles.scheduleSubject}>{SUBJECT_CONFIG[sub].short}</span>
                <span className={styles.scheduleTime}>{display}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
