import { Dna, FlaskConical, Atom, Sigma } from 'lucide-react'
import type { Subject } from '@/lib/supabase'

export const SubjectIcon = ({ subject, size = 18 }: { subject: Subject, size?: number }) => {
  if (subject === 'biology') return <Dna size={size} />
  if (subject === 'chemistry') return <FlaskConical size={size} />
  if (subject === 'physics') return <Atom size={size} />
  if (subject === 'maths') return <Sigma size={size} />
  return null
}
