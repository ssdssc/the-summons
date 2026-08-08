'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react'
import styles from './ImageUploader.module.css'

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!

interface Props {
  value: string | null
  onChange: (url: string | null) => void
  adminToken: string
}

export default function ImageUploader({ value, onChange, adminToken }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Image must be under 10 MB.'); return }

    setError('')
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', UPLOAD_PRESET)
    formData.append('folder', 'summons/questions')

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }

        xhr.onload = () => {
          if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText)
            onChange(res.secure_url)
            setProgress(100)
            resolve()
          } else {
            reject(new Error('Upload failed'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(formData)
      })
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [onChange])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload(file)
    e.target.value = ''
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }, [upload])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const remove = useCallback(async () => {
    if (!value) return
    setDeleting(true)
    try {
      await fetch('/api/admin/cloudinary-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ imageUrl: value }),
      })
    } catch {
      // Even if delete fails remotely, clear locally
    } finally {
      setDeleting(false)
    }
    onChange(null)
    setProgress(0)
    setError('')
  }, [value, adminToken, onChange])

  // ── Preview state ──────────────────────────────────────────
  if (value) {
    return (
      <div className={styles.preview}>
        <img src={value} alt="Question image" className={styles.previewImg} />
        <div className={styles.previewOverlay}>
          <button
            type="button"
            className={styles.removeBtn}
            onClick={remove}
            disabled={deleting}
            title="Remove image"
          >
            {deleting ? <Loader2 size={14} className={styles.spinner} /> : <X size={16} />}
          </button>
        </div>
        {deleting && <div className={styles.deletingBadge}>Removing…</div>}
      </div>
    )
  }

  // ── Upload state ───────────────────────────────────────────
  if (uploading) {
    return (
      <div className={styles.uploadingState}>
        <Loader2 size={20} className={styles.spinner} />
        <span className={styles.uploadingLabel}>Uploading… {progress}%</span>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>
    )
  }

  // ── Drop zone ──────────────────────────────────────────────
  return (
    <div>
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <div className={styles.dropIcon}>
          {dragging ? <Upload size={22} /> : <ImageIcon size={22} />}
        </div>
        <p className={styles.dropText}>
          {dragging ? 'Drop to upload' : 'Drag & drop an image, or click to browse'}
        </p>
        <p className={styles.dropHint}>PNG, JPG, GIF, WebP · Max 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
    </div>
  )
}
