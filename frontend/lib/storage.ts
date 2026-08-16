import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

type FileCategory =
  | 'customer_primary_image'
  | 'customer_reference_image'
  | 'admin_final_docx'
  | 'admin_final_pdf'
  | 'admin_final_image'
  | 'admin_notes'
  | 'payment_proof'
  | 'message_attachment'

export type OrderFileRow = {
  id: string
  order_id: string
  uploaded_by: string
  file_category: FileCategory
  storage_path: string
  original_filename?: string | null
  mime_type?: string | null
  file_size_bytes?: number | null
  is_locked?: boolean | null
  created_at?: string | null
}

export type ResolvedOrderFile = OrderFileRow & {
  url: string | null
  display_name: string
}

export function isFinalOutputCategory(category: string) {
  return ['admin_final_docx', 'admin_final_pdf', 'admin_final_image'].includes(category)
}

export function isCustomerInputCategory(category: string) {
  return ['customer_primary_image', 'customer_reference_image'].includes(category)
}

export function prettifyFileCategory(category: string) {
  return category.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function resolveStorageUrl(storagePath: string) {
  const supabase = await createServerSupabaseClient()

  // Prefer signed URLs so we can later switch to a private bucket with minimal page refactors.
  const signed = await supabase.storage.from('assignments').createSignedUrl(storagePath, 60 * 10)

  if (!signed.error && signed.data?.signedUrl) {
    return signed.data.signedUrl
  }

  // Fallback for current public-bucket stage.
  const { data } = supabase.storage.from('assignments').getPublicUrl(storagePath)
  return data.publicUrl || null
}

export async function resolveOrderFilesForDisplay(
  files: OrderFileRow[],
  options?: { hideLockedFinalOutputs?: boolean }
): Promise<ResolvedOrderFile[]> {
  const hideLockedFinalOutputs = options?.hideLockedFinalOutputs ?? false

  const filtered = hideLockedFinalOutputs
    ? files.filter((file) => !(isFinalOutputCategory(file.file_category) && file.is_locked))
    : files

  return Promise.all(
    filtered.map(async (file) => ({
      ...file,
      url: await resolveStorageUrl(file.storage_path),
      display_name: file.original_filename || file.storage_path,
    }))
  )
}