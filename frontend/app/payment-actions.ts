'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { customerOrderUrl, notifyCustomer } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

async function requireAdminOrSuperAdmin() {
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

function getAdminRecipientEmails() {
  const raw =
    process.env.PAYMENT_APPROVAL_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    ''

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function setFinalOutputLockState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  isLocked: boolean
) {
  const { error } = await supabase
    .from('order_files')
    .update({ is_locked: isLocked })
    .eq('order_id', orderId)
    .in('file_category', ['admin_final_docx', 'admin_final_pdf', 'admin_final_image'])

  if (error) {
    throw new Error(error.message)
  }
}

export async function setOrderPrice(formData: FormData) {
  const { supabase } = await requireAdminOrSuperAdmin()

  const orderId = String(formData.get('order_id') || '')
  const price = Number(formData.get('price') || 0)

  if (!orderId || Number.isNaN(price) || price <= 0) {
    throw new Error('Invalid quote amount.')
  }

  const quoteAmountCents = Math.round(price * 100)

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, title')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    throw new Error(orderError?.message || 'Order not found.')
  }

  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({
      price,
      quote_amount_cents: quoteAmountCents,
      status: 'pending',
      status_key: 'review_pending',
      payment_status: 'invoice_created',
      final_output_locked: true,
    })
    .eq('id', orderId)

  if (updateOrderError) {
    throw new Error(updateOrderError.message)
  }

  const { data: existingInvoice } = await supabase
    .from('invoices')
    .select('id, reference_code')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let invoiceReference = existingInvoice?.reference_code || ''

  if (existingInvoice?.id) {
    const { error: invoiceUpdateError } = await supabase
      .from('invoices')
      .update({
        amount_cents: quoteAmountCents,
        status: 'invoice_created',
        notes: 'Manual quote set by admin.',
      })
      .eq('id', existingInvoice.id)

    if (invoiceUpdateError) throw new Error(invoiceUpdateError.message)
  } else {
    invoiceReference = `AH-${Date.now()}-${orderId.slice(0, 6).toUpperCase()}`
    const { error: invoiceInsertError } = await supabase.from('invoices').insert({
      user_id: order.user_id,
      order_id: orderId,
      amount_cents: quoteAmountCents,
      status: 'invoice_created',
      invoice_kind: 'one_time',
      reference_code: invoiceReference,
      notes: 'Manual quote set by admin.',
    })

    if (invoiceInsertError) throw new Error(invoiceInsertError.message)
  }

  await notifyCustomer(order.user_id, {
    subject: `Your quote is ready — ${order.title}`,
    heading: 'Your quote is ready',
    message: `A review specialist set a price for your request. Complete the bank transfer and submit your payment reference to get started.`,
    details: [
      { label: 'Request', value: order.title },
      { label: 'Amount', value: `€${(quoteAmountCents / 100).toFixed(2)}` },
      { label: 'Reference', value: invoiceReference },
    ],
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })

  revalidatePath('/dashboard')
  revalidatePath('/admin-dashboard')
  revalidatePath('/super-dashboard')
  revalidatePath(`/admin-dashboard/orders/${orderId}`)
}

export async function notifyPaymentMade(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const orderId = String(formData.get('order_id') || '')
  const orderTitle = String(formData.get('order_title') || '')
  const paymentReference = String(formData.get('payment_reference') || '').trim()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, quote_amount_cents, price')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (orderError || !order) {
    throw new Error(orderError?.message || 'Order not found.')
  }

  let { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!invoice) {
    const amountCents =
      order.quote_amount_cents ??
      (order.price ? Math.round(Number(order.price) * 100) : null)

    if (!amountCents) {
      throw new Error('No invoice or quote amount is available for this order.')
    }

    const referenceCode = `AH-${Date.now()}-${orderId.slice(0, 6).toUpperCase()}`
    const { data: createdInvoice, error: createInvoiceError } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        order_id: orderId,
        amount_cents: amountCents,
        status: 'invoice_created',
        invoice_kind: 'one_time',
        reference_code: referenceCode,
        notes: 'Invoice created at payment-submission time.',
      })
      .select('*')
      .single()

    if (createInvoiceError) {
      throw new Error(createInvoiceError.message)
    }

    invoice = createdInvoice
  }

  const { error: invoiceStatusError } = await supabase
    .from('invoices')
    .update({
      status: 'pending_approval',
    })
    .eq('id', invoice.id)

  if (invoiceStatusError) {
    throw new Error(invoiceStatusError.message)
  }

  const { data: existingApproval } = await supabase
    .from('payment_approvals')
    .select('id')
    .eq('invoice_id', invoice.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingApproval?.id) {
    const { error: approvalUpdateError } = await supabase
      .from('payment_approvals')
      .update({
        submitted_at: new Date().toISOString(),
        payment_reference: paymentReference || null,
        approved_at: null,
        approved_by: null,
        rejected_at: null,
        rejected_by: null,
        approval_note_seen_at: null,
        approval_note_dismissed_at: null,
        clarification_requested_at: null,
        clarification_note: null,
      })
      .eq('id', existingApproval.id)

    if (approvalUpdateError) throw new Error(approvalUpdateError.message)
  } else {
    const { error: approvalInsertError } = await supabase.from('payment_approvals').insert({
      invoice_id: invoice.id,
      user_id: user.id,
      payment_reference: paymentReference || null,
    })

    if (approvalInsertError) throw new Error(approvalInsertError.message)
  }

  const { error: orderStatusError } = await supabase
    .from('orders')
    .update({
      payment_status: 'pending_approval',
      status: 'payment_submitted',
      status_key: 'payment_submitted',
      final_output_locked: true,
    })
    .eq('id', orderId)

  if (orderStatusError) {
    throw new Error(orderStatusError.message)
  }

  await setFinalOutputLockState(supabase, orderId, true)

  const recipients = getAdminRecipientEmails()
  if (resend && recipients.length > 0) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'AssignmentsHub <onboarding@resend.dev>',
        to: recipients,
        subject: `Payment waiting for approval — ${orderTitle || orderId}`,
        html: `
          <h2>Payment waiting for approval</h2>
          <p>A customer has submitted a payment for manual approval.</p>
          <ul>
            <li><strong>Order ID:</strong> ${orderId}</li>
            <li><strong>Order title:</strong> ${orderTitle || 'N/A'}</li>
            <li><strong>Customer ID:</strong> ${user.id}</li>
            <li><strong>Invoice ID:</strong> ${invoice.id}</li>
            <li><strong>Reference:</strong> ${paymentReference || 'Not provided'}</li>
          </ul>
          <p>Please review it in the admin workspace.</p>
        `,
      })
    } catch (error) {
      console.error('Failed to send payment approval email:', error)
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/orders/' + orderId)
  revalidatePath('/admin-dashboard')
  revalidatePath('/admin-dashboard/orders/' + orderId)
  revalidatePath('/super-dashboard')
}

