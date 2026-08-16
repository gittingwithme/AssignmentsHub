'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { customerOrderUrl, notifyCustomer } from '@/lib/email'
import { validateFileUpload, validateFileSignature, generateSecureFilePath } from '@/lib/file-validation'
import { logAdminEvent, logSecurityEvent } from '@/lib/audit-log'
import { AuditActions } from '@/lib/audit-actions'
import { scanFileForVirus, quarantineFile } from '@/lib/virus-scan'
import { sanitizeUserInput, sanitizeRichText } from '@/lib/sanitize'

async function requireAdminRole() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role || 'customer'
  if (!['admin', 'super_admin'].includes(role)) {
    throw new Error('Forbidden')
  }

  return { supabase, user, role }
}

function mapStatus(input: string) {
  switch (input) {
    case 'pending':
    case 'review_pending':
      return { status: 'pending', status_key: 'review_pending' }
    case 'awaiting_payment':
      return { status: 'pending', status_key: 'review_pending' }
    case 'payment_submitted':
      return { status: 'payment_submitted', status_key: 'payment_submitted' }
    case 'in-progress':
    case 'in_progress':
      return { status: 'in-progress', status_key: 'in_progress' }
    case 'completed':
      return { status: 'completed', status_key: 'completed' }
    case 'revision_requested':
      return { status: 'revision_requested', status_key: 'revision_requested' }
    case 'locked':
      return { status: 'locked', status_key: 'locked' }
    default:
      return { status: 'review_pending', status_key: 'review_pending' }
  }
}

function getFileExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.pop() ?? '' : ''
}

async function canUnlockOutputs(supabase: Awaited<ReturnType<typeof createClient>>, orderId: string) {
  const [{ data: order }, { data: invoice }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, payment_status, submission_mode, is_trial_order')
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('invoices')
      .select('id, status')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!order) return false

  // Subscription-backed requests approved by plan state.
  if (['weekly', 'monthly'].includes(order.submission_mode) && order.payment_status === 'approved') {
    return true
  }

  // One-time requests require approved invoice/payment state.
  if (order.submission_mode === 'one_time' && invoice?.status === 'approved') {
    return true
  }

  // Trial requests remain locked until a later paid path is approved.
  if (order.is_trial_order) {
    return false
  }

  return false
}

function prettifyStatusLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function updateOrderStatus(formData: FormData) {
  const { supabase, user } = await requireAdminRole()

  const orderId = String(formData.get('order_id') || '')
  const newStatus = String(formData.get('status') || '')

  if (!orderId || !newStatus) {
    throw new Error('Missing order status payload.')
  }

  const mapped = mapStatus(newStatus)

  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, title')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) throw new Error('Order not found.')

  const { error } = await supabase
    .from('orders')
    .update(mapped)
    .eq('id', orderId)

  if (error) {
    console.error('Failed to update status:', error)
    throw new Error(error.message)
  }

  const statusLabel = prettifyStatusLabel(mapped.status_key || newStatus)

  await notifyCustomer(order.user_id, {
    subject: `Request status updated — ${statusLabel}`,
    heading: 'Your request status changed',
    message: `Your request “${order.title}” is now ${statusLabel.toLowerCase()}. You can follow progress from your request page.`,
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })

  await logAdminEvent(AuditActions.ORDER_STATUS_CHANGED, user.id, {
    orderId,
    newStatus: mapped.status_key || newStatus,
    orderTitle: order.title,
  })

  revalidatePath('/admin-dashboard')
  revalidatePath('/admin-dashboard/orders/' + orderId)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/orders/' + orderId)
  revalidatePath('/super-dashboard')
}

export async function uploadAdminOutput(formData: FormData) {
  const { supabase, user } = await requireAdminRole()

  const orderId = String(formData.get('order_id') || '')
  const outputFormat = String(formData.get('output_format') || '') as 'DOCX' | 'PDF' | 'Image'
  const fileEntry = formData.get('output_file')

  if (!orderId) throw new Error('Missing order id.')
  if (!['DOCX', 'PDF', 'Image'].includes(outputFormat)) {
    throw new Error('Invalid output format.')
  }

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    throw new Error('Please upload a valid output file.')
  }

  const fileValidation = validateFileUpload(fileEntry, [outputFormat])
  if (!fileValidation.valid) {
    throw new Error(fileValidation.errors[0])
  }

  const signatureValidation = await validateFileSignature(fileEntry)
  if (!signatureValidation.valid) {
    throw new Error(signatureValidation.errors[0])
  }

  const ext = fileEntry.name.split('.').pop()?.toLowerCase() || ''

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, title')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    throw new Error(orderError?.message || 'Order not found.')
  }

  const shouldUnlock = await canUnlockOutputs(supabase, orderId)

  const filePath = generateSecureFilePath(order.user_id, orderId, 'final', ext)

  // Virus scan
  const virusScan = await scanFileForVirus(fileEntry)
  if (!virusScan.clean) {
    await quarantineFile(filePath, `Virus detected: ${virusScan.threat || 'unknown'}`)
    throw new Error('File failed security scan')
  }
  if (virusScan.error) {
    console.warn('Virus scan error:', virusScan.error)
    // Log but don't block - fail open for availability
  }

  const { error: uploadError } = await supabase.storage
    .from('assignments')
    .upload(filePath, fileEntry, {
      contentType: fileEntry.type,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const fileCategory =
    outputFormat === 'DOCX'
      ? 'admin_final_docx'
      : outputFormat === 'PDF'
        ? 'admin_final_pdf'
        : 'admin_final_image'

  const { error: fileInsertError } = await supabase.from('order_files').insert({
    order_id: orderId,
    uploaded_by: user.id,
    file_category: fileCategory,
    storage_path: filePath,
    original_filename: fileValidation.sanitizedFilename || fileEntry.name,
    mime_type: fileEntry.type,
    file_size_bytes: fileEntry.size,
    is_locked: !shouldUnlock,
  })

  if (fileInsertError) {
    throw new Error(fileInsertError.message)
  }

  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      status_key: 'completed',
      final_output_locked: !shouldUnlock,
    })
    .eq('id', orderId)

  if (updateOrderError) {
    throw new Error(updateOrderError.message)
  }

await notifyCustomer(order.user_id, {
    subject: 'Your final output is ready',
    heading: 'Your final output is ready',
    message: shouldUnlock
      ? `The final output for "${order.title}" has been uploaded and is ready to download.`
      : `The final output for "${order.title}" has been uploaded and will be available for download once your billing conditions are settled.`,
    cta: { label: 'Download output', href: customerOrderUrl(orderId) },
  })

  await logAdminEvent(AuditActions.ORDER_FILE_UPLOADED, user.id, {
    orderId,
    outputFormat,
    fileCategory,
    fileSize: fileEntry.size,
    mimeType: fileEntry.type,
  })

  revalidatePath('/admin-dashboard')
  revalidatePath('/admin-dashboard/orders/' + orderId)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/orders/' + orderId)
  revalidatePath('/super-dashboard')
}