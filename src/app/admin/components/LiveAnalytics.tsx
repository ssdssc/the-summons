'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from './SubjectIcon'
import { Medal } from 'lucide-react'
import styles from './LiveAnalytics.module.css'

interface Props { subject: Subject; token: string }

interface SessionData {
  memberId: string
  memberName: string
  schoolName: string
  totalScore: number
  answeredCount: number
  lastAnsweredAt: string | null
  cheatFlags: number
}

interface QuestionStat {
  questionIndex: number
  questionText: string
  optionCounts: Record<string, number>
  correctOption: string
  totalResponses: number
  totalParticipants: number
}

export default function LiveAnalytics({ subject, token }: Props) {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [questionStat, setQuestionStat] = useState<QuestionStat | null>(null)
  const [currentQIndex, setCurrentQIndex] = useState(-1)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const cfg = SUBJECT_CONFIG[subject]

  useEffect(() => {
    fetchAnalytics()
    // Poll every 4 seconds for live updates
    pollRef.current = setInterval(fetchAnalytics, 4000)

    // Also subscribe to realtime session changes
    const ch = supabase
      .channel(`admin-analytics-${subject}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions', filter: `subject=eq.${subject}` },
        () => fetchAnalytics())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${subject}` },
        (p: any) => { setCurrentQIndex(p.new.current_question_index ?? -1); fetchAnalytics() })
      .subscribe()

    return () => { clearInterval(pollRef.current); ch.unsubscribe() }
  }, [subject, token])

  async function fetchAnalytics() {
    const t = token || (typeof window !== 'undefined' ? sessionStorage.getItem('admin_token') || '' : '')
    if (!t) return

    const res = await fetch(`/api/admin/control?subject=${subject}`, {
      headers: { 'x-admin-token': t },
    })
    if (!res.ok) return
    const data = await res.json()
    setLoading(false)

    const qIndex = data.state?.current_question_index ?? -1
    setCurrentQIndex(qIndex)

    // Build session list
    const built: SessionData[] = (data.sessions ?? []).map((s: any) => {
      const answers = (s.answers ?? []) as any[]
      const lastAns = answers.length > 0 ? answers[answers.length - 1]?.answeredAt : null
      const flags = Array.isArray(s.cheat_flags) ? s.cheat_flags.length : 0
      return {
        memberId: s.member_id,
        memberName: s.members?.name ?? '—',
        schoolName: s.members?.registrations?.school_name ?? '—',
        totalScore: s.total_score ?? 0,
        answeredCount: answers.length,
        lastAnsweredAt: lastAns,
        cheatFlags: flags,
      }
    })
    setSessions(built)
    setTotalParticipants(data.sessions?.length ?? 0)

    // Build question stat for current question
    if (qIndex >= 0 && data.questions?.[qIndex]) {
      const q = data.questions[qIndex]
      const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 }
      for (const s of (data.sessions ?? [])) {
        const ans = (s.answers ?? []).find((a: any) => a.questionIndex === qIndex)
        if (ans?.selectedOption) counts[ans.selectedOption] = (counts[ans.selectedOption] || 0) + 1
      }
      const totalResp = Object.values(counts).reduce((a, b) => a + b, 0)
      setQuestionStat({
        questionIndex: qIndex,
        questionText: q.question_text,
        optionCounts: counts,
        correctOption: q.correct_option,
        totalResponses: totalResp,
        totalParticipants: data.sessions?.length ?? 0,
      })
    }
  }

  const answeredNow = questionStat
    ? sessions.filter(s => s.answeredCount > currentQIndex).length
    : 0
  const responseRate = totalParticipants > 0 ? Math.round((answeredNow / totalParticipants) * 100) : 0

  if (loading) return (
    <div className={styles.wrap}>
      <div className={styles.loadingState}>
        <div className={styles.loader} />
        <span>Loading analytics...</span>
      </div>
    </div>
  )

  return (
    <div className={styles.wrap}>
      {/* ── Header ── */}
      <div className={styles.analyticsHeader}>
        <div className={styles.ahTitle}>
          <span className="status-dot live" />
          Live Analytics
        </div>
        <div className={styles.ahSub} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
          <SubjectIcon subject={subject} /> {cfg.label}
        </div>
      </div>

      {/* ── Response rate ── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Response Rate — Q{currentQIndex + 1}</div>
        <div className={styles.rateRow}>
          <div className={styles.ratePct}>{responseRate}%</div>
          <div className={styles.rateDetail}>{answeredNow} / {totalParticipants} responded</div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${responseRate}%` }} />
        </div>
      </div>

      {/* ── Answer distribution ── */}
      {questionStat && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Answer Distribution</div>
          <p className={styles.qPreview}>{questionStat.questionText.slice(0, 80)}{questionStat.questionText.length > 80 ? '…' : ''}</p>
          <div className={styles.distGrid}>
            {['A', 'B', 'C', 'D', 'E'].filter(o => questionStat.optionCounts[o] !== undefined).map(opt => {
              const count = questionStat.optionCounts[opt] ?? 0
              const pct = questionStat.totalParticipants > 0
                ? Math.round((count / questionStat.totalParticipants) * 100) : 0
              const isCorrect = opt === questionStat.correctOption
              return (
                <div key={opt} className={styles.distRow}>
                  <div className={`${styles.distKey} ${isCorrect ? styles.distKeyCorrect : ''}`}>{opt}</div>
                  <div className={styles.distBarWrap}>
                    <div
                      className={`${styles.distBar} ${isCorrect ? styles.distBarCorrect : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={styles.distPct}>{pct}%</div>
                  <div className={styles.distCount}>{count}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── School grid ── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Schools Live — {sessions.length} participants</div>
        {sessions.length === 0 ? (
          <p className={styles.empty}>No participants connected yet.</p>
        ) : (
          <div className={styles.schoolGrid}>
            {sessions
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((s, i) => {
                const hasAnsweredCurrent = s.answeredCount > currentQIndex
                return (
                  <div key={s.memberId || `school-${i}`} className={`${styles.schoolCard} ${hasAnsweredCurrent ? styles.schoolCardAnswered : ''}`}>
                    <div className={styles.schoolIndicator}>
                      <span className={`status-dot ${hasAnsweredCurrent ? 'live' : 'waiting'}`} />
                    </div>
                    <div className={styles.schoolCardInfo}>
                      <div className={styles.schoolCardName}>{s.schoolName}</div>
                      <div className={styles.schoolCardMember}>{s.memberName}</div>
                    </div>
                    <div className={styles.schoolCardScore}>
                      <span className={styles.scoreNum}>{s.totalScore}</span>
                      <span className={styles.scoreAns}>{s.answeredCount} ans</span>
                    </div>
                    {s.cheatFlags > 0 && (
                      <div className={styles.flagBadge} title={`${s.cheatFlags} violation(s) logged`}>
                        ⚠ {s.cheatFlags}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* ── Live leaderboard ── */}
      {sessions.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Live Rankings</div>
          <div className={styles.liveRanks}>
            {[...sessions]
              .sort((a, b) => b.totalScore - a.totalScore)
              .slice(0, 10)
              .map((s, i) => (
                <div key={s.memberId || `rank-${i}`} className={styles.rankRow}>
                  <span className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                    {i === 0 ? <Medal color="#fbbf24" size={16} /> :
                     i === 1 ? <Medal color="#94a3b8" size={16} /> :
                     i === 2 ? <Medal color="#b45309" size={16} /> :
                     `#${i+1}`}
                  </span>
                  <div className={styles.rankInfo}>
                    <span className={styles.rankSchool}>{s.schoolName}</span>
                    <span className={styles.rankMember}>{s.memberName}</span>
                  </div>
                  <span className={styles.rankScore}>{s.totalScore}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
