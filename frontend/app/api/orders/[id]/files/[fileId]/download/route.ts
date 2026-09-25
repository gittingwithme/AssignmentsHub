import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isFinalOutputCategory } from '@/lib/storage'

/**
 * Download proxy for order files.
 *
 * Final outputs live in the `outputs/{order_id}/` storage prefix which
 * customers can never read directly (storage RLS is scoped to
 * `orders/{user_id}/...`). All final-output downloads go through here so the
 * server can enforce ownership AND the payment lock state before minting a
 * signed URL with the service role.
 *
 * Customers may download:
 *   - their own input uploads (always)
 *   - final outputs only when unlocked (order.final_output_locked = false
 *     and the file row is not locked)
 * Staff may download anything on any order.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: file, error: fileError } = await supabase
    .from('order_files')
    .select('id, order_id, file_category, is_locked, storage_path')
    .eq('id', fileId)
    .eq('order_id', id)
    .maybeSingle()

  if (fileError || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, final_output_locked')
    .eq('id', id)
    .maybeSingle()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role || 'customer'
  const isStaff = role === 'admin' || role === 'super_admin'

  if (!isStaff && order.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Final outputs are gated on the payment lock — never issuable to customers
  // while locked, even if the file row alone looks unlocked.
  if (!isStaff && isFinalOutputCategory(file.file_category)) {
    if (file.is_locked || order.final_output_locked) {
      return NextResponse.json({ error: 'File is locked' }, { status: 403 })
    }
  }

  const service = await createServiceClient()
  const { data, error } = await service.storage
    .from('assignments')
    .createSignedUrl(file.storage_path, 60 * 10)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not prepare download' }, { status: 500 })
  }

  return NextResponse.redirect(data.signedUrl)
}
