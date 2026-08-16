import { z } from 'zod'

export const emailSchema = z.string().email('Invalid email address').trim().toLowerCase()

export const fullNameSchema = z.string().trim().min(1, 'Full name is required').max(100, 'Name too long')

export const orderIdSchema = z.string().uuid('Invalid order ID')

export const priceSchema = z.number().positive('Price must be positive').max(100000, 'Price exceeds maximum')

export const orderStatusSchema = z.enum([
  'pending',
  'review_pending', 
  'awaiting_payment',
  'payment_submitted',
  'in-progress',
  'in_progress',
  'completed',
  'revision_requested',
  'locked'
])

export const paymentReferenceSchema = z.string().trim().max(200, 'Reference too long')

export const messageSchema = z.string().trim().min(1, 'Message is required').max(10000, 'Message too long')

export const fileCategorySchema = z.enum([
  'customer_initial',
  'customer_additional',
  'admin_final_docx',
  'admin_final_pdf',
  'admin_final_image'
])

export const outputFormatSchema = z.enum(['DOCX', 'PDF', 'Image'])

const ALLOWED_EXTENSIONS = ['docx', 'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
const MAX_FILE_SIZE = 50 * 1024 * 1024

export const validateFileExtension = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ALLOWED_EXTENSIONS.includes(ext)
}

export const validateFileSize = (size: number): boolean => {
  return size > 0 && size <= MAX_FILE_SIZE
}

export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255)
}

export const orderFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().trim().max(5000, 'Description too long'),
  subject: z.string().trim().max(100, 'Subject too long'),
  pages: z.number().int().min(1).max(100).optional(),
  deadline: z.string().datetime().optional(),
  submission_mode: z.enum(['one_time', 'weekly', 'monthly']),
})

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(100).optional(),
  email: z.string().email().optional(),
})

export function parseFormData<T extends z.ZodTypeAny>(schema: T, data: FormData): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const obj: Record<string, unknown> = {}
  data.forEach((value, key) => {
    if (obj[key]) {
      if (Array.isArray(obj[key])) {
        (obj[key] as unknown[]).push(value)
      } else {
        obj[key] = [obj[key], value]
      }
    } else {
      obj[key] = value
    }
  })
  return schema.safeParse(obj)
}

export function formatValidationErrors(zodError: z.ZodError): string[] {
  return zodError.issues.map(e => `${e.path.join('.')}: ${e.message}`)
}
