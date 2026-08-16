const FILE_SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4B, 0x03, 0x04],
    [0x50, 0x4B, 0x05, 0x06],
    [0x50, 0x4B, 0x07, 0x08],
  ],
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/heic': [[0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
  'image/heif': [[0x66, 0x74, 0x79, 0x70, 0x6D, 0x69, 0x66, 0x31]],
}

const EXTENSION_MIME_MAP: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic'],
  heif: ['image/heif'],
}

const DANGEROUS_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
  'msi', 'msp', 'cpl', 'dll', 'ocx', 'sys', 'drv', 'sh', 'bash',
  'php', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb', 'sh',
]

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export interface FileValidationResult {
  valid: boolean
  errors: string[]
  detectedMimeType?: string
  sanitizedFilename?: string
}

function checkFileSignature(buffer: ArrayBuffer, claimedMimeType: string): boolean {
  const signatures = FILE_SIGNATURES[claimedMimeType]
  if (!signatures) return true

  const bytes = new Uint8Array(buffer.slice(0, 16))

  for (const sig of signatures) {
    let match = true
    for (let i = 0; i < sig.length; i++) {
      if (bytes[i] !== sig[i]) {
        match = false
        break
      }
    }
    if (match) return true
  }

  return false
}

export function validateFileUpload(
  file: File,
  allowedCategories: ('DOCX' | 'PDF' | 'Image')[]
): FileValidationResult {
  const errors: string[] = []

  if (file.size === 0) {
    errors.push('File is empty')
    return { valid: false, errors }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(`File size exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`)
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    errors.push('File type not allowed for security reasons')
  }

  const allowedExtensions: string[] = []
  const allowedMimeTypes: string[] = []

  for (const category of allowedCategories) {
    if (category === 'DOCX') {
      allowedExtensions.push('docx')
      allowedMimeTypes.push(...EXTENSION_MIME_MAP.docx)
    } else if (category === 'PDF') {
      allowedExtensions.push('pdf')
      allowedMimeTypes.push(...EXTENSION_MIME_MAP.pdf)
    } else if (category === 'Image') {
      allowedExtensions.push('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif')
      allowedMimeTypes.push(
        ...EXTENSION_MIME_MAP.jpg,
        ...EXTENSION_MIME_MAP.jpeg,
        ...EXTENSION_MIME_MAP.png,
        ...EXTENSION_MIME_MAP.webp,
        ...EXTENSION_MIME_MAP.heic,
        ...EXTENSION_MIME_MAP.heif
      )
    }
  }

  if (!allowedExtensions.includes(extension)) {
    errors.push(`File extension .${extension} is not allowed. Allowed: ${allowedExtensions.join(', ')}`)
  }

  if (!allowedMimeTypes.includes(file.type)) {
    errors.push(`MIME type ${file.type} is not allowed`)
  }

  const sanitizedFilename = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255)

  return {
    valid: errors.length === 0,
    errors,
    sanitizedFilename,
  }
}

export async function validateFileSignature(file: File): Promise<FileValidationResult> {
  const errors: string[] = []

  try {
    const buffer = await file.slice(0, 16).arrayBuffer()
    const signatureValid = checkFileSignature(buffer, file.type)
    
    if (!signatureValid) {
      errors.push('File content does not match its claimed type')
    }
  } catch {
    errors.push('Could not verify file signature')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function generateSecureFilePath(userId: string, orderId: string, category: string, extension: string): string {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 10)
  const sanitizedExt = extension.replace(/[^a-z0-9]/g, '')
  
  return `orders/${userId}/${orderId}/${category}-${timestamp}-${randomSuffix}.${sanitizedExt}`
}
