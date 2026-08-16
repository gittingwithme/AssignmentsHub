

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstileToken(token: string): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  
  if (!secretKey) {
    console.warn('Turnstile secret key not configured - skipping verification')
    return { success: true }
  }

  if (!token) {
    return { success: false, error: 'Captcha token is required' }
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
      }),
    })

    const data = await response.json()

    if (data.success) {
      return { success: true }
    }

    console.error('Turnstile verification failed:', data['error-codes'])
    return { success: false, error: 'Captcha verification failed' }
  } catch (error) {
    console.error('Turnstile verification error:', error)
    return { success: false, error: 'Captcha verification failed' }
  }
}
