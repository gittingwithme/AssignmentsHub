'use server'

import crypto from 'crypto'
import { headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { customerOrderUrl, notifyCustomer } from '@/lib/email'
import { sanitizeUserInput, sanitizeRichText } from '@/lib/sanitize'
import { MAX_FILE_SIZE_BYTES, validateFileSignature } from '@/lib/file-validation'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const SUPPORT_TYPE_LABELS: Record<string, string> = {
  assignment_review: 'Assignment Review',
  rubric_review: 'Rubric Review',
  feedback_suggestions: 'Feedback and Suggestions',
  concept_explanation: 'Concept Explanation',
  citation_guidance: 'Citation Guidance',
  submission_readiness: 'Submission-Readiness Review',
}

function toCents(value: number) {
  return Math.round(value * 100)
}

function redirectWithError(message: string): never {
  redirect(`/dashboard/new-order?error=${encodeURIComponent(message)}`)
}

function getFileExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.pop() ?? 'jpg' : 'jpg'
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function calculateCreditCost(referenceCount: number) {
  return 1 + Math.ceil(referenceCount / 2)
}

async function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}

async function uploadImageFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orderId: string,
  file: File,
  kind: 'primary' | 'reference',
  index = 0
) {
  const ext = getFileExtension(file.name)
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = `orders/${userId}/${orderId}/${kind}-${index}-${suffix}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('assignments')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
  }

  const { data: publicUrlData } = supabase.storage
    .from('assignments')
    .getPublicUrl(filePath)

  return {
    storagePath: filePath,
    publicUrl: publicUrlData.publicUrl,
  }
}

async function logTrialSignal(params: {
  userId: string
  email: string | null
  ipHash: string | null
  deviceHash: string | null
  userAgentHash: string | null
  status: 'approved' | 'blocked' | 'review'
  notes?: string
}) {
  const service = await getServiceClient()

  await service.from('anti_abuse_signals').insert({
    user_id: params.userId,
    email: params.email,
    ip_hash: params.ipHash,
    device_hash: params.deviceHash,
    user_agent_hash: params.userAgentHash,
    status: params.status,
    decision: params.status,
  })

  await service.from('trial_attempts').insert({
    user_id: params.userId,
    email: params.email,
    ip_hash: params.ipHash,
    device_hash: params.deviceHash,
    status: params.status,
    notes: params.notes || null,
  })
}

export async function createOrder(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const title = String(formData.get('title') || '').trim()
  const courseSubject = String(formData.get('course_subject') || '').trim()
  const supportTypeKey = String(formData.get('support_type') || '').trim()
  const requestedOutputFormat = String(formData.get('requested_output_format') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const deadlineRaw = String(formData.get('deadline_at') || '').trim()
  const submissionModeChoice = String(formData.get('submission_mode_choice') || 'one_time').trim()
  const deviceFingerprint = String(formData.get('device_fingerprint') || '').trim()

  const primaryImageEntry = formData.get('primary_image')
  const referenceImages = formData
    .getAll('reference_images')
    .filter((file): file is File => file instanceof File && file.size > 0)

  if (!title) redirectWithError('Request title is required.')
  if (!courseSubject) redirectWithError('Course Subject is required.')
  if (!supportTypeKey || !(supportTypeKey in SUPPORT_TYPE_LABELS)) {
    redirectWithError('Please select a valid support type.')
  }
  if (!['DOCX', 'PDF', 'Image'].includes(requestedOutputFormat)) {
    redirectWithError('Please select a valid output format.')
  }
  if (!deadlineRaw) redirectWithError('Deadline is required.')

  const deadlineAt = new Date(deadlineRaw)
  if (Number.isNaN(deadlineAt.getTime())) {
    redirectWithError('Please provide a valid deadline.')
  }

  if (!(primaryImageEntry instanceof File) || primaryImageEntry.size === 0) {
    redirectWithError('A primary image is required.')
  }

  const primaryImage: File = primaryImageEntry

  if (!ALLOWED_IMAGE_TYPES.has(primaryImage.type)) {
    redirectWithError('Primary upload must be a valid image file.')
  }
  if (primaryImage.size > MAX_FILE_SIZE_BYTES) {
    redirectWithError('Primary upload exceeds the 50MB size limit.')
  }
  const primarySignature = await validateFileSignature(primaryImage)
  if (!primarySignature.valid) {
    redirectWithError(primarySignature.errors[0])
  }

  for (const file of referenceImages) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      redirectWithError(`Reference file "${file.name}" is not a supported image type.`)
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      redirectWithError(`Reference file "${file.name}" exceeds the 50MB size limit.`)
    }
    const refSignature = await validateFileSignature(file)
    if (!refSignature.valid) {
      redirectWithError(`Reference file "${file.name}" ${refSignature.errors[0].toLowerCase()}`)
    }
  }

  const orderId = crypto.randomUUID()
  const supportTypeLabel = SUPPORT_TYPE_LABELS[supportTypeKey]
  const totalImages = 1 + referenceImages.length
  const creditCost = calculateCreditCost(referenceImages.length)

  // Sanitize user inputs
  const sanitizedTitle = sanitizeUserInput(title)
  const sanitizedCourseSubject = sanitizeUserInput(courseSubject)
  const sanitizedDescription = sanitizeRichText(description)

  let submissionModeForOrder: 'one_time' | 'weekly' | 'monthly' = 'one_time'
  let isTrialOrder = false
  let quoteAmountCents: number | null = null
  let legacyPrice: number | null = null
  let statusText = 'review_pending'
  let statusKey = 'review_pending'
  let paymentStatus = 'invoice_created'
  let finalOutputLocked = true
  let activeSubscriptionId: string | null = null

  if (submissionModeChoice === 'subscription') {
    const { data: activeSubscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })

    if (subError) redirectWithError(subError.message)

    const activeSubscription = activeSubscriptions?.[0]
    if (!activeSubscription) {
      redirectWithError('You do not have an active subscription. Choose a plan first or use one-time work.')
    }

    const activePlan = activeSubscription.plans
    if (!activePlan) {
      redirectWithError('Your active subscription is missing plan details.')
    }

    const { data: recentUsage, error: usageError } = await supabase
      .from('upload_usage_logs')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (usageError) redirectWithError(usageError.message)

    const uploadsInLast24h = recentUsage?.length ?? 0
    if (uploadsInLast24h >= activePlan.rolling_24h_upload_limit) {
      redirectWithError('You have reached your rolling 24-hour upload limit for your current plan.')
    }

    const { count: activeOrderCount, error: activeOrderCountError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status_key', [
        'review_pending',
        'awaiting_payment',
        'payment_submitted',
        'in_progress',
        'revision_requested',
      ])

    if (activeOrderCountError) {
      redirectWithError(activeOrderCountError.message)
    }

    if ((activeOrderCount ?? 0) >= activePlan.max_active_orders) {
      redirectWithError('You have reached the maximum number of active orders allowed for your current plan.')
    }

    const referenceLimit = activePlan.reference_image_limit ?? 2
    if (referenceImages.length > referenceLimit) {
      redirectWithError(`Your current plan allows up to ${referenceLimit} reference image(s) per request.`)
    }

    const remainingCredits = activeSubscription.remaining_credits ?? 0
    if (remainingCredits < creditCost) {
      redirectWithError('Your plan does not have enough remaining credits for this request. Please renew or top up.')
    }

    submissionModeForOrder = activePlan.interval
    activeSubscriptionId = activeSubscription.id
    paymentStatus = 'approved'
    finalOutputLocked = true
    statusText = 'pending'
    statusKey = 'review_pending'
  }

  if (submissionModeChoice === 'one_time') {
    if (referenceImages.length > 3) {
      redirectWithError('You can upload a maximum of 3 reference images for one-time work.')
    }

    const { data: pricingTiers, error: pricingError } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('plan_type', 'one-time')
      .order('max_images', { ascending: true, nullsFirst: false })

    if (pricingError) {
      console.error('[createOrder] pricing fetch error:', pricingError)
      redirectWithError(
        'We could not load pricing for your request. Please try again or contact support.'
      )
    }

    const standardTier = (pricingTiers ?? []).find(
      (tier) => tier.max_images !== null && tier.max_images >= totalImages
    )

    if (!standardTier || standardTier.price == null) {
      redirectWithError(
        'We could not price your request with the current configuration. Please contact support.'
      )
    }

    legacyPrice = Number(standardTier.price)
    quoteAmountCents = toCents(legacyPrice)
    statusText = 'pending'
    statusKey = 'review_pending'
    paymentStatus = 'invoice_created'
  }

  if (submissionModeChoice === 'trial') {
    isTrialOrder = true
    submissionModeForOrder = 'one_time'
    finalOutputLocked = true
    paymentStatus = 'invoice_created'
    statusText = 'review_pending'
    statusKey = 'review_pending'

    if (referenceImages.length > 0) {
      redirectWithError('The free trial allows only one primary image upload.')
    }

    const emailConfirmedAt = (user as { email_confirmed_at?: string | null }).email_confirmed_at
    if (!emailConfirmedAt) {
      redirectWithError('Please verify your email before using the free trial.')
    }

    const { data: previousTrialOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_trial_order', true)
      .limit(1)
      .maybeSingle()

    if (previousTrialOrder) {
      redirectWithError('You have already used your free trial.')
    }

    const requestHeaders = await headers()
    const ipHeader = requestHeaders.get('x-forwarded-for') || ''
    const userAgent = requestHeaders.get('user-agent') || ''
    const ip = ipHeader.split(',')[0]?.trim() || ''
    const ipHash = ip ? sha256(ip) : null
    const userAgentHash = userAgent ? sha256(userAgent) : null
    const deviceHash = deviceFingerprint ? sha256(deviceFingerprint) : null
    const email = user.email || null

    const service = await getServiceClient()

    const [{ data: sameEmailTrials }, { data: sameDeviceTrials }, { data: sameIpTrials }] =
      await Promise.all([
        service
          .from('trial_attempts')
          .select('id')
          .eq('email', email)
          .neq('status', 'blocked'),
        deviceHash
          ? service
              .from('trial_attempts')
              .select('id')
              .eq('device_hash', deviceHash)
              .neq('status', 'blocked')
          : Promise.resolve({ data: [] as { id: string }[] }),
        ipHash
          ? service
              .from('trial_attempts')
              .select('id')
              .eq('ip_hash', ipHash)
          : Promise.resolve({ data: [] as { id: string }[] }),
      ])

    if ((sameEmailTrials?.length ?? 0) > 0) {
      await logTrialSignal({
        userId: user.id,
        email,
        ipHash,
        deviceHash,
        userAgentHash,
        status: 'blocked',
        notes: 'Blocked trial: same email already attempted or used a trial.',
      })
      redirectWithError('This email has already been used for a free trial.')
    }

    if (deviceHash && (sameDeviceTrials?.length ?? 0) > 0) {
      await logTrialSignal({
        userId: user.id,
        email,
        ipHash,
        deviceHash,
        userAgentHash,
        status: 'blocked',
        notes: 'Blocked trial: same device fingerprint already attempted or used a trial.',
      })
      redirectWithError('A free trial has already been used from this device.')
    }

    if (ipHash && (sameIpTrials?.length ?? 0) >= 2) {
      await logTrialSignal({
        userId: user.id,
        email,
        ipHash,
        deviceHash,
        userAgentHash,
        status: 'blocked',
        notes: 'Blocked trial: too many trial attempts from same IP context.',
      })
      redirectWithError('Too many trial attempts detected from your network. Please contact support.')
    }

    await logTrialSignal({
      userId: user.id,
      email,
      ipHash,
      deviceHash,
      userAgentHash,
      status: 'approved',
      notes: 'Trial allowed.',
    })
  }

  let primaryUpload: { storagePath: string; publicUrl: string }
  let referenceUploads: Array<{ storagePath: string; publicUrl: string }> = []

  try {
    primaryUpload = await uploadImageFile(supabase, user.id, orderId, primaryImage, 'primary', 0)

    referenceUploads = await Promise.all(
      referenceImages.map((file, index) =>
        uploadImageFile(supabase, user.id, orderId, file, 'reference', index + 1)
      )
    )
  } catch (error) {
    console.error('[createOrder] Upload failed:', error)
    redirectWithError(
      error instanceof Error ? error.message : 'Failed to upload one or more images.'
    )
  }

  const { error: orderInsertError } = await supabase.from('orders').insert({
    id: orderId,
    user_id: user.id,
    title: sanitizedTitle,
    course_subject: sanitizedCourseSubject,
    support_type: supportTypeLabel,
    support_type_key: supportTypeKey,
    requested_output_format: requestedOutputFormat,
    requested_output_format_key: requestedOutputFormat,
    description: sanitizedDescription || null,
    instructions: sanitizedDescription || null,
    deadline_at: deadlineAt.toISOString(),
    submission_mode: submissionModeForOrder,
    is_trial_order: isTrialOrder,
    complexity: 'standard',
    quote_amount_cents: quoteAmountCents,
    price: legacyPrice,
    payment_status: paymentStatus,
    final_output_locked: finalOutputLocked,
    status: statusText,
    status_key: statusKey,
    file_url: primaryUpload.publicUrl,
    file_urls: [primaryUpload.publicUrl, ...referenceUploads.map((f) => f.publicUrl)],
  })

  if (orderInsertError) {
    console.error('[createOrder] order insert error:', orderInsertError)
    redirectWithError(orderInsertError.message)
  }

  const fileRows = [
    {
      order_id: orderId,
      uploaded_by: user.id,
      file_category: 'customer_primary_image',
      storage_path: primaryUpload.storagePath,
      original_filename: primaryImage.name,
      mime_type: primaryImage.type,
      file_size_bytes: primaryImage.size,
      is_locked: false,
    },
    ...referenceImages.map((file, index) => ({
      order_id: orderId,
      uploaded_by: user.id,
      file_category: 'customer_reference_image',
      storage_path: referenceUploads[index].storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      is_locked: false,
    })),
  ]

  const { error: fileRowsError } = await supabase.from('order_files').insert(fileRows)
  if (fileRowsError) {
    console.error('[createOrder] order_files insert error:', fileRowsError)
    redirectWithError(fileRowsError.message)
  }

  let invoiceReference: string | null = null

  if (submissionModeChoice === 'one_time' && quoteAmountCents !== null) {
    invoiceReference = `AH-${Date.now()}-${orderId.slice(0, 6).toUpperCase()}`

    const { error: invoiceError } = await supabase.from('invoices').insert({
      user_id: user.id,
      order_id: orderId,
      amount_cents: quoteAmountCents,
      status: 'invoice_created',
      invoice_kind: 'one_time',
      reference_code: invoiceReference,
      notes: `Auto-generated invoice for ${totalImages} uploaded image(s).`,
    })

    if (invoiceError) {
      console.error('[createOrder] invoice insert error:', invoiceError)
      redirectWithError(invoiceError.message)
    }
  }

  if (submissionModeChoice === 'subscription' && activeSubscriptionId) {
    const { data: activeSubscription } = await supabase
      .from('subscriptions')
      .select('remaining_credits')
      .eq('id', activeSubscriptionId)
      .maybeSingle()

    const remainingCredits = activeSubscription?.remaining_credits ?? 0

    const { error: usageInsertError } = await supabase.from('upload_usage_logs').insert({
      user_id: user.id,
      order_id: orderId,
      images_uploaded: totalImages,
      primary_image_count: 1,
      reference_image_count: referenceImages.length,
      credit_cost: creditCost,
    })

    if (usageInsertError) {
      console.error('[createOrder] upload_usage_logs insert error:', usageInsertError)
      redirectWithError(usageInsertError.message)
    }

    const { error: subscriptionUpdateError } = await supabase
      .from('subscriptions')
      .update({
        remaining_credits: Math.max(remainingCredits - creditCost, 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeSubscriptionId)

    if (subscriptionUpdateError) {
      console.error('[createOrder] subscription update error:', subscriptionUpdateError)
      redirectWithError(subscriptionUpdateError.message)
    }
  }

  await notifyCustomer(user.id, {
    subject: 'We received your request',
    heading: 'Request received',
    message:
      quoteAmountCents !== null
        ? `Your request “${title}” was received and an invoice of €${(quoteAmountCents / 100).toFixed(2)} is ready. Complete the bank transfer and submit your payment reference to get started.`
        : `Your request “${title}” was received and is now in review. We’ll reach out here if anything is needed.`,
    details: [
      { label: 'Request', value: title },
      ...(quoteAmountCents !== null
        ? [{ label: 'Amount', value: `€${(quoteAmountCents / 100).toFixed(2)}` }]
        : []),
      ...(invoiceReference ? [{ label: 'Reference', value: invoiceReference }] : []),
    ],
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/subscription')
  revalidatePath('/dashboard/new-order')
  revalidatePath('/admin-dashboard')
  revalidatePath('/super-dashboard')
  redirect('/dashboard')
}