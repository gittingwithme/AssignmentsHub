const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/'

export async function checkPasswordPwned(password: string): Promise<{ pwned: boolean; count: number }> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  
  const prefix = hashHex.substring(0, 5)
  const suffix = hashHex.substring(5)
  
  try {
    const response = await fetch(`${HIBP_API_URL}${prefix}`, {
      headers: {
        'User-Agent': 'AssignmentsHub/1.0',
        'Add-Padding': 'true',
      },
    })
    
    if (!response.ok) {
      console.warn('HIBP API error:', response.status)
      return { pwned: false, count: 0 }
    }
    
    const text = await response.text()
    const lines = text.trim().split('\n')
    
    for (const line of lines) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix === suffix) {
        return { pwned: true, count: parseInt(count, 10) }
      }
    }
    
    return { pwned: false, count: 0 }
  } catch (error) {
    console.warn('Failed to check pwned passwords:', error)
    return { pwned: false, count: 0 }
  }
}

export function validatePasswordNotPwned(password: string): Promise<{ valid: boolean; error?: string }> {
  return checkPasswordPwned(password).then(result => {
    if (result.pwned) {
      return { 
        valid: false, 
        error: `This password has appeared in ${result.count} data breaches. Please choose a different password.` 
      }
    }
    return { valid: true }
  })
}