'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ImageIcon, X } from 'lucide-react'
import { createOrder } from '@/app/order-actions'
import RequestModeSelector from '@/components/dashboard/request-mode-selector'

const SUPPORT_TYPES = [
  { value: 'assignment_review', label: 'Assignment Review' },
  { value: 'rubric_review', label: 'Rubric Review' },
  { value: 'feedback_suggestions', label: 'Feedback and Suggestions' },
  { value: 'concept_explanation', label: 'Concept Explanation' },
  { value: 'citation_guidance', label: 'Citation Guidance' },
  { value: 'submission_readiness', label: 'Submission-Readiness Review' },
]

const OUTPUT_FORMATS = [
  { value: 'DOCX', label: 'DOCX' },
  { value: 'PDF', label: 'PDF' },
  { value: 'Image', label: 'Image' },
]

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

// Browser-renderable preview formats (HEIC/HEIF get a styled fallback card instead)
const PREVIEWABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type NewOrderFormProps = {
  initialError?: string | null
  hasActiveSubscription: boolean
  activePlanName?: string | null
  uploadsRemaining24h?: number | null
  remainingCredits?: number | null
  referenceImageLimit?: number | null
  maxActiveOrders?: number | null
  currentActiveOrders?: number | null
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      const result = { width: img.width, height: img.height }
      URL.revokeObjectURL(objectUrl)
      resolve(result)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Could not read image: ${file.name}`))
    }

    img.src = objectUrl
  })
}

async function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Only image files are allowed. Invalid file: ${file.name}`
  }

  const { width } = await getImageDimensions(file)
  if (width < 480) {
    return `Image "${file.name}" is too small. Minimum width is 480px.`
  }

  return null
}

