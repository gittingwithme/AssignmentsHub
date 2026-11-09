const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 128

interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
}

export function validatePassword(password: string, _email?: string, _fullName?: string): PasswordValidationResult {
  const errors: string[] = []
  let strength: 'weak' | 'medium' | 'strong' = 'weak'

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  }

  if (password && password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be less than ${PASSWORD_MAX_LENGTH} characters`)
  }

  if (password && password.length >= 10 && (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password))) {
    strength = 'strong'
  } else if (password && password.length >= 6) {
    strength = 'medium'
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
    default: return 'text-zinc-400'
  }
}
