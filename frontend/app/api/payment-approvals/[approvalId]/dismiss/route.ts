import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  const { approvalId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: approval, error: fetchError } = await supabase
    .from('payment_approvals')
    .select('id, user_id')
    .eq('id', approvalId)
    .maybeSingle()

  if (fetchError || !approval) {
    return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
  }

  if (approval.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('payment_approvals')
    .update({
      approval_note_dismissed_at: new Date().toISOString(),
    })
    .eq('id', approvalId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}