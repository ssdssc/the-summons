'use client'

import { useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import styles from './layout.module.css'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return <>{children}</>
}
