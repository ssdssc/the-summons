'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export default function PresenceFooter() {
  const [counts, setCounts] = useState({ admin: 0, user: 0, visitor: 0 })
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    // Grab the latest presence if it was dispatched before this component mounted
    if (typeof window !== 'undefined' && (window as any)._latestPresence) {
      setCounts((window as any)._latestPresence)
    }

    const handler = (e: any) => {
      setCounts(e.detail)
    }
    window.addEventListener('presence-sync', handler)

    const updateClock = () => {
      const now = new Date()
      const datePart = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const timePart = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      setTimeStr(`${datePart} · ${timePart}`)
    }

    updateClock()
    const timer = setInterval(updateClock, 1000)

    return () => {
      window.removeEventListener('presence-sync', handler)
      clearInterval(timer)
    }
  }, [])

  return (
    <footer style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 32px',
      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      fontSize: '12px',
      fontWeight: 500,
      color: 'var(--text-3)',
      marginTop: 'auto',
      background: 'rgba(10, 10, 10, 0.8)',
      backdropFilter: 'blur(8px)',
      userSelect: 'none'
    }}>
      {/* Left side empty balancer */}
      <div style={{ flex: 1 }} />

      {/* Center Presence Metrics */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)' }} />
          <span style={{ color: 'var(--text)' }}>{counts.user}</span> <span style={{ color: 'var(--text-3)' }}>Summons Users</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#a855f7' }} />
          <span style={{ color: 'var(--text)' }}>{counts.admin}</span> <span style={{ color: 'var(--text-3)' }}>Admins</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)' }} />
          <span style={{ color: 'var(--text)' }}>{counts.visitor}</span> <span style={{ color: 'var(--text-3)' }}>Visitors</span>
        </div>
      </div>

      {/* Right side live clock with SVG */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '7px',
        color: 'var(--text-3)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        fontSize: '11px',
        fontFamily: 'monospace'
      }}>
        <Clock size={12} style={{ opacity: 0.7 }} />
        <span>{timeStr}</span>
      </div>
    </footer>
  )
}
