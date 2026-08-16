import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

// Create a DOMPurify instance for server-side use
const window = new JSDOM('').window
const purify = DOMPurify(window)

// Server-side sanitization
export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'u', 's', 'strike',
      'p', 'br', 'div', 'span',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'pre', 'code',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'class', 'id', 'style',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  })
}

export function sanitizeText(text: string): string {
  return purify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
}

// Client-side sanitization (uses browser DOMPurify)
let clientPurify: typeof DOMPurify | null = null

export function getClientPurify(): typeof DOMPurify {
  if (typeof window !== 'undefined' && !clientPurify) {
    clientPurify = DOMPurify
  }
  return clientPurify!
}

export function sanitizeHtmlClient(html: string): string {
  if (typeof window === 'undefined') return sanitizeHtml(html)
  return getClientPurify().sanitize(html, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'u', 's', 'strike',
      'p', 'br', 'div', 'span',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'pre', 'code',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'class', 'id', 'style',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
}

// Specific sanitizers for different input types
export function sanitizeUserInput(input: string): string {
  // For plain text inputs - strip all HTML
  return sanitizeText(input).trim()
}

export function sanitizeRichText(input: string): string {
  // For rich text areas - allow basic formatting
  return sanitizeHtml(input)
}

export function sanitizeUrl(url: string): string {
  // Only allow safe protocols
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:']
  try {
    const parsed = new URL(url)
    if (!safeProtocols.includes(parsed.protocol)) {
      return ''
    }
    return url
  } catch {
    return ''
  }
}

export function sanitizeFilename(filename: string): string {
  // Remove dangerous characters from filenames
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255)
}

// Sanitize object recursively (for form data)
export function sanitizeObject<T extends Record<string, any>>(obj: T, options: {
  allowedHtmlFields?: string[]
} = {}): T {
  const { allowedHtmlFields = [] } = options
  const result = {} as T
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (allowedHtmlFields.includes(key)) {
        result[key as keyof T] = sanitizeHtml(value) as any
      } else {
        result[key as keyof T] = sanitizeText(value) as any
      }
    } else if (Array.isArray(value)) {
      result[key as keyof T] = value.map(v => 
        typeof v === 'string' ? sanitizeText(v) : v
      ) as any
    } else if (value && typeof value === 'object') {
      result[key as keyof T] = sanitizeObject(value, options)
    } else {
      result[key as keyof T] = value
    }
  }
  
  return result
}