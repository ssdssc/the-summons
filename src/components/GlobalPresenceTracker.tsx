'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GlobalPresenceTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return

    let type: 'admin' | 'user' | 'visitor' = 'visitor'
    if (pathname.startsWith('/admin')) {
      type = 'admin'
    } else if (pathname.startsWith('/summons')) {
      type = 'user'
    }

    const channel = supabase.channel('global-presence', {
      config: {
        presence: {
          key: Math.random().toString(36).substring(2, 10), // Random session ID per load
        },
      },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      let admin = 0, user = 0, visitor = 0
      for (const id in state) {
        const presences = state[id] as any[]
        for (const p of presences) {
          if (p.type === 'admin') admin++
          else if (p.type === 'user') user++
          else visitor++
        }
      }
      if (typeof window !== 'undefined') {
        const detail = { admin, user, visitor }
        ;(window as any)._latestPresence = detail
        window.dispatchEvent(new CustomEvent('presence-sync', { detail }))
      }
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ type })
      }
    })

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [pathname])

  return null
}
