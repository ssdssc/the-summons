'use client'

import { useState, useEffect } from 'react'
import { Sliders, FileText, Settings, Users, Tv, ExternalLink } from 'lucide-react'
import { SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import QuizSettings from './components/QuizSettings'
import QuestionManager from './components/QuestionManager'
import QuizController from './components/QuizController'
import LiveAnalytics from './components/LiveAnalytics'
import RegistrationManager from './components/RegistrationManager'
import EvoRegistrationManager from './components/EvoRegistrationManager'
import styles from './page.module.css'
import { SubjectIcon } from './components/SubjectIcon'

const SUBJECTS: Subject[] = ['biology', 'chemistry', 'physics', 'maths']

export default function AdminPage() {
  const [activeSubject, setActiveSubject] = useState<Subject>('biology')
  const [activePanel, setActivePanel] = useState<'control' | 'questions' | 'settings' | 'registrations' | 'web-registrations'>('control')
  const [quizStates, setQuizStates] = useState<Record<string, string>>({})
  const [projectorSubject, setProjectorSubject] = useState<string>('auto')
  const [token, setToken] = useState('')

  useEffect(() => {
    const t = sessionStorage.getItem('admin_token') || ''
    setToken(t)
    loadQuizStates(t)
    loadProjectorState(t)
  }, [])

  async function loadQuizStates(t: string) {
    const res = await fetch('/api/admin/quizzes', { headers: { 'x-admin-token': t } })
    if (!res.ok) return
    const { states } = await res.json()
    const map: Record<string, string> = {}
    for (const s of (states ?? [])) map[s.subject] = s.status
    setQuizStates(map)
  }

  async function loadProjectorState(t: string) {
    if (!t) return
    try {
      const res = await fetch('/api/admin/projector', { headers: { 'x-admin-token': t } })
      if (res.ok) {
        const json = await res.json()
        if (json.activeSubject) setProjectorSubject(json.activeSubject)
      }
    } catch {}
  }

  async function handleProjectorChange(val: string) {
    setProjectorSubject(val)
    if (!token) return
    await fetch('/api/admin/projector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ subject: val }),
    })
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
          {(['control', 'questions', 'settings', 'registrations', 'web-registrations'] as const).map(p => (
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
              {p === 'web-registrations' && <><Users size={16} /> Pending Signups</>}
            </button>
          ))}

          {/* Projector Dropdown inside panel tabs matching tab-btn */}
          <div className="tab-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px 0 12px' }}>
            <Tv size={16} style={{ opacity: 0.8 }} />
            <select
              value={projectorSubject}
              onChange={e => handleProjectorChange(e.target.value)}
              style={{
                background: 'transparent',
                color: 'inherit',
                border: 'none',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                outline: 'none',
                padding: '6px 0',
              }}
            >
              <option value="auto" style={{ background: '#141414', color: '#fff' }}>Projector: Auto (10s)</option>
              <option value="biology" style={{ background: '#141414', color: '#fff' }}>Projector: Biology</option>
              <option value="chemistry" style={{ background: '#141414', color: '#fff' }}>Projector: Chemistry</option>
              <option value="physics" style={{ background: '#141414', color: '#fff' }}>Projector: Physics</option>
              <option value="maths" style={{ background: '#141414', color: '#fff' }}>Projector: Maths</option>
            </select>
            <a
              href="/admin/projector"
              target="_blank"
              rel="noreferrer"
              title="Open Projector in new tab"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-3)',
                padding: '4px',
                borderRadius: '4px',
                marginLeft: '2px',
              }}
            >
              <ExternalLink size={13} />
            </a>
          </div>
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
        {activePanel === 'web-registrations' && (
          <EvoRegistrationManager token={token} />
        )}
      </div>
    </main>
  )
}
