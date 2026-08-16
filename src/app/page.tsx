'use client'

import { useState, useEffect, useRef } from 'react'
import styles from './page.module.css'

const TARGET = new Date('2026-08-30T00:00:00+05:30')

interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
}

function getCountdown(): Countdown {
  const diff = TARGET.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    expired: false,
  }
}

export default function LandingPage() {
  const [cd, setCd] = useState<Countdown | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  // Countdown
  useEffect(() => {
    setCd(getCountdown())
    const id = setInterval(() => setCd(getCountdown()), 1000)
    return () => clearInterval(id)
  }, [])

  // Particle canvas
  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current   // non-null after guard
    const ctx = canvas.getContext('2d')!
    let W = 0, H = 0

    interface Pt { x: number; y: number; r: number; alpha: number; vy: number; vx: number }
    const pts: Pt[] = []

    function resize() {
      W = canvas.width = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function mkPt(): Pt {
      return {
        x: Math.random() * W,
        y: H + Math.random() * 20,
        r: Math.random() * 1.4 + 0.3,
        alpha: Math.random() * 0.35 + 0.05,
        vy: Math.random() * 0.3 + 0.08,
        vx: (Math.random() - 0.5) * 0.18,
      }
    }

    for (let i = 0; i < 55; i++) {
      const p = mkPt()
      p.y = Math.random() * H
      pts.push(p)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      pts.forEach(p => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,163,245,${p.alpha})`
        ctx.fill()
        p.y -= p.vy
        p.x += p.vx
        p.alpha -= 0.00025
        if (p.y < -5 || p.alpha <= 0) Object.assign(p, mkPt())
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className={styles.landing}>
      <canvas ref={canvasRef} className={styles.particles} />

      {/* Ambient glow */}
      <div className={styles.ambientGlow} />

      <div className={styles.page}>
        {/* Ornament */}
        <div className={styles.ornament}>
          <div className={styles.ornamentLine} />
          <div className={styles.ornamentDot} />
          <div className={styles.ornamentLine} />
        </div>

        <p className={styles.label}>Science Society of D.S. Senanayake College</p>

        <img
          src="https://ssdssc.com/evo/images/D2Dx5MiGs4RJlRrYE8cPIlUer1g.png"
          alt="Summons Logo"
          className={styles.logo}
        />

        <h1 className={styles.title}>Summons</h1>
        <p className={styles.byLine}>by SSDSSC</p>

        <div className={styles.vDivider} />

        {cd && (
          <div className={styles.countdown} aria-label="Countdown to August 30 online rounds">
            <div className={styles.cdUnit}>
              <div className={styles.cdBox}>
                <span className={styles.cdNum}>{cd.expired ? '00' : pad(cd.days)}</span>
              </div>
              <span className={styles.cdLbl}>Days</span>
            </div>
            <span className={styles.cdSep}>:</span>
            <div className={styles.cdUnit}>
              <div className={styles.cdBox}>
                <span className={styles.cdNum}>{cd.expired ? '00' : pad(cd.hours)}</span>
              </div>
              <span className={styles.cdLbl}>Hours</span>
            </div>
            <span className={styles.cdSep}>:</span>
            <div className={styles.cdUnit}>
              <div className={styles.cdBox}>
                <span className={styles.cdNum}>{cd.expired ? '00' : pad(cd.minutes)}</span>
              </div>
              <span className={styles.cdLbl}>Mins</span>
            </div>
            <span className={styles.cdSep}>:</span>
            <div className={styles.cdUnit}>
              <div className={styles.cdBox}>
                <span className={styles.cdNum}>{cd.expired ? '00' : pad(cd.seconds)}</span>
              </div>
              <span className={styles.cdLbl}>Secs</span>
            </div>
          </div>
        )}

        <div className={styles.dateBox}>
          <p className={styles.evtLbl}>Online Rounds Begin</p>
          <div className={styles.divot} />
          <p className={styles.evtDate}>August 30, 2026</p>
        </div>

        <p className={styles.desc}>
          Summons is currently being prepared.<br />
          Online rounds open on <strong>August 30, 2026</strong>.<br />
          Check back then to register and compete.
        </p>

        <a href="/summons" className={styles.btnBack} id="go-to-portal">
          Go to Registration
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5.5 2.5L10 7L5.5 11.5" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <footer className={styles.footer}>© 2026 SSDSSC · All Rights Reserved</footer>
    </div>
  )
}
