'use client'

import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SUBJECT_CONFIG, type Subject } from '@/lib/supabase'
import { SubjectIcon } from './SubjectIcon'
import {
  AlertTriangle, List, Upload, FileText, ImageIcon,
  Trash2, FileJson, Plus, Pencil, GripVertical, Globe,
} from 'lucide-react'
import ImageUploader from './ImageUploader'
import styles from './QuestionManager.module.css'

interface Props { subject: Subject; token: string }
interface Question {
  id: string; order_index: number; question_text: string
  option_a: string; option_b: string; option_c: string; option_d: string; option_e: string | null
  correct_option: string; points: number; negative_points: number; image_url: string | null
  time_seconds: number
  // Sinhala translations
  question_text_si: string | null
  option_a_si: string | null; option_b_si: string | null
  option_c_si: string | null; option_d_si: string | null; option_e_si: string | null
}

const EMPTY_Q = {
  question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
  correct_option: 'A', points: 4, negative_points: 1, image_url: '', time_seconds: 120,
  question_text_si: '', option_a_si: '', option_b_si: '', option_c_si: '', option_d_si: '', option_e_si: '',
}

// ── Sortable card ────────────────────────────────────────────
function SortableQuestionCard({
  q, i, onEdit, onDelete, isDragOverlay = false,
}: {
  q: Question; i: number
  onEdit: (q: Question) => void
  onDelete: (id: string) => void
  isDragOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  const hasSinhala = !!(q.question_text_si?.trim())

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={`${styles.qCard} ${isDragOverlay ? styles.qCardDragging : ''}`}
    >
      {/* Drag handle */}
      <div className={styles.dragHandle} {...attributes} {...listeners} title="Drag to reorder">
        <GripVertical size={16} />
      </div>

      <div className={styles.qNum}>Q{i + 1}</div>

      <div className={styles.qBody}>
        <p className={styles.qText}>{q.question_text}</p>
        {hasSinhala && (
          <p className={styles.qText} style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            {q.question_text_si}
          </p>
        )}
        {q.image_url && (
          <img
            src={q.image_url}
            alt="Question image"
            style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, marginTop: 6, objectFit: 'contain', background: 'var(--surface-2)' }}
          />
        )}
        <div className={styles.qOptions}>
          {['A', 'B', 'C', 'D', ...(q.option_e ? ['E'] : [])].map(opt => {
            const text = opt === 'A' ? q.option_a : opt === 'B' ? q.option_b : opt === 'C' ? q.option_c : opt === 'D' ? q.option_d : q.option_e ?? ''
            return (
              <span key={opt} className={`${styles.optPill} ${q.correct_option === opt ? styles.optPillCorrect : ''}`}>
                {opt}: {text.slice(0, 30)}{text.length > 30 ? '…' : ''}
              </span>
            )
          })}
        </div>
        <div className={styles.qMeta}>
          <span className={styles.metaGreen}>+{q.points} correct</span>
          {q.negative_points > 0 && <span className={styles.metaRed}>−{q.negative_points} wrong</span>}
          {q.image_url && <span className={styles.metaImg} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ImageIcon size={14} /> Has image</span>}
          {hasSinhala && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 12, color: 'var(--accent-2)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(0,136,204,0.25)' }}>
              <Globe size={12} /> සිංහල
            </span>
          )}
        </div>
      </div>

      <div className={styles.qActions}>
        <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: '5px' }} onClick={() => onEdit(q)}>
          <Pencil size={13} /> Edit
        </button>
        <button className="btn btn-danger" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => onDelete(q.id)}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Language toggle switch ───────────────────────────────────
