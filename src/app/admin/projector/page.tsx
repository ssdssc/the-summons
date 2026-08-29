'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from '../components/SubjectIcon'
import { School } from 'lucide-react'
import styles from './page.module.css'
import type { NotifyPayload } from '@/lib/notify-emitter'

const SUBJECTS: Subject[] = ['biology', 'chemistry', 'physics', 'maths']

// Maximum notifications visible in the column at once
const MAX_NOTIFS = 6

interface LeaderboardItem {
  sessionId: string
  memberId: string
  memberName: string
  schoolName: string
  logoUrl: string | null
  score: number
}

interface ActiveNotif extends NotifyPayload {
  id: number
  exiting: boolean
}

// ── Dominant-colour extraction ────────────────────────────────────────────
function extractDominantColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 64
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve('')
        canvas.width = size
        canvas.height = size
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data

        const edgePixels: { r: number; g: number; b: number }[] = []

        const getPixel = (x: number, y: number) => {
          const idx = (y * size + x) * 4
          return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] }
        }

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const p = getPixel(x, y)
            if (p.a > 50) { edgePixels.push(p); break }
          }
          for (let x = size - 1; x >= 0; x--) {
            const p = getPixel(x, y)
            if (p.a > 50) { edgePixels.push(p); break }
          }
        }
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            const p = getPixel(x, y)
            if (p.a > 50) { edgePixels.push(p); break }
          }
          for (let y = size - 1; y >= 0; y--) {
            const p = getPixel(x, y)
            if (p.a > 50) { edgePixels.push(p); break }
          }
        }

        let bestColor = ''
        let maxSaturation = -1
        let sumR = 0, sumG = 0, sumB = 0, validCount = 0

        for (const p of edgePixels) {
          const { r, g, b } = p
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const delta = max - min
          const sat = max === 0 ? 0 : delta / max
          const brightness = (r * 299 + g * 587 + b * 114) / 1000
          if (brightness >= 15 && brightness <= 245) {
            if (sat > maxSaturation) { maxSaturation = sat; bestColor = `rgb(${r}, ${g}, ${b})` }
            sumR += r; sumG += g; sumB += b; validCount++
          }
        }

        if (bestColor && maxSaturation > 0.05) resolve(bestColor)
        else if (validCount > 0) resolve(`rgb(${Math.round(sumR / validCount)}, ${Math.round(sumG / validCount)}, ${Math.round(sumB / validCount)})`)
        else if (edgePixels.length > 0) resolve(`rgb(${Math.round(edgePixels.reduce((a, p) => a + p.r, 0) / edgePixels.length)}, ${Math.round(edgePixels.reduce((a, p) => a + p.g, 0) / edgePixels.length)}, ${Math.round(edgePixels.reduce((a, p) => a + p.b, 0) / edgePixels.length)})`)
        else resolve('')
      } catch { resolve('') }
    }
    img.onerror = () => resolve('')
    img.src = `/api/proxy-image?url=${encodeURIComponent(imgSrc)}`
  })
}


