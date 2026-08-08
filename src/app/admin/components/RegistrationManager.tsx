'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  School, Plus, Trash2, ChevronDown, ChevronRight,
  Copy, Check, Pencil, Users, Zap, X, Upload,
} from 'lucide-react'
import ImageUploader from './ImageUploader'
import styles from './RegistrationManager.module.css'

interface Props { token: string }

interface Registration {
  id: string
  school_name: string
  contact_email: string
  logo_url: string | null
  status: string
  registered_at: string
  members: [{ count: number }]
}

interface Member {
  id: string
  name: string
  subject: string
  is_captain: boolean
  access_code: string
  registration_id: string
}

const SUBJECTS = ['biology', 'chemistry', 'physics', 'maths'] as const
const SUBJECT_LABELS: Record<string, string> = {
  biology: 'Biology', chemistry: 'Chemistry', physics: 'Physics', maths: 'Maths',
}
const SUBJECT_CODES: Record<string, string> = {
  biology: 'BIO', chemistry: 'CHE', physics: 'PHY', maths: 'MAT',
}

const EMPTY_SCHOOL = { schoolName: '', contactEmail: '', logoUrl: '' }
const EMPTY_MEMBER = { name: '', subject: 'biology', isCaptain: false }

export default function RegistrationManager({ token }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [members, setMembers] = useState<Record<string, Member[]>>({})
  const [membersLoading, setMembersLoading] = useState<Record<string, boolean>>({})

  // Forms
  const [showAddSchool, setShowAddSchool] = useState(false)
  const [schoolForm, setSchoolForm] = useState(EMPTY_SCHOOL)
  const [schoolSaving, setSchoolSaving] = useState(false)

  const [addingMemberFor, setAddingMemberFor] = useState<string | null>(null)
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER)
  const [memberSaving, setMemberSaving] = useState(false)

  // Edit school logo
  const [editLogoFor, setEditLogoFor] = useState<string | null>(null)

  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  function toast(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const loadRegistrations = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/registrations', { headers: { 'x-admin-token': token } })
    const json = await res.json()
    setRegistrations(json.registrations ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => { loadRegistrations() }, [loadRegistrations])

  async function loadMembers(registrationId: string) {
    setMembersLoading(p => ({ ...p, [registrationId]: true }))
    const res = await fetch(`/api/admin/members?registrationId=${registrationId}`, { headers: { 'x-admin-token': token } })
    const json = await res.json()
    setMembers(p => ({ ...p, [registrationId]: json.members ?? [] }))
    setMembersLoading(p => ({ ...p, [registrationId]: false }))
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      if (!members[id]) loadMembers(id)
    }
    setAddingMemberFor(null)
  }

  async function addSchool() {
    if (!schoolForm.schoolName.trim()) return
    setSchoolSaving(true)
    const res = await fetch('/api/admin/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ schoolName: schoolForm.schoolName, contactEmail: schoolForm.contactEmail, logoUrl: schoolForm.logoUrl || null }),
    })
    setSchoolSaving(false)
    if (res.ok) {
      toast('✓ School added')
      setSchoolForm(EMPTY_SCHOOL)
      setShowAddSchool(false)
      loadRegistrations()
    }
  }

  async function deleteSchool(id: string) {
    if (!confirm('Delete this school and ALL its members? This cannot be undone.')) return
    await fetch(`/api/admin/registrations?id=${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } })
    toast('School deleted')
    setExpandedId(null)
    loadRegistrations()
  }

  async function addMember(registrationId: string) {
    if (!memberForm.name.trim()) return
    setMemberSaving(true)
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ registrationId, ...memberForm }),
    })
    const json = await res.json()
    setMemberSaving(false)
    if (res.ok) {
      toast(`✓ Added ${json.member.name} — code: ${json.member.access_code}`)
      setMemberForm(EMPTY_MEMBER)
      setAddingMemberFor(null)
      loadMembers(registrationId)
      loadRegistrations()
    }
  }

  async function deleteMember(memberId: string, registrationId: string) {
    if (!confirm('Delete this member?')) return
    await fetch(`/api/admin/members?id=${memberId}`, { method: 'DELETE', headers: { 'x-admin-token': token } })
    toast('Member deleted')
    loadMembers(registrationId)
    loadRegistrations()
  }

  async function saveLogo(registrationId: string, logoUrl: string | null) {
    await fetch('/api/admin/registrations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ id: registrationId, logoUrl }),
    })
    setRegistrations(prev => prev.map(r => r.id === registrationId ? { ...r, logo_url: logoUrl } : r))
    setEditLogoFor(null)
    toast('✓ Logo updated')
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const totalMembers = registrations.reduce((s, r) => s + (r.members?.[0]?.count ?? 0), 0)

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <School size={18} />
          <span className={styles.headerTitle}>School Registrations</span>
          <span className={styles.count}>{registrations.length} schools · {totalMembers} members</span>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 13 }}
          onClick={() => { setShowAddSchool(v => !v); }}>
          {showAddSchool ? <X size={15} /> : <Plus size={15} />}
          {showAddSchool ? 'Cancel' : 'Add School'}
        </button>
      </div>

      {msg && <div className={`${styles.toast} anim-fade-in`}>{msg}</div>}

      {/* Add School Form */}
      {showAddSchool && (
        <div className={`${styles.addSchoolForm} anim-fade-in`}>
          <h4 className={styles.formTitle}>New School Registration</h4>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.label}>School Name *</label>
              <input className="input" value={schoolForm.schoolName} onChange={e => setSchoolForm(f => ({ ...f, schoolName: e.target.value }))} placeholder="e.g. D.S. Senanayake College" />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Contact Email</label>
              <input className="input" type="email" value={schoolForm.contactEmail} onChange={e => setSchoolForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="principal@school.lk" />
            </div>
            <div className={styles.formField} style={{ gridColumn: '1 / -1' }}>
              <label className={styles.label}>School Logo (optional)</label>
              <ImageUploader
                value={schoolForm.logoUrl || null}
                onChange={url => setSchoolForm(f => ({ ...f, logoUrl: url ?? '' }))}
                adminToken={token}
              />
            </div>
          </div>
          <div className={styles.formFooter}>
            <button className="btn btn-ghost" onClick={() => setShowAddSchool(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={addSchool} disabled={schoolSaving || !schoolForm.schoolName.trim()}>
              {schoolSaving ? 'Saving...' : 'Register School'}
            </button>
          </div>
        </div>
      )}

      {/* Registrations list */}
      <div className={styles.list}>
        {loading ? (
          <div className={styles.loadingState}><div className={styles.loader} />Loading...</div>
        ) : registrations.length === 0 ? (
          <div className={styles.emptyState}>
            <School size={40} style={{ opacity: 0.3 }} />
            <p>No schools registered yet.</p>
            <button className="btn btn-primary" onClick={() => setShowAddSchool(true)}>Register First School</button>
          </div>
        ) : (
          registrations.map(reg => {
            const isExpanded = expandedId === reg.id
            const memberCount = reg.members?.[0]?.count ?? 0
            const schoolMembers = members[reg.id] ?? []
            const isLoadingMembers = membersLoading[reg.id]

            return (
              <div key={reg.id} className={`${styles.schoolCard} ${isExpanded ? styles.schoolCardExpanded : ''}`}>
                {/* School row */}
                <div className={styles.schoolRow} onClick={() => toggleExpand(reg.id)}>
                  <div className={`${styles.schoolAvatar} ${reg.logo_url ? styles.schoolAvatarLogo : ''}`}>
                    {reg.logo_url
                      ? <img src={reg.logo_url} alt={reg.school_name} className={styles.schoolLogo} />
                      : <span>{reg.school_name.charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  <div className={styles.schoolInfo}>
                    <div className={styles.schoolName}>{reg.school_name}</div>
                    {reg.contact_email && <div className={styles.schoolEmail}>{reg.contact_email}</div>}
                  </div>
                  <div className={styles.schoolMeta}>
                    <span className={styles.memberBadge}><Users size={12} />{memberCount} members</span>
                  </div>
                  <div className={styles.schoolActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} title="Edit logo" onClick={() => setEditLogoFor(editLogoFor === reg.id ? null : reg.id)}>
                      <Pencil size={14} />
                    </button>
                    <button className={styles.iconBtn} title="Delete school" style={{ color: '#ff6b6b' }} onClick={() => deleteSchool(reg.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className={styles.chevron}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>

                {/* Logo editor */}
                {editLogoFor === reg.id && (
                  <div className={`${styles.logoEditor} anim-fade-in`} onClick={e => e.stopPropagation()}>
                    <label className={styles.label}>Update School Logo</label>
                    <ImageUploader
                      value={reg.logo_url}
                      onChange={url => saveLogo(reg.id, url)}
                      adminToken={token}
                    />
                  </div>
                )}

                {/* Members panel */}
                {isExpanded && (
                  <div className={styles.membersPanel}>
                    <div className={styles.membersPanelHeader}>
                      <span className={styles.membersPanelTitle}>Members</span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '5px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: '5px' }}
                        onClick={e => { e.stopPropagation(); setAddingMemberFor(addingMemberFor === reg.id ? null : reg.id); setMemberForm(EMPTY_MEMBER) }}
                      >
                        <Plus size={13} /> Add Member
                      </button>
                    </div>

                    {/* Add member form */}
                    {addingMemberFor === reg.id && (
                      <div className={`${styles.addMemberForm} anim-fade-in`}>
                        <div className={styles.memberFormRow}>
                          <input className="input" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                          <select className="input" value={memberForm.subject} onChange={e => setMemberForm(f => ({ ...f, subject: e.target.value }))}>
                            {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
                          </select>
                          <label className={styles.captainToggle}>
                            <input type="checkbox" checked={memberForm.isCaptain} onChange={e => setMemberForm(f => ({ ...f, isCaptain: e.target.checked }))} />
                            <Zap size={13} /> Captain
                          </label>
                          <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => addMember(reg.id)} disabled={memberSaving || !memberForm.name.trim()}>
                            {memberSaving ? '...' : 'Add'}
                          </button>
                          <button className={styles.iconBtn} onClick={() => setAddingMemberFor(null)}><X size={15} /></button>
                        </div>
                      </div>
                    )}

                    {/* Member list */}
                    {isLoadingMembers ? (
                      <div className={styles.loadingState}><div className={styles.loader} />Loading members...</div>
                    ) : schoolMembers.length === 0 ? (
                      <p className={styles.noMembers}>No members yet. Add the first one above.</p>
                    ) : (
                      <div className={styles.memberList}>
                        {schoolMembers.map(m => (
                          <div key={m.id} className={styles.memberRow}>
                            <div className={styles.memberSubjectPill} data-subject={m.subject}>
                              {SUBJECT_CODES[m.subject]}
                            </div>
                            <div className={styles.memberName}>
                              {m.name}
                              {m.is_captain && <span className={styles.captainTag}><Zap size={10} />Captain</span>}
                            </div>
                            <div className={styles.accessCodeWrap}>
                              <code className={styles.accessCode}>{m.access_code}</code>
                              <button
                                className={styles.copyBtn}
                                onClick={() => copyCode(m.access_code)}
                                title="Copy code"
                              >
                                {copiedCode === m.access_code ? <Check size={13} /> : <Copy size={13} />}
                              </button>
                            </div>
                            <button className={styles.iconBtn} style={{ color: '#ff6b6b' }} onClick={() => deleteMember(m.id, reg.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
