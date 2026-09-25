// Pre-defined audit actions (moved to separate file to avoid "use server" issues)
export const AuditActions = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  SIGNUP_SUCCESS: 'signup_success',
  SIGNUP_FAILED: 'signup_failed',
  LOGOUT: 'logout',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  PASSWORD_CHANGED: 'password_changed',
  MFA_ENROLLED: 'mfa_enrolled',
  MFA_VERIFIED: 'mfa_verified',
  MFA_UNENROLLED: 'mfa_unenrolled',
  MFA_CHALLENGED: 'mfa_challenged',
  MFA_CHALLENGE_CREATED: 'mfa_challenge_created',
  ADMIN_LOGIN: 'admin_login',
  ADMIN_ACTION: 'admin_action',
  ORDER_CREATED: 'order_created',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_FILE_UPLOADED: 'order_file_uploaded',
  PAYMENT_SUBMITTED: 'payment_submitted',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
  SETTINGS_CHANGED: 'settings_changed',
  USER_ROLE_CHANGED: 'user_role_changed',
  // Credential stuffing detection
  CREDENTIAL_STUFFING_DETECTED: 'credential_stuffing_detected',
  BRUTE_FORCE_DETECTED: 'brute_force_detected',
} as const

export type AuditAction = typeof AuditActions[keyof typeof AuditActions]