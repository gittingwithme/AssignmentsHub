'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { customerSubscriptionUrl, notifyCustomer } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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

function addPeriod(interval: string) {
  const now = new Date()
  const end = new Date(now)

  if (interval === 'weekly') {
    end.setDate(end.getDate() + 7)
  } else {
    end.setMonth(end.getMonth() + 1)
  }

  return {
    start: now.toISOString(),
    end: end.toISOString(),
  }
}

async function requireCustomer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')
  return { supabase, user }
}

async function requireAdminOrSuperAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

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

export async function requestSubscriptionPlan(formData: FormData) {
  const { supabase, user } = await requireCustomer()

  const planId = Number(formData.get('plan_id') || 0)
  if (!planId || Number.isNaN(planId)) throw new Error('Invalid plan selection.')

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .eq('is_active', true)
    .maybeSingle()

  if (planError || !plan) {
    throw new Error(planError?.message || 'Plan not found.')
  }

  if (!['weekly', 'monthly'].includes(plan.interval)) {
    throw new Error('Only weekly and monthly plans can be purchased as subscriptions.')
  }

  const { start, end } = addPeriod(plan.interval)

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      status: 'awaiting_payment',
      current_period_start: start,
      current_period_end: end,
      remaining_credits: 0,
      trial_used: false,
    })
    .select('*')
    .single()

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message || 'Failed to create subscription request.')
  }

  const referenceCode = `SUB-${Date.now()}-${String(subscription.id).slice(0, 6).toUpperCase()}`

  const { error: invoiceError } = await supabase.from('invoices').insert({
    user_id: user.id,
    subscription_id: subscription.id,
    amount_cents: plan.price_cents,
    status: 'invoice_created',
    invoice_kind: 'subscription',
    reference_code: referenceCode,
    notes: `${plan.name} subscription request.`,
  })

  if (invoiceError) {
    throw new Error(invoiceError.message)
  }

  await notifyCustomer(user.id, {
    subject: `Subscription request received — ${plan.name}`,
    heading: 'Your subscription request is in',
    message: `We received your request for the ${plan.name} plan. Complete the bank transfer and submit your payment reference to activate it.`,
    details: [
      { label: 'Plan', value: plan.name },
      { label: 'Amount', value: `€${(plan.price_cents / 100).toFixed(2)}` },
      { label: 'Reference', value: referenceCode },
    ],
    cta: { label: 'Manage subscription', href: customerSubscriptionUrl() },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/subscription')
}

export async function submitSubscriptionPayment(formData: FormData) {
  const { supabase, user } = await requireCustomer()

  const invoiceId = String(formData.get('invoice_id') || '')
  const paymentReference = String(formData.get('payment_reference') || '').trim()

  if (!invoiceId) throw new Error('Missing invoice id.')

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || 'Invoice not found.')
  }

  const { error: updateInvoiceError } = await supabase
    .from('invoices')
    .update({ status: 'pending_approval' })
    .eq('id', invoice.id)

  if (updateInvoiceError) throw new Error(updateInvoiceError.message)

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

  if (invoice.subscription_id) {
    const { error: subUpdateError } = await supabase
      .from('subscriptions')
      .update({ status: 'pending_approval' })
      .eq('id', invoice.subscription_id)

    if (subUpdateError) throw new Error(subUpdateError.message)
  }

  const recipients = getAdminRecipientEmails()
  if (resend && recipients.length > 0) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'AssignmentsHub <onboarding@resend.dev>',
        to: recipients,
        subject: `Subscription payment waiting for approval`,
        html: `
          <h2>Subscription payment waiting for approval</h2>
          <p>A customer has submitted a subscription payment for manual approval.</p>
          <ul>
            <li><strong>Customer ID:</strong> ${user.id}</li>
            <li><strong>Invoice ID:</strong> ${invoice.id}</li>
            <li><strong>Subscription ID:</strong> ${invoice.subscription_id || 'N/A'}</li>
            <li><strong>Reference:</strong> ${paymentReference || 'Not provided'}</li>
          </ul>
        `,
      })
    } catch (error) {
      console.error('Failed to send subscription approval email:', error)
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/subscription')
  revalidatePath('/admin-dashboard')
  revalidatePath('/super-dashboard')
}

export async function approveSubscriptionPayment(formData: FormData) {
  const { supabase, user } = await requireAdminOrSuperAdmin()

  const invoiceId = String(formData.get('invoice_id') || '')
  if (!invoiceId) throw new Error('Missing invoice id.')

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || 'Invoice not found.')
  }

  if (!invoice.subscription_id) {
    throw new Error('Invoice is not attached to a subscription.')
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', invoice.subscription_id)
    .maybeSingle()

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message || 'Subscription not found.')
  }

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', subscription.plan_id)
    .maybeSingle()

  if (planError || !plan) {
    throw new Error(planError?.message || 'Plan not found.')
  }

  const now = new Date().toISOString()
  const dates = addPeriod(plan.interval)

  await supabase
    .from('subscriptions')
    .update({ status: 'inactive' })
    .eq('user_id', subscription.user_id)
    .neq('id', subscription.id)
    .in('status', ['active', 'awaiting_payment', 'pending_approval'])

  const { error: invoiceUpdateError } = await supabase
    .from('invoices')
    .update({ status: 'approved', updated_at: now })
    .eq('id', invoice.id)

  if (invoiceUpdateError) throw new Error(invoiceUpdateError.message)

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
        approved_at: now,
        approved_by: user.id,
        paid_at: now,
        rejected_at: null,
        rejected_by: null,
        approval_note_seen_at: null,
        approval_note_dismissed_at: null,
      })
      .eq('id', approvalRow.id)

    if (approvalError) throw new Error(approvalError.message)
  }

  const { error: subscriptionUpdateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: dates.start,
      current_period_end: dates.end,
      remaining_credits: plan.quota_credits,
      updated_at: now,
    })
    .eq('id', subscription.id)

  if (subscriptionUpdateError) throw new Error(subscriptionUpdateError.message)

  await notifyCustomer(invoice.user_id, {
    subject: 'Your subscription is active',
    heading: 'Subscription activated',
    message: `Your ${plan.name} subscription is now active with ${plan.quota_credits} credits. You can start submitting requests right away.`,
    details: [
      { label: 'Plan', value: plan.name },
      { label: 'Credits', value: String(plan.quota_credits) },
      { label: 'Valid until', value: new Date(dates.end).toLocaleDateString() },
    ],
    cta: { label: 'Open dashboard', href: customerSubscriptionUrl() },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/subscription')
  revalidatePath('/admin-dashboard')
  revalidatePath('/super-dashboard')
}

export async function rejectSubscriptionPayment(formData: FormData) {
  const { supabase, user } = await requireAdminOrSuperAdmin()

  const invoiceId = String(formData.get('invoice_id') || '')
  if (!invoiceId) throw new Error('Missing invoice id.')

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || 'Invoice not found.')
  }

  const now = new Date().toISOString()

  const { error: invoiceUpdateError } = await supabase
    .from('invoices')
    .update({ status: 'rejected', updated_at: now })
    .eq('id', invoice.id)

  if (invoiceUpdateError) throw new Error(invoiceUpdateError.message)

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

  let planName: string | null = null

  if (invoice.subscription_id) {
    const { error: subUpdateError } = await supabase
      .from('subscriptions')
      .update({ status: 'awaiting_payment', updated_at: now })
      .eq('id', invoice.subscription_id)

    if (subUpdateError) throw new Error(subUpdateError.message)

    const { data: subWithPlan } = await supabase
      .from('subscriptions')
      .select('plan_id, plans(name)')
      .eq('id', invoice.subscription_id)
      .maybeSingle()

    const plansRef = subWithPlan?.plans as
      | { name?: string | null }
      | Array<{ name?: string | null }>
      | null
      | undefined
    planName = Array.isArray(plansRef) ? plansRef[0]?.name ?? null : plansRef?.name ?? null
  }

  await notifyCustomer(invoice.user_id, {
    subject: 'Your subscription payment needs attention',
    heading: 'Payment could not be approved',
    message: planName
      ? `Your payment for the ${planName} subscription could not be approved. Check the transfer reference you submitted and try again.`
      : `Your subscription payment could not be approved. Check the transfer reference you submitted and try again.`,
    cta: { label: 'Manage subscription', href: customerSubscriptionUrl() },
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/subscription')
  revalidatePath('/admin-dashboard')
  revalidatePath('/super-dashboard')
}