const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128

interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
}

export function validatePassword(password: string, email?: string, fullName?: string): PasswordValidationResult {
  const errors: string[] = []
  let strength: 'weak' | 'medium' | 'strong' = 'weak'

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be less than ${PASSWORD_MAX_LENGTH} characters`)
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  const lowerPassword = password.toLowerCase()
  if (email && lowerPassword.includes(email.toLowerCase().split('@')[0])) {
    errors.push('Password cannot contain your email')
  }

  if (fullName) {
    const nameParts = fullName.toLowerCase().split(/\s+/)
    for (const part of nameParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        errors.push('Password cannot contain your name')
        break
      }
    }
  }

  const commonPasswords = [
    'password', 'password123', 'qwerty', 'letmein', 'welcome',
    'monkey', 'dragon', 'master', 'abc123', '111111', '123456',
    'password1', 'admin', 'login', 'welcome1', 'changeme',
  ]
  if (commonPasswords.some(common => lowerPassword.includes(common))) {
    errors.push('Password is too common')
  }

  if (errors.length === 0) {
    if (password.length >= 16 && /[^A-Za-z0-9]/.test(password)) {
      strength = 'strong'
    } else {
      strength = 'medium'
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
  }
}

export function getPasswordStrengthLabel(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'strong': return 'Strong'
    case 'medium': return 'Medium'
    default: return 'Weak'
  }
}

export function getPasswordStrengthColor(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'strong': return 'text-green-400'
    case 'medium': return 'text-yellow-400'
    default: return 'text-red-400'
  }
}