// ── Component ─────────────────────────────────────────────────────────────
export default function ProjectorPage() {
  const [data, setData] = useState<Record<string, LeaderboardItem[]>>({})
  const [maxScores, setMaxScores] = useState<Record<string, number>>({})
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [forcedSubject, setForcedSubject] = useState<Subject | 'auto'>('auto')
  const [logoColors, setLogoColors] = useState<Record<string, string>>({})
  const [notifications, setNotifications] = useState<ActiveNotif[]>([])
  const pollRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const rotationRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const notifIdRef = useRef(0)

  const fetchData = useCallback(async (t: string) => {
    const res = await fetch('/api/admin/projector', { headers: { 'x-admin-token': t } })
    if (res.ok) {
      const json = await res.json()
      setData(json.leaderboards)
      if (json.activeSubject) setForcedSubject(json.activeSubject)
      if (json.maxScores) setMaxScores(json.maxScores)
      if (json.questionCounts) setQuestionCounts(json.questionCounts)
    }
  }, [])

  // ── Leaderboard polling + Supabase realtime ──────────────────────────────
  useEffect(() => {
    const t = sessionStorage.getItem('admin_token') || ''
    fetchData(t)

    pollRef.current = setInterval(() => fetchData(t), 2000)
    rotationRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % SUBJECTS.length)
    }, 10000)

    const ch = supabase
      .channel('projector-live-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions' }, () => fetchData(t))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_state' }, () => fetchData(t))
      .subscribe()

    return () => {
      clearInterval(pollRef.current)
      clearInterval(rotationRef.current)
      ch.unsubscribe()
      supabase.removeChannel(ch)
    }
  }, [fetchData])

  // ── Notification via Supabase Realtime broadcast ─────────────────────────
  useEffect(() => {
    function dismiss(id: number) {
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, exiting: true } : n)
      )
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, 280)
    }

    function push(payload: NotifyPayload) {
      if (payload.type === 'streak_lost') {
        setNotifications(prev => {
          const matching = prev.find(n => n.schoolName === payload.schoolName && !n.exiting)
          if (!matching) return prev
          setTimeout(() => {
            setNotifications(p => p.filter(n => n.id !== matching.id))
          }, 280)
          return prev.map(n => n.id === matching.id ? { ...n, exiting: true } : n)
        })
        return
      }

      const id = ++notifIdRef.current
      const notif: ActiveNotif = { ...payload, id, exiting: false }

      // Transient notifications dismiss after 4.5s
      if (payload.type === 'overtake' || payload.type === 'fast' || payload.type === 'first') {
        setTimeout(() => dismiss(id), 4500)
      }

      setNotifications(prev => {
        if (payload.type === 'streak' || payload.type === 'comeback') {
          const existingIndex = prev.findIndex(n => n.schoolName === payload.schoolName && !n.exiting)
          if (existingIndex !== -1) {
            const updated = [...prev]
            updated[existingIndex] = { ...updated[existingIndex], count: payload.count, type: payload.type }
            return updated
          }
        }
        const next = [...prev, notif]
        return next.length > MAX_NOTIFS ? next.slice(next.length - MAX_NOTIFS) : next
      })
    }

    // Supabase Realtime broadcast — works reliably on Vercel serverless
    const notifCh = supabase
      .channel('projector-live-notifications')
      .on('broadcast', { event: 'notification' }, (eventPayload: any) => {
        if (eventPayload?.payload) push(eventPayload.payload)
      })
      .subscribe()

    return () => {
      notifCh.unsubscribe()
      supabase.removeChannel(notifCh)
    }
  }, [])

  // ── Extract logo colours ──────────────────────────────────────────────────
  useEffect(() => {
    for (const sub of SUBJECTS) {
      const items = data[sub] || []
      for (const item of items) {
        if (item.logoUrl && !logoColors[item.logoUrl]) {
          extractDominantColor(item.logoUrl).then(col => {
            if (col) setLogoColors(prev => ({ ...prev, [item.logoUrl!]: col }))
          })
        }
      }
    }
  }, [data])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* Main Stage */}
      <div className={styles.stageArea}>
        {SUBJECTS.map((sub, index) => {
          if (forcedSubject !== 'auto' && sub !== forcedSubject) return null
          if (forcedSubject === 'auto' && index !== activeIndex) return null

          const cfg = SUBJECT_CONFIG[sub]
          const items = (data[sub] || []).slice(0, 6)

          return (
            <div
              key={`${sub}-${forcedSubject === 'auto' ? activeIndex : 'forced'}`}
              className={`${styles.quadrant} ${styles.fadeEnter}`}
              style={{ '--col': cfg.color, '--glow': cfg.glow } as React.CSSProperties}
            >
              <div className={styles.header}>
                <div className={styles.icon}><SubjectIcon subject={sub} /></div>
                <div className={styles.title}>{cfg.label}</div>
              </div>

              {(() => {
                const count = questionCounts[sub] || maxScores[sub] || 0
                const highestInRoom = items.length > 0 ? Math.max(...items.map(i => i.score)) : 0
                const maxScore = count > 0 ? count : Math.max(highestInRoom, 1)
                const ySteps = [1, 0.75, 0.5, 0.25, 0]

                return (
                  <div className={styles.chartStage}>
                    {/* Y-Axis Ticks */}
                    <div className={styles.yAxisArea}>
                      {count > 0 && ySteps.map((fraction) => {
                        const tickValue = Math.round(maxScore * fraction)
                        return (
                          <div key={fraction} className={styles.yAxisTick}>
                            <div className={styles.yAxisLabel}>{tickValue}</div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Bars Container */}
                    <div className={styles.chartContainer}>
                      {items.length === 0 ? (
                        <div className={styles.empty}>Waiting for contestants...</div>
                      ) : (
                        items.map((item, i) => {
                          const heightPercent = Math.min(100, Math.max((item.score / maxScore) * 100, 10))
                          const schoolColor = (item.logoUrl && logoColors[item.logoUrl])
                            ? logoColors[item.logoUrl]
                            : 'var(--col)'

                          return (
                            <div
                              key={item.sessionId || i}
                              className={styles.barWrapper}
                              style={{ animationDelay: `${i * 0.1}s`, '--col': schoolColor } as React.CSSProperties}
                            >
                              <div className={styles.barScore} style={{ color: schoolColor }}>{item.score}</div>
                              <div
                                className={styles.barFill}
                                style={{ height: `${heightPercent}%`, background: schoolColor, '--col': schoolColor } as React.CSSProperties}
                              >
                                <div className={styles.barLogoWrapper}>
                                  {item.logoUrl ? (
                                    <img src={item.logoUrl} alt={item.schoolName} className={styles.barLogo} />
                                  ) : (
                                    <School size={22} className={styles.barLogoFallbackIcon} />
                                  )}
                                </div>
                              </div>
                              <div className={styles.barLabel}>
                                <div className={styles.memberName} title={item.memberName}>{item.memberName}</div>
                                <div className={styles.schoolName} title={item.schoolName}>{item.schoolName}</div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Notification overlay — top right */}
      {notifications.length > 0 && (
        <div className={styles.notifOverlay}>
          {notifications.map(n => (
            <div
              key={n.id}
              className={[
                styles.notifCard,
                styles[n.type],
                n.exiting ? styles.exiting : '',
              ].join(' ')}
            >
              <span className={styles.notifSchool}>{n.schoolName}</span>
              <span className={styles.notifText}>
                {n.type === 'streak' && (
                  <>
                    is on streak
                    <span key={n.count} className={styles.notifCount}>{'\u00D7'}{n.count}</span>
                  </>
                )}
                {n.type === 'comeback' && (
                  <>
                    is making a comeback
                    <span key={n.count} className={styles.notifCount}>{'\u00D7'}{n.count}</span>
                  </>
                )}
                {n.type === 'overtake' && (
                  <>
                    just took the
                    <span key={n.count} className={styles.notifCount}>#1</span>
                    spot!
                  </>
                )}
                {n.type === 'fast' && (
                  <>
                    lightning answer in
                    <span key={n.count} className={styles.notifCount}>{n.count}</span>
                  </>
                )}
                {n.type === 'first' && (
                  <>
                    was
                    <span key={n.count} className={styles.notifCount}>1st</span>
                    to answer correctly!
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
