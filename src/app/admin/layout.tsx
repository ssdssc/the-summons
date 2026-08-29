'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, AlertTriangle } from 'lucide-react'
import PresenceFooter from './components/PresenceFooter'
import styles from './layout.module.css'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('admin_token')
    if (token) {
      fetch('/api/admin/quizzes', {
        headers: { 'x-admin-token': token },
      }).then(res => {
        if (res.ok) {
          setAuthed(true)
        } else {
          sessionStorage.removeItem('admin_token')
        }
        setIsInitializing(false)
      }).catch(() => setIsInitializing(false))
    } else {
      setIsInitializing(false)
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Test the password by calling an admin endpoint
    const res = await fetch('/api/admin/quizzes', {
      headers: { 'x-admin-token': password },
    })

    if (res.ok) {
      // Store token in sessionStorage for subsequent requests
      sessionStorage.setItem('admin_token', password)
      setAuthed(true)
    } else {
      setError('Invalid admin password. Try again.')
    }
    setLoading(false)
  }

  const isProjector = pathname?.startsWith('/admin/projector')

  if (isProjector) {
    return <>{children}</>
  }

  if (isInitializing) {
    return (
      <div className={styles.loginWrap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="bg-grid" />
        <span className={styles.spinner} style={{ width: 24, height: 24, borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!authed) {
    return (
      <div className={styles.loginWrap}>
        <div className="bg-grid" />
        <div className="bg-radial" />
        <div className={`${styles.loginCard} anim-scale-in`}>
          <div className={styles.loginBranding}>
            <div className={styles.loginLock}><Lock size={32} /></div>
            <h1 className={styles.loginTitle}>Admin Access</h1>
            <p className={styles.loginSub}>Evolvion '26 · THE SUMMONS</p>
          </div>
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <input
              type="password"
              className="input"
              placeholder="Enter admin password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoFocus
            />
            {error && <div className={styles.loginError}><AlertTriangle size={13} /> {error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading || !password}>
              {loading ? <span className={styles.spinner} /> : 'Enter Command Centre →'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
      <PresenceFooter />
    </div>
  )
}