export async function confirmPayment(formData: FormData) {
  const { supabase, user } = await requireAdminOrSuperAdmin()

  const orderId = String(formData.get('order_id') || '')
  if (!orderId) throw new Error('Missing order id.')

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, title')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    throw new Error(orderError?.message || 'Order not found.')
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id')
    .eq('order_id', orderId)
    .eq('user_id', order.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || 'Invoice not found.')
  }

  const now = new Date().toISOString()

  const { error: updateInvoiceError } = await supabase
    .from('invoices')
    .update({ status: 'approved', updated_at: now })
    .eq('id', invoice.id)

  if (updateInvoiceError) throw new Error(updateInvoiceError.message)

  const { data: approvalRow } = await supabase
    .from('payment_approvals')
    .select('id')
    .eq('invoice_id', invoice.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (approvalRow?.id) {
    const { error: approvalUpdateError } = await supabase
      .from('payment_approvals')
      .update({
        approved_at: now,
        approved_by: user.id,
        paid_at: now,
        rejected_at: null,
        rejected_by: null,
        approval_note_seen_at: null,
        approval_note_dismissed_at: null,
      })
      .eq('id', approvalRow.id)

    if (approvalUpdateError) throw new Error(approvalUpdateError.message)
  }

  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({
      payment_status: 'approved',
      status: 'in-progress',
      status_key: 'in_progress',
      final_output_locked: false,
    })
    .eq('id', orderId)

  if (updateOrderError) throw new Error(updateOrderError.message)

  await setFinalOutputLockState(supabase, orderId, false)

  await notifyCustomer(order.user_id, {
    subject: 'Payment approved — your request is in progress',
    heading: 'Your payment was approved',
    message: `Your payment for “${order.title}” was approved. The team is now working on your request.`,
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/orders/' + orderId)
  revalidatePath('/admin-dashboard')
  revalidatePath('/admin-dashboard/orders/' + orderId)
  revalidatePath('/super-dashboard')
}

export async function rejectPayment(formData: FormData) {
  const { supabase, user } = await requireAdminOrSuperAdmin()

  const orderId = String(formData.get('order_id') || '')
  if (!orderId) throw new Error('Missing order id.')

  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, title')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) throw new Error('Order not found.')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('order_id', orderId)
    .eq('user_id', order.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!invoice) throw new Error('Invoice not found.')

  const now = new Date().toISOString()

  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({ status: 'rejected', updated_at: now })
    .eq('id', invoice.id)

  if (invoiceError) throw new Error(invoiceError.message)

  const { data: approvalRow } = await supabase
    .from('payment_approvals')
    .select('id')
    .eq('invoice_id', invoice.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (approvalRow?.id) {
    const { error: approvalError } = await supabase
      .from('payment_approvals')
      .update({
        rejected_at: now,
        rejected_by: user.id,
        paid_at: null,
      })
      .eq('id', approvalRow.id)

    if (approvalError) throw new Error(approvalError.message)
  }

  const { error: orderError } = await supabase
    .from('orders')
    .update({
      payment_status: 'rejected',
      status: 'awaiting_payment',
      status_key: 'awaiting_payment',
      final_output_locked: true,
    })
    .eq('id', orderId)

  if (orderError) throw new Error(orderError.message)

  await setFinalOutputLockState(supabase, orderId, true)

  await notifyCustomer(order.user_id, {
    subject: 'Your payment needs attention',
    heading: 'Your payment could not be approved',
    message: `We couldn’t approve the payment for “${order.title}”. Double-check the transfer reference you submitted, then try again from your request page.`,
    cta: { label: 'View request', href: customerOrderUrl(orderId) },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/orders/' + orderId)
  revalidatePath('/admin-dashboard')
  revalidatePath('/admin-dashboard/orders/' + orderId)
  revalidatePath('/super-dashboard')
}