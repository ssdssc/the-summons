import type { Metadata } from 'next'
import GlobalPresenceTracker from '@/components/GlobalPresenceTracker'
import './globals.css'

export const metadata: Metadata = {
  title: 'THE SUMMONS — Evolvion \'26 | SSDSSC',
  description: 'Online quiz platform for Evolvion \'26 — Phase 01: THE SUMMONS. Organized by the Science Society of D.S. Senanayake College.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <GlobalPresenceTracker />
        {children}
      </body>
    </html>
  )
}
