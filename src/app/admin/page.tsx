'use client'

import { useState, useEffect } from 'react'
import { Sliders, FileText, Settings, Users } from 'lucide-react'
import { SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import QuizSettings from './components/QuizSettings'
import QuestionManager from './components/QuestionManager'
import QuizController from './components/QuizController'
import LiveAnalytics from './components/LiveAnalytics'
import RegistrationManager from './components/RegistrationManager'
import styles from './page.module.css'
import { SubjectIcon } from './components/SubjectIcon'

const SUBJECTS: Subject[] = ['biology', 'chemistry', 'physics', 'maths']

export default function AdminPage() {
  const [activeSubject, setActiveSubject] = useState<Subject>('biology')
  const [activePanel, setActivePanel] = useState<'control' | 'questions' | 'settings' | 'registrations'>('control')
  const [quizStates, setQuizStates] = useState<Record<string, string>>({})
  const [token, setToken] = useState('')

  useEffect(() => {
    const t = sessionStorage.getItem('admin_token') || ''
    setToken(t)
    loadQuizStates(t)
  }, [])

  async function loadQuizStates(t: string) {
    const res = await fetch('/api/admin/quizzes', { headers: { 'x-admin-token': t } })
    if (!res.ok) return
    const { states } = await res.json()
    const map: Record<string, string> = {}
    for (const s of (states ?? [])) map[s.subject] = s.status
    setQuizStates(map)
  }

  const subjectCfg = SUBJECT_CONFIG[activeSubject]

  return (
    <main className={styles.main}>
      <div className="bg-grid" />

      {/* ── Top bar ── */}
      <header className={`${styles.header} anim-fade-in`}>
        <div className={styles.headerLeft}>
          <div className={styles.headerLogo}>
            <img src="/evo-logo.png" alt="Evolvion" width={36} height={36} style={{ borderRadius: 8 }} />
          </div>
          <div>
            <h1 className={styles.headerTitle}>Command Centre</h1>
            <p className={styles.headerSub}>Evolvion '26 · THE SUMMONS</p>
          </div>
        </div>

        {/* Subject tabs */}
        <div className={styles.subjectTabs}>
          {SUBJECTS.map(sub => {
            const cfg = SUBJECT_CONFIG[sub]
            const status = quizStates[sub] ?? 'waiting'
            return (
              <button
                key={sub}
                className={`${styles.subjectTab} ${activeSubject === sub ? styles.subjectTabActive : ''}`}
                style={{ '--col': cfg.color, '--glow': cfg.glow } as any}
                onClick={() => setActiveSubject(sub)}
              >
                <span className={styles.tabIcon}><SubjectIcon subject={sub} /></span>
                <span className={styles.tabLabel}>{cfg.short}</span>
                <span className={`${styles.tabStatus} ${styles['status_' + status]}`} />
              </button>
            )
          })}
        </div>

        {/* Panel tabs */}
        <div className={styles.panelTabs}>
          {(['control', 'questions', 'settings', 'registrations'] as const).map(p => (
            <button
              key={p}
              className={`tab-btn ${activePanel === p ? 'active' : ''}`}
              onClick={() => setActivePanel(p)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {p === 'control'       && <><Sliders size={16} /> Control</>}
              {p === 'questions'     && <><FileText size={16} /> Questions</>}
              {p === 'settings'      && <><Settings size={16} /> Settings</>}
              {p === 'registrations' && <><Users size={16} /> Schools</>}
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ── */}
      <div className={styles.body}>
        {activePanel === 'control' && (
          <div className={styles.controlGrid}>
            <QuizController
              subject={activeSubject}
              token={token}
              onStateChange={() => loadQuizStates(token)}
            />
            <LiveAnalytics subject={activeSubject} token={token} />
          </div>
        )}
        {activePanel === 'questions' && (
          <QuestionManager subject={activeSubject} token={token} />
        )}
        {activePanel === 'settings' && (
          <QuizSettings subject={activeSubject} token={token} />
        )}
        {activePanel === 'registrations' && (
          <RegistrationManager token={token} />
        )}
      </div>
    </main>
  )
}
