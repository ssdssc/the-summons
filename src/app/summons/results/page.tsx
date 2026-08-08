'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from '@/app/admin/components/SubjectIcon'
import { Trophy, ClipboardList, Check, X, Minus, Medal } from 'lucide-react'
import styles from './page.module.css'

interface SchoolResult {
  rank: number
  schoolName: string
  memberName: string
  totalScore: number
  correctCount: number
  wrongCount: number
  unansweredCount: number
  totalQuestions: number
  memberId: string
  isMe: boolean
}

interface ReviewItem {
  questionIndex: number
  questionText: string
  imageUrl: string | null
  options: { key: string; text: string }[]
  selectedOption: string | null
  correctOption: string
  isCorrect: boolean
  pointsEarned: number
  points: number
  negativePoints: number
}

export default function ResultsPage() {
  const router = useRouter()
  const [member, setMember] = useState<any>(null)
  const [school, setSchool] = useState<any>(null)
  const [quiz, setQuiz] = useState<any>(null)
  const [resultsStatus, setResultsStatus] = useState<'waiting' | 'ready'>('waiting')
  const [leaderboard, setLeaderboard] = useState<SchoolResult[]>([])
  const [myResult, setMyResult] = useState<SchoolResult | null>(null)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [revealedCount, setRevealedCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'review'>('leaderboard')
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const m = sessionStorage.getItem('summons_member')
    const s = sessionStorage.getItem('summons_school')
    const q = sessionStorage.getItem('summons_quiz')
    if (!m || !q) { router.replace('/summons'); return }
    setMember(JSON.parse(m))
    setSchool(JSON.parse(s || '{}'))
    setQuiz(JSON.parse(q))
  }, [router])

  // Listen for results to be published
  useEffect(() => {
    if (!member?.subject) return

    channelRef.current = supabase
      .channel(`results-${member.subject}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_state', filter: `subject=eq.${member.subject}` },
        (payload: any) => {
          if (payload.new.status === 'results_published') {
            loadResults(member.subject)
          }
        }
      )
      .subscribe()

    // Check if already published
    supabase
      .from('quiz_state')
      .select('status')
      .eq('subject', member.subject)
      .single()
      .then(({ data }) => {
        if (data?.status === 'results_published') loadResults(member.subject)
      })

    return () => { channelRef.current?.unsubscribe() }
  }, [member?.subject])

  async function loadResults(subject: string) {
    // Get all sessions for this subject with member + school info
    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select(`
        id, total_score, rank, answers,
        member_id,
        members!inner(id, name, registration_id,
          registrations!inner(school_name))
      `)
      .eq('subject', subject)
      .order('rank', { ascending: true })

    if (!sessions) return

    // Get questions for review
    const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
    let questions: any[] = []
    if (quiz) {
      const { data: q } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quiz.id)
        .order('order_index')
      questions = q ?? []
    }

    const lb: SchoolResult[] = sessions.map((s: any) => {
      const m = s.members as any
      const answers = (s.answers as any[]) ?? []
      const totalQ = questions.length
      const correct = answers.filter((a: any) => a.isCorrect).length
      const wrong = answers.filter((a: any) => a.selectedOption && !a.isCorrect).length
      return {
        rank: s.rank ?? 999,
        schoolName: m.registrations?.school_name ?? 'Unknown School',
        memberName: m.name,
        totalScore: s.total_score,
        correctCount: correct,
        wrongCount: wrong,
        unansweredCount: totalQ - answers.length,
        totalQuestions: totalQ,
        memberId: s.member_id,
        isMe: s.member_id === member?.id,
      }
    })

    setLeaderboard(lb)
    setMyResult(lb.find(r => r.isMe) ?? null)

    // Build review items for current member
    const mySession = sessions.find((s: any) => s.member_id === member?.id)
    const myAnswers: Record<string, any> = {}
    if (mySession) {
      for (const a of mySession.answers as any[]) {
        myAnswers[a.questionId] = a
      }
    }

    const review: ReviewItem[] = questions.map((q: any) => {
      const ans = myAnswers[q.id]
      return {
        questionIndex: q.order_index,
        questionText: q.question_text,
        imageUrl: q.image_url ?? null,
        options: [
          { key: 'A', text: q.option_a },
          { key: 'B', text: q.option_b },
          { key: 'C', text: q.option_c },
          { key: 'D', text: q.option_d },
          ...(q.option_e ? [{ key: 'E', text: q.option_e }] : []),
        ],
        selectedOption: ans?.selectedOption ?? null,
        correctOption: q.correct_option,
        isCorrect: ans?.isCorrect ?? false,
        pointsEarned: ans?.pointsEarned ?? 0,
        points: q.points,
        negativePoints: q.negative_points,
      }
    })

    setReviewItems(review)
    setResultsStatus('ready')

    // Animate leaderboard reveal
    let count = 0
    const interval = setInterval(() => {
      count++
      setRevealedCount(count)
      if (count >= lb.length) clearInterval(interval)
    }, 250)
  }

  const subjectCfg = member ? SUBJECT_CONFIG[member.subject as Subject] : null

  function getRankStyle(rank: number) {
    if (rank === 1) return { label: '1st', cls: 'gold' }
    if (rank === 2) return { label: '2nd', cls: 'silver' }
    if (rank === 3) return { label: '3rd', cls: 'bronze' }
    return { label: `#${rank}`, cls: '' }
  }

  if (resultsStatus === 'waiting') {
    return (
      <main className={styles.main}>
        <div className="bg-grid" /><div className="bg-radial" />
        <div className={`${styles.waitingCard} anim-scale-in`}>
          <div className={styles.spinRing} />
          <div className={styles.spinRing2} />
          <div className={styles.waitingContent}>
            <div className={styles.waitingIcon}>⏳</div>
            <h2 className={styles.waitingTitle}>Calculating Results</h2>
            <p className={styles.waitingDesc}>
              Hold tight. The admin is tallying scores across all schools.<br />
              Results will appear automatically when ready.
            </p>
            <div className={styles.waitDots}>
              <span /><span /><span />
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div className="bg-grid" /><div className="bg-radial" />

      <div className={styles.content}>
        {/* Header */}
        <div className={`${styles.header} anim-fade-up`}>
          <div className={styles.subjectPill} style={{ '--col': subjectCfg?.color } as any}>
            {member?.subject && <SubjectIcon subject={member.subject} size={14} />}
            {subjectCfg?.label} — Results
          </div>
          <h1 className={styles.title}>THE CULLING IS DONE</h1>
          <p className={styles.subtitle}>Evolvion '26 · THE SUMMONS</p>
        </div>

        {/* My result card */}
        {myResult && (
          <div className={`${styles.myCard} anim-scale-in delay-2`}>
            <div className={styles.myRank}>
              <span className={styles.myRankNum}>#{myResult.rank}</span>
              <span className={styles.myRankLabel}>Your Rank</span>
            </div>
            <div className={styles.myStats}>
              <div className={styles.myStat}>
                <span className={styles.myStatNum} style={{ color: 'var(--accent-2)' }}>{myResult.totalScore}</span>
                <span className={styles.myStatLabel}>Score</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.myStat}>
                <span className={styles.myStatNum} style={{ color: 'var(--green)' }}>{myResult.correctCount}</span>
                <span className={styles.myStatLabel}>Correct</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.myStat}>
                <span className={styles.myStatNum} style={{ color: 'var(--red)' }}>{myResult.wrongCount}</span>
                <span className={styles.myStatLabel}>Wrong</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.myStat}>
                <span className={styles.myStatNum} style={{ color: 'var(--text-3)' }}>{myResult.unansweredCount}</span>
                <span className={styles.myStatLabel}>Skipped</span>
              </div>
            </div>
            <div className={styles.mySchool}>{myResult.schoolName}</div>
          </div>
        )}

        {/* Tabs */}
        <div className={`${styles.tabs} anim-fade-in delay-3`}>
          <button
            className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            <Trophy size={14} /> Leaderboard
          </button>
          <button
            className={`tab-btn ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            <ClipboardList size={14} /> Review Answers
          </button>
        </div>

        {/* Leaderboard tab */}
        {activeTab === 'leaderboard' && (
          <div className={styles.leaderboardList}>
            {leaderboard.map((row, i) => {
              const rankStyle = getRankStyle(row.rank)
              const isRevealed = i < revealedCount
              return (
                <div
                  key={row.memberId}
                  className={`lb-row ${row.isMe ? styles.myRow : ''} ${isRevealed ? styles.lbRevealed : styles.lbHidden}`}
                  style={{ animationDelay: `${i * 0.08}s` } as any}
                >
                  <span className={`lb-rank ${rankStyle.cls}`}>{rankStyle.label}</span>
                  <div className={styles.lbInfo}>
                    <div className={styles.lbSchool}>{row.schoolName}</div>
                    <div className={styles.lbMember}>{row.memberName}</div>
                  </div>
                  <div className={styles.lbScoreBlock}>
                    <span className={styles.lbScore}>{row.totalScore}</span>
                    <span className={styles.lbDetail}>{row.correctCount}✓ {row.wrongCount}✗</span>
                  </div>
                  {row.isMe && <span className={styles.meTag}>YOU</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Review tab */}
        {activeTab === 'review' && (
          <div className={styles.reviewList}>
            {reviewItems.map((item, i) => (
              <div
                key={i}
                className={`${styles.reviewCard} ${
                  item.selectedOption === null ? styles.reviewSkipped :
                  item.isCorrect ? styles.reviewCorrect : styles.reviewWrong
                } anim-fade-up`}
                style={{ animationDelay: `${i * 0.04}s` } as any}
              >
                <div className={styles.reviewHeader}>
                  <span className={styles.reviewQNum}>Q{item.questionIndex + 1}</span>
                  <span className={styles.reviewStatus}>
                    {item.selectedOption === null
                      ? <><Minus size={13} /> Skipped</>
                      : item.isCorrect
                        ? <><Check size={13} /> +{item.pointsEarned}</>
                        : <><X size={13} /> {item.pointsEarned}</>}
                  </span>
                </div>

                {item.imageUrl && (
                  <img src={item.imageUrl} alt="" className={styles.reviewImg} />
                )}

                <p className={styles.reviewQuestion}>{item.questionText}</p>

                <div className={styles.reviewOptions}>
                  {item.options.map(opt => (
                    <div
                      key={opt.key}
                      className={`${styles.reviewOpt} ${
                        opt.key === item.correctOption ? styles.reviewOptCorrect :
                        opt.key === item.selectedOption && !item.isCorrect ? styles.reviewOptWrong :
                        ''
                      }`}
                    >
                      <span className={styles.reviewOptKey}>{opt.key}</span>
                      <span>{opt.text}</span>
                      {opt.key === item.correctOption && <span className={styles.reviewTick}>✓ Correct</span>}
                      {opt.key === item.selectedOption && !item.isCorrect && <span className={styles.reviewCross}>✗ Your answer</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          Evolvion '26 · THE SUMMONS · D.S. Senanayake College Science Society
        </div>
      </div>
    </main>
  )
}