export default function NewOrderForm({
  initialError,
  hasActiveSubscription,
  activePlanName,
  uploadsRemaining24h,
  remainingCredits,
  referenceImageLimit,
  maxActiveOrders,
  currentActiveOrders,
}: NewOrderFormProps) {
  const [clientError, setClientError] = useState<string | null>(initialError || null)
  const [isValidating, setIsValidating] = useState(false)
  const [primaryFile, setPrimaryFile] = useState<{ file: File; preview: string } | null>(null)
  const [referenceFiles, setReferenceFiles] = useState<{ file: File; preview: string }[]>([])
  const [submissionModeChoice, setSubmissionModeChoice] = useState<'subscription' | 'one_time'>(
    hasActiveSubscription ? 'subscription' : 'one_time'
  )
  const [deviceFingerprint, setDeviceFingerprint] = useState('')
  const primaryInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    const storageKey = 'assignmentshub-device-id'
    let value = window.localStorage.getItem(storageKey)

    if (!value) {
      value = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      window.localStorage.setItem(storageKey, value)
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceFingerprint(value)
  }, [])

  // Free object URLs when the component unmounts (prevents preview leaks)
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const currentReferenceLimit = useMemo(() => {
    if (submissionModeChoice === 'subscription') return referenceImageLimit ?? 2
    return 3
  }, [submissionModeChoice, referenceImageLimit])

  async function handlePrimaryChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setClientError(null)

    if (!file) return

    setIsValidating(true)
    const validationError = await validateImageFile(file)
    setIsValidating(false)

    if (validationError) {
      setClientError(validationError)
      e.target.value = ''
      setPrimaryFile(null)
      return
    }

    const url = URL.createObjectURL(file)
    objectUrlsRef.current.push(url)
    setPrimaryFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview)
      return { file, preview: url }
    })
  }

  async function handleReferenceChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setClientError(null)

    const currentCount = referenceFiles.length
    if (currentCount + files.length > currentReferenceLimit) {
      setClientError(
        `You can upload a maximum of ${currentReferenceLimit} reference image(s) for this request mode (${currentCount} already selected).`
      )
      e.target.value = ''
      return
    }

    setIsValidating(true)
    for (const file of files) {
      const validationError = await validateImageFile(file)
      if (validationError) {
        setClientError(validationError)
        e.target.value = ''
        setIsValidating(false)
        return
      }
    }
    setIsValidating(false)

    const additions = files.map((file) => {
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      return { file, preview: url }
    })
    setReferenceFiles((prev) => [...prev, ...additions])
    e.target.value = ''
  }

  function handleRemovePrimary() {
    setPrimaryFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview)
      return null
    })
    if (primaryInputRef.current) primaryInputRef.current.value = ''
    setClientError(null)
  }

  function handleRemoveReference(index: number) {
    setReferenceFiles((prev) => {
      const next = prev.filter((_, i) => i !== index)
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.preview)
      return next
    })
    setClientError(null)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (isValidating) {
      e.preventDefault()
      setClientError('Please wait for image validation to finish.')
      return
    }

    if (clientError) {
      e.preventDefault()
    }

    if (submissionModeChoice === 'subscription' && !hasActiveSubscription) {
      e.preventDefault()
      setClientError('You need an active subscription to use subscription mode.')
    }
  }

  return (
    <div className="space-y-6">
      {(clientError || initialError) && (
        <div className="alert alert-error">{clientError || initialError}</div>
      )}

      <div className="premium-card p-6 md:p-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="surface-dark p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Subscription</p>
            <p className="mt-2 text-sm text-white">
              {hasActiveSubscription ? activePlanName || 'Active plan' : 'No active subscription'}
            </p>
          </div>

          <div className="surface-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Uploads left / 24h</p>
            <p className="mt-2 text-sm text-white">
              {hasActiveSubscription ? (uploadsRemaining24h ?? 'N/A') : 'N/A'}
            </p>
          </div>

          <div className="surface-blue p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Remaining credits</p>
            <p className="mt-2 text-sm text-white">
              {hasActiveSubscription ? (remainingCredits ?? 'N/A') : 'N/A'}
            </p>
          </div>
        </div>

        <form action={createOrder} onSubmit={handleSubmit} className="space-y-6">
          <input type="hidden" name="device_fingerprint" value={deviceFingerprint} />

          <RequestModeSelector
            value={submissionModeChoice}
            onChange={(mode) => {
              setSubmissionModeChoice(mode)
              setClientError(null)
              // Switching modes changes the reference-image allowance; clear any picks above it
              setReferenceFiles((prev) => {
                prev.forEach((ref) => URL.revokeObjectURL(ref.preview))
                return []
              })
              if (referenceInputRef.current) referenceInputRef.current.value = ''
            }}
            hasActiveSubscription={hasActiveSubscription}
            activePlanName={activePlanName}
          />

          {submissionModeChoice === 'subscription' &&
          typeof maxActiveOrders === 'number' &&
          typeof currentActiveOrders === 'number' ? (
            <p className="text-xs text-zinc-400">
              Active orders: {currentActiveOrders}/{maxActiveOrders}
            </p>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="title" className="text-sm font-semibold text-zinc-200">
                Request Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g. Week 4 Economics Assignment Review"
                className="premium-input"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="course_subject" className="text-sm font-semibold text-zinc-200">
                Course Subject *
              </label>
              <input
                id="course_subject"
                name="course_subject"
                type="text"
                required
                placeholder="e.g. Economics 101"
                className="premium-input"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="support_type" className="text-sm font-semibold text-zinc-200">
                Support Type *
              </label>
              <select
                id="support_type"
                name="support_type"
                required
                className="premium-select"
                defaultValue="assignment_review"
              >
                {SUPPORT_TYPES.map((item) => (
                  <option key={item.value} value={item.value} className="bg-[#0C1210] text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="requested_output_format" className="text-sm font-semibold text-zinc-200">
                Output Format *
              </label>
              <select
                id="requested_output_format"
                name="requested_output_format"
                required
                className="premium-select"
                defaultValue="PDF"
              >
                {OUTPUT_FORMATS.map((item) => (
                  <option key={item.value} value={item.value} className="bg-[#0C1210] text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="deadline_at" className="text-sm font-semibold text-zinc-200">
                Deadline *
              </label>
              <input
                id="deadline_at"
                name="deadline_at"
                type="datetime-local"
                required
                className="premium-input"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-semibold text-zinc-200">
              Description <span className="font-normal text-zinc-400">(Optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Add any extra information that may help with the review."
              className="premium-textarea"
            />
          </div>

          <div className="surface-dark p-4">
            <h2 className="text-sm font-semibold text-white">Upload Guidelines</h2>
            <ul className="mt-3 space-y-1 text-sm text-zinc-400">
              <li>• Only image uploads are allowed.</li>
              <li>• Supported formats: JPG, JPEG, PNG, WEBP, optional HEIC/HEIF.</li>
              <li>• Minimum readable image width: 480px.</li>
              <li>• One primary image is required.</li>
              <li>• Reference image allowance for this mode: {currentReferenceLimit}</li>
            </ul>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-zinc-200">Primary Image *</span>
            <input
              ref={primaryInputRef}
              id="primary_image"
              name="primary_image"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,.heic,.heif"
              onChange={handlePrimaryChange}
              className="sr-only"
            />
            {primaryFile ? (
              <div className="relative overflow-hidden rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--surface)' }}>
                <div className="flex flex-wrap items-center gap-4">
                  {PREVIEWABLE_TYPES.includes(primaryFile.file.type) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={primaryFile.preview}
                      alt={`Preview of ${primaryFile.file.name}`}
                      className="h-32 w-full rounded-lg object-cover sm:w-44"
                    />
                  ) : (
                    <span className="flex h-32 w-full items-center justify-center rounded-lg border sm:w-44" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--surface-raised)', color: 'var(--ink-faint)' }}>
                      <ImageIcon size={26} aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{primaryFile.file.name}</p>
                    <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      {(primaryFile.file.size / 1024 / 1024).toFixed(2)} MB
                      {!PREVIEWABLE_TYPES.includes(primaryFile.file.type) ? ' • preview unavailable for this format' : ''}
                    </p>
                    <button
                      type="button"
                      onClick={handleRemovePrimary}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium"
                      style={{ color: 'var(--ink-muted)', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}
                    >
                      <X size={12} aria-hidden /> Remove and choose another
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <label
                htmlFor="primary_image"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:border-[var(--brand-500)] hover:bg-[rgba(200,27,28,0.04)]"
                style={{ borderColor: 'var(--hairline-strong)', backgroundColor: 'var(--surface)' }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ border: '1px solid var(--hairline)', backgroundColor: 'var(--surface-raised)', color: 'var(--brand-400)' }}>
                  <ImageIcon size={20} aria-hidden />
                </span>
                <span className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Click to upload your primary image</span>
                <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>JPG, PNG, WEBP, HEIC • minimum width 480px</span>
              </label>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-zinc-200">
              Reference Images <span className="font-normal text-zinc-400">(Optional)</span>
            </span>
            <input
              ref={referenceInputRef}
              id="reference_images"
              name="reference_images"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,.heic,.heif"
              onChange={handleReferenceChange}
              className="sr-only"
            />
            {referenceFiles.length > 0 ? (
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--surface)' }}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {referenceFiles.map((ref, index) => (
                    <div key={ref.preview} className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--surface-raised)' }}>
                      {PREVIEWABLE_TYPES.includes(ref.file.type) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ref.preview}
                          alt={`Preview of ${ref.file.name}`}
                          className="h-28 w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-28 w-full items-center justify-center" style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--ink-faint)' }}>
                          <ImageIcon size={22} aria-hidden />
                        </span>
                      )}
                      <div className="flex items-center gap-2 p-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: 'var(--ink)' }}>{ref.file.name}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveReference(index)}
                          aria-label={`Remove ${ref.file.name}`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                          style={{ color: 'var(--ink-muted)', backgroundColor: 'var(--surface)' }}
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {referenceFiles.length < currentReferenceLimit && (
                  <label
                    htmlFor="reference_images"
                    className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-[12px] font-medium transition-colors hover:border-[var(--brand-500)] hover:bg-[rgba(200,27,28,0.04)]"
                    style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink-muted)' }}
                  >
                    <ImageIcon size={14} aria-hidden /> Add more images ({referenceFiles.length} of {currentReferenceLimit})
                  </label>
                )}
              </div>
            ) : (
              <label
                htmlFor="reference_images"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-[var(--brand-500)] hover:bg-[rgba(200,27,28,0.04)]"
                style={{ borderColor: 'var(--hairline-strong)', backgroundColor: 'var(--surface)' }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ border: '1px solid var(--hairline)', backgroundColor: 'var(--surface-raised)', color: 'var(--brand-400)' }}>
                  <ImageIcon size={20} aria-hidden />
                </span>
                <span className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Click to upload reference images</span>
                <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>Optional • up to {currentReferenceLimit} images for this mode</span>
              </label>
            )}
          </div>

          <div className="surface-blue p-4 text-sm text-zinc-300">
            {submissionModeChoice === 'subscription'
              ? 'This request will use your active subscription and consume available credits if plan checks pass.'
              : 'One-time work may receive an automatic estimate or an admin-reviewed quote depending on the submission.'}
          </div>

          <button
            type="submit"
            disabled={isValidating}
            className="premium-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isValidating ? 'Validating images...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
