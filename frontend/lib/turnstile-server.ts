

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstileToken(token: string): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY

  if (!secretKey) {
    // Fail CLOSED in production: a missing secret key must never silently
    // disable bot protection on the auth endpoints.
    if (process.env.NODE_ENV === 'production') {
      console.error('Turnstile secret key not configured - blocking authentication')
      return { success: false, error: 'Captcha verification is unavailable. Please try again later.' }
    }
    console.warn('Turnstile secret key not configured - skipping verification (dev only)')
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
