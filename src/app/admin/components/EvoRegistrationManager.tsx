'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  School, Trash2, ChevronDown, ChevronRight,
  CheckCircle, Clock, Zap, Shield, User, Users, RefreshCw
} from 'lucide-react'
import styles from './RegistrationManager.module.css'

interface Props { token: string }

interface EvoRegistration {
  id: string
  created_at: string
  school_name: string
  email: string
  president_name: string
  president_contact: string
  mic_name: string | null
  mic_contact: string | null
  captain_name: string
  captain_contact: string
  captain_subject: string
  member1_name: string
  member1_subject: string
  member2_name: string
  member2_subject: string
  member3_name: string
  member3_subject: string
  confirmed: boolean
}

const SUBJECT_CODES: Record<string, string> = {
  biology: 'BIO', chemistry: 'CHE', physics: 'PHY', maths: 'MAT', 'combined maths': 'MAT'
}

export default function EvoRegistrationManager({ token }: Props) {
  const [registrations, setRegistrations] = useState<EvoRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  function toast(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const loadRegistrations = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const res = await fetch('/api/admin/web-registrations', { headers: { 'x-admin-token': token } })
    const json = await res.json()
    setRegistrations(json.registrations ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => { loadRegistrations(false) }, [loadRegistrations])

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  async function deleteRegistration(id: string) {
    if (!confirm('Delete this raw registration? This cannot be undone.')) return
    await fetch(`/api/admin/web-registrations?id=${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } })
    toast('Registration deleted')
    setExpandedId(null)
    loadRegistrations(true)
  }

  async function confirmRegistration(id: string) {
    if (!confirm('Confirming will officially enroll them and generate access codes. Proceed?')) return
    setConfirmingId(id)
    const res = await fetch('/api/admin/web-registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ id })
    })
    setConfirmingId(null)
    if (res.ok) {
      toast('✓ Successfully confirmed & codes generated!')
      loadRegistrations(true)
    } else {
      const err = await res.json()
      toast(`Error: ${err.error}`)
    }
  }

  const pendingRegistrations = registrations.filter(r => !r.confirmed)

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <School size={18} />
          <span className={styles.headerTitle}>Pending Signups</span>
          <span className={styles.count}>{pendingRegistrations.length} submissions</span>
        </div>
        <button 
          className="btn btn-outline" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 13 }}
          onClick={() => loadRegistrations(true)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'anim-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {msg && <div className={`${styles.toast} anim-fade-in`}>{msg}</div>}

      <div className={styles.list}>
        {loading && pendingRegistrations.length === 0 ? (
          <div className={styles.loadingState}><div className={styles.loader} />Loading signups...</div>
        ) : pendingRegistrations.length === 0 ? (
          <div className={styles.emptyState}>
            <CheckCircle size={40} style={{ opacity: 0.3 }} />
            <p>No pending signups. You are all caught up!</p>
          </div>
        ) : (
          pendingRegistrations.map(reg => {
            const isExpanded = expandedId === reg.id

            return (
              <div key={reg.id} className={`${styles.schoolCard} ${isExpanded ? styles.schoolCardExpanded : ''}`}>
                {/* School row */}
                <div className={styles.schoolRow} onClick={() => toggleExpand(reg.id)}>
                  <div className={styles.schoolAvatar}>
                    <span>{reg.school_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className={styles.schoolInfo}>
                    <div className={styles.schoolName}>{reg.school_name}</div>
                    <div className={styles.schoolEmail}>{reg.email}</div>
                  </div>
                  <div className={styles.schoolMeta}>
                    <span className={styles.memberBadge} style={{ color: 'var(--amber)', background: 'rgba(255,170,0,0.1)' }}>
                      <Clock size={12} /> Pending
                    </span>
                  </div>
                  <div className={styles.schoolActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} style={{ color: '#ff6b6b' }} onClick={() => deleteRegistration(reg.id)} title="Delete signup">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className={styles.chevron}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>

                {/* Details Panel */}
                {isExpanded && (
                  <div className={styles.membersPanel}>
                    {/* Action Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,255,100,0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0,255,100,0.1)', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <div style={{ color: '#00ff88', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle size={15} /> Ready to Confirm Registration
                          </div>
                          <div style={{ color: 'var(--text-3)', fontSize: '12px', marginTop: '4px' }}>
                            This will generate secure access codes for all 4 members and enroll them into the live quiz system.
                          </div>
                        </div>
                        <button 
                          className="btn btn-primary"
                          style={{ background: '#00cc6a', color: '#000', fontWeight: 'bold' }}
                          onClick={() => confirmRegistration(reg.id)}
                          disabled={confirmingId === reg.id}
                        >
                          {confirmingId === reg.id ? 'Confirming...' : 'Confirm & Generate Codes'}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                        <Shield size={16} style={{ color: 'var(--text-3)', marginTop: '2px' }} />
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-3)', marginBottom: '2px', fontWeight: 'bold' }}>President</div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-1)' }}>{reg.president_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{reg.president_contact}</div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                        <User size={16} style={{ color: 'var(--text-3)', marginTop: '2px' }} />
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-3)', marginBottom: '2px', fontWeight: 'bold' }}>MIC</div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-1)' }}>{reg.mic_name || '—'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{reg.mic_contact || '—'}</div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.membersPanelHeader}>
                      <span className={styles.membersPanelTitle} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} /> Quiz Squad (4 Members)
                      </span>
                    </div>

                    <div className={styles.memberList}>
                      {[
                        { name: reg.captain_name, sub: reg.captain_subject, contact: reg.captain_contact, isCaptain: true },
                        { name: reg.member1_name, sub: reg.member1_subject },
                        { name: reg.member2_name, sub: reg.member2_subject },
                        { name: reg.member3_name, sub: reg.member3_subject }
                      ].map((member, i) => {
                        const subjCode = SUBJECT_CODES[(member.sub || '').toLowerCase()] || (member.sub || '').toUpperCase().slice(0,3)
                        const rawSubj = (member.sub || '').toLowerCase()
                        
                        return (
                          <div key={i} className={styles.memberRow} style={{ padding: '12px', border: '1px solid var(--border)', background: 'var(--bg-2)', borderRadius: '8px' }}>
                            <div className={styles.memberSubjectPill} data-subject={rawSubj}>
                              {subjCode}
                            </div>
                            <div className={styles.memberName} style={{ flex: 1 }}>
                              {member.name}
                              {member.isCaptain && <span className={styles.captainTag}><Zap size={10} />Captain</span>}
                              {member.contact && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{member.contact}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