function LangSwitch({ lang, onChange }: { lang: 'en' | 'si'; onChange: (l: 'en' | 'si') => void }) {
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 0,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: 3,
      }}
    >
      {(['en', 'si'] as const).map(l => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          style={{
            padding: '5px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: 'none',
            background: lang === l ? 'rgba(0, 136, 204, 0.18)' : 'transparent',
            color: lang === l ? 'var(--text)' : 'var(--text-3)',
            transition: 'all 0.15s',
            outline: lang === l ? '1px solid rgba(0,136,204,0.35)' : 'none',
          }}
        >
          {l === 'en' ? 'English' : 'සිංහල'}
        </button>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
export default function QuestionManager({ subject, token }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'list' | 'add' | 'upload'>('list')
  const [form, setForm] = useState(EMPTY_Q)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [uploadJson, setUploadJson] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [formLang, setFormLang] = useState<'en' | 'si'>('en')
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg = SUBJECT_CONFIG[subject]

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  useEffect(() => { loadQuestions() }, [subject])

  async function loadQuestions() {
    setLoading(true)
    const res = await fetch(`/api/admin/questions?subject=${subject}`, { headers: { 'x-admin-token': token } })
    const json = await res.json()
    setQuestions(json.questions ?? [])
    setLoading(false)
  }

  function toast(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const oldIndex = questions.findIndex(q => q.id === active.id)
    const newIndex = questions.findIndex(q => q.id === over.id)
    const reordered = arrayMove(questions, oldIndex, newIndex)
    setQuestions(reordered)

    await fetch('/api/admin/questions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ orderedIds: reordered.map(q => q.id) }),
    })
  }

  async function saveQuestion() {
    if (!form.question_text.trim() || !form.option_a || !form.option_b || !form.option_c || !form.option_d) {
      toast('Fill in question text and at least options A–D.'); return
    }
    setSaving(true)
    const payload = {
      ...form,
      id: editId || undefined,
      subject,
      option_e: form.option_e || null,
      image_url: form.image_url || null,
      question_text_si: form.question_text_si || null,
      option_a_si: form.option_a_si || null,
      option_b_si: form.option_b_si || null,
      option_c_si: form.option_c_si || null,
      option_d_si: form.option_d_si || null,
      option_e_si: form.option_e_si || null,
    }

    const res = await fetch('/api/admin/questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    
    if (!res.ok) {
      const errData = await res.json()
      toast(`Error saving: ${errData.error || 'Unknown error'}`)
      return
    }
    
    toast(editId ? 'Question updated' : 'Question added')
    setForm(EMPTY_Q); setEditId(null); setView('list'); setFormLang('en')
    loadQuestions()
  }

  async function deleteQuestion(id: string) {
    if (!confirm('Delete this question?')) return
    await fetch(`/api/admin/questions?id=${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } })
    loadQuestions()
    toast('Question deleted')
  }

  async function clearAllQuestions() {
    if (!confirm('Are you sure you want to delete ALL questions for this subject? This cannot be undone.')) return
    setSaving(true)
    await fetch(`/api/admin/questions?subject=${subject}`, { method: 'DELETE', headers: { 'x-admin-token': token } })
    setSaving(false)
    loadQuestions()
    toast('All questions deleted')
  }

  function startEdit(q: Question) {
    setForm({
      question_text: q.question_text,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, option_e: q.option_e ?? '',
      correct_option: q.correct_option, points: q.points, negative_points: q.negative_points, image_url: q.image_url ?? '',
      time_seconds: q.time_seconds ?? 120,
      question_text_si: q.question_text_si ?? '',
      option_a_si: q.option_a_si ?? '', option_b_si: q.option_b_si ?? '',
      option_c_si: q.option_c_si ?? '', option_d_si: q.option_d_si ?? '', option_e_si: q.option_e_si ?? '',
    })
    setEditId(q.id); setView('add'); setFormLang('en')
  }

  async function handleBulkUpload() {
    setUploadError('')
    let parsed: any[]
    try { parsed = JSON.parse(uploadJson) } catch { setUploadError('Invalid JSON format'); return }
    if (!Array.isArray(parsed)) { setUploadError('JSON must be an array of questions'); return }
    setSaving(true)
    const res = await fetch('/api/admin/questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ subject, questions: parsed }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setUploadError(json.error); return }
    toast(`✓ Uploaded ${json.count} questions`)
    setUploadJson(''); setView('list'); loadQuestions()
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setUploadJson(ev.target?.result as string)
    reader.readAsText(file)
  }

  const sampleJson = JSON.stringify([{
    question_text: 'What is...', question_text_si: 'කුමක්ද...',
    option_a: 'Answer A', option_a_si: 'පිළිතුර A',
    option_b: 'Answer B', option_b_si: 'පිළිතුර B',
    option_c: 'Answer C', option_c_si: 'පිළිතුර C',
    option_d: 'Answer D', option_d_si: 'පිළිතුර D',
    option_e: null, option_e_si: null,
    correct_option: 'A', points: 4, negative_points: 1, image_url: null,
  }], null, 2)

  const activeQuestion = activeId ? questions.find(q => q.id === activeId) : null
  const activeIndex = activeId ? questions.findIndex(q => q.id === activeId) : -1

  // ── Helpers for the bilingual form ──
  const isSi = formLang === 'si'
  const optKeys = ['A', 'B', 'C', 'D', 'E'] as const

  function getFieldKey(opt: typeof optKeys[number], si: boolean) {
    const base = `option_${opt.toLowerCase()}`
    return si ? `${base}_si` : base
  }

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span><SubjectIcon subject={subject} /></span>
          <span className={styles.headerTitle}>{cfg.label} — Questions</span>
          <span className={styles.count}>{questions.length} questions</span>
        </div>
        <div className={styles.headerActions}>
          <button className={`tab-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><List size={16} /> List</button>
          <button className={`tab-btn ${view === 'add' ? 'active' : ''}`} onClick={() => { setView('add'); setForm(EMPTY_Q); setEditId(null); setFormLang('en') }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
          <button className={`tab-btn ${view === 'upload' ? 'active' : ''}`} onClick={() => setView('upload')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={16} /> Bulk Upload</button>
          {questions.length > 0 && (
            <button className="tab-btn" onClick={clearAllQuestions} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--red)', marginLeft: 8 }}><Trash2 size={16} /> Clear All</button>
          )}
        </div>
      </div>

      {msg && <div className={`${styles.toast} anim-fade-in`}>{msg}</div>}

      {/* ── List View ── */}
      {view === 'list' && (
        <div className={styles.listWrap}>
          {loading ? (
            <div className={styles.loadingState}><div className={styles.loader} />Loading...</div>
          ) : questions.length === 0 ? (
            <div className={styles.emptyState}>
              <span style={{ color: 'var(--col)' }}><FileText size={40} /></span>
              <p>No questions yet. Add some using the buttons above.</p>
              <button className="btn btn-primary" onClick={() => setView('add')}>Add First Question</button>
            </div>
          ) : (
            <>
              <p className={styles.dragHint}>
                <GripVertical size={13} style={{ display: 'inline', verticalAlign: 'middle', opacity: 0.5 }} />
                {' '}Drag the handle to reorder questions
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                  <div className={styles.questionList}>
                    {questions.map((q, i) => (
                      <SortableQuestionCard
                        key={q.id}
                        q={q}
                        i={i}
                        onEdit={startEdit}
                        onDelete={deleteQuestion}
                      />
                    ))}
                  </div>
                </SortableContext>

                {/* Drag overlay — renders the floating card while dragging */}
                <DragOverlay>
                  {activeQuestion && (
                    <SortableQuestionCard
                      q={activeQuestion}
                      i={activeIndex}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      isDragOverlay
                    />
                  )}
                </DragOverlay>
              </DndContext>
            </>
          )}
        </div>
      )}

      {/* ── Add/Edit View ── */}
      {view === 'add' && (
        <div className={styles.formWrap}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 className={styles.formTitle} style={{ marginBottom: 0 }}>{editId ? 'Edit Question' : 'Add New Question'}</h3>
            {/* Language switch */}
            <LangSwitch lang={formLang} onChange={setFormLang} />
          </div>


          <div className={styles.formGrid}>
            {/* Question text */}
            <div className={styles.formField}>
              <label className={styles.label}>
                {isSi ? 'Question Text (Sinhala)' : 'Question Text (English)'}
              </label>
              <textarea
                className={`input ${styles.textarea} ${isSi ? 'lang-si' : ''}`}
                rows={3}
                value={isSi ? form.question_text_si : form.question_text}
                onChange={e => setForm(f => isSi
                  ? { ...f, question_text_si: e.target.value }
                  : { ...f, question_text: e.target.value }
                )}
                placeholder={isSi ? 'ප්‍රශ්නය සිංහලෙන් ඇතුළු කරන්න...' : 'Enter the question...'}
              />
            </div>

            {/* Image — shared between both language tabs */}
            <div className={styles.formField}>
              <label className={styles.label}>Question Image (optional)</label>
              <ImageUploader
                value={form.image_url || null}
                onChange={(url) => setForm(f => ({ ...f, image_url: url ?? '' }))}
                adminToken={token}
              />
            </div>

            {/* Options */}
            <div className={styles.optionsGrid}>
              {optKeys.map(opt => {
                const key = getFieldKey(opt, isSi) as keyof typeof form
                const isOptE = opt === 'E'
                return (
                  <div key={opt} className={styles.optionField}>
                    <label className={styles.optionLabel}>
                      <span className={`${styles.optLetter} ${form.correct_option === opt ? styles.optLetterActive : ''}`}>{opt}</span>
                      {isOptE && <span className={styles.optionalTag}>optional</span>}
                    </label>
                    <input
                      className={`input ${isSi ? 'lang-si' : ''}`}
                      value={form[key] as string ?? ''}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={`Option ${opt}${isOptE ? ' (leave blank if not needed)' : ''}`}
                    />
                  </div>
                )
              })}
            </div>

            {/* Correct answer — only on English tab */}
            {!isSi && (
              <div className={styles.correctRow}>
                <label className={styles.label}>Correct Answer *</label>
                <div className={styles.correctBtns}>
                  {['A', 'B', 'C', 'D', 'E'].map(opt => (
                    <button key={opt} type="button"
                      className={`${styles.correctBtn} ${form.correct_option === opt ? styles.correctBtnActive : ''}`}
                      onClick={() => setForm(f => ({ ...f, correct_option: opt }))}
                    >{opt}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Points + Time — only on English tab */}
            {!isSi && (
              <div className={styles.pointsRow}>
                <div className={styles.formField}>
                  <label className={styles.label}>Points (correct)</label>
                  <input type="number" className="input" value={form.points} min={0} onChange={e => setForm(f => ({ ...f, points: +e.target.value }))} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.label}>Negative (wrong)</label>
                  <input type="number" className="input" value={form.negative_points} min={0} onChange={e => setForm(f => ({ ...f, negative_points: +e.target.value }))} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.label}>Time (seconds)</label>
                  <input type="number" className="input" value={form.time_seconds} min={5} max={300} onChange={e => setForm(f => ({ ...f, time_seconds: +e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <div className={styles.formFooter}>
            <button className="btn btn-ghost" onClick={() => { setView('list'); setEditId(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={saveQuestion} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update Question' : 'Add Question'}
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk Upload View ── */}
      {view === 'upload' && (
        <div className={styles.formWrap}>
          <h3 className={styles.formTitle}>Bulk Upload Questions</h3>
          <p className={styles.uploadDesc}>
            Paste a JSON array of questions below, or upload a .json file. <strong>This will replace all existing questions.</strong>
            <br />
            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Include <code style={{ color: 'var(--accent-2)' }}>question_text_si</code> and <code style={{ color: 'var(--accent-2)' }}>option_*_si</code> fields for Sinhala translations (optional).</span>
          </p>
          <div className={styles.uploadActions}>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileJson size={16} /> Upload JSON File</button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileUpload} />
            <button className="btn btn-ghost" onClick={() => setUploadJson(sampleJson)}>View Sample Format</button>
          </div>
          <textarea
            className={`input ${styles.jsonTextarea}`}
            rows={14}
            value={uploadJson}
            onChange={e => { setUploadJson(e.target.value); setUploadError('') }}
            placeholder={'[\n  {\n    "question_text": "...",\n    "question_text_si": "... (optional)",\n    "option_a": "...",\n    "option_a_si": "... (optional)",\n    ...\n  }\n]'}
          />
          {uploadError && <div className={styles.uploadError} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={16} /> {uploadError}</div>}
          <div className={styles.formFooter}>
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleBulkUpload} disabled={saving || !uploadJson.trim()}>
              {saving ? 'Uploading...' : <><Upload size={16} /> Upload &amp; Replace All</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
