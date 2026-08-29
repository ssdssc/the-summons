import { useState, useEffect } from 'react'
import { Monitor, RefreshCw } from 'lucide-react'
import { SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from './SubjectIcon'
import { Card } from '@/components/ui/card'

const SUBJECTS: Subject[] = ['biology', 'chemistry', 'physics', 'maths']

export default function ProjectorControl({ token }: { token: string }) {
  const [activeSubject, setActiveSubject] = useState<Subject | 'auto'>('auto')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchState() {
      if (!token) return
      const res = await fetch('/api/admin/projector', { headers: { 'x-admin-token': token } })
      if (res.ok) {
        const data = await res.json()
        if (data.activeSubject) setActiveSubject(data.activeSubject)
      }
    }
    fetchState()
  }, [token])

  async function setProjector(subject: Subject | 'auto') {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/projector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ subject })
      })
      if (res.ok) {
        setActiveSubject(subject)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-3.5 flex flex-wrap items-center gap-3 bg-[#0f0f0f] border-white/5 animate-in fade-in rounded-xl">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Monitor size={16} />
        <h3 className="text-xs font-semibold uppercase tracking-wider">Projector</h3>
      </div>
      
      <div className={`flex flex-wrap gap-1.5 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
        <button
          onClick={() => setProjector('auto')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
            activeSubject === 'auto' 
              ? 'bg-white/10 border-white/20 text-white' 
              : 'bg-transparent border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
          }`}
        >
          <RefreshCw size={12} /> Auto
        </button>

        {SUBJECTS.map(sub => {
          const cfg = SUBJECT_CONFIG[sub]
          const isActive = activeSubject === sub
          return (
            <button
              key={sub}
              onClick={() => setProjector(sub)}
              style={{
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-3)',
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                !isActive && 'hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <SubjectIcon subject={sub} /> {cfg.label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
