// src/lib/auth/constants.ts
// Auth system constants

export const SESSION_DURATION_HOURS = 24
export const SESSION_COOKIE_NAME = 'session_token'
export const AUTH_CLAIMS_COOKIE_NAME = 'auth_claims'
export const PASSWORD_MIN_LENGTH = 8

// HMAC secret for signing auth claims cookie
// Production MUST set AUTH_COOKIE_SECRET env var
export const DEV_FALLBACK_COOKIE_SECRET = 'dev-only-hmac-secret-do-not-use-in-prod'

// Default passwords for development only
// In production, must use INITIAL_ADMIN_PASSWORD / INITIAL_USER_PASSWORD env vars
export const DEV_DEFAULT_ADMIN_PASSWORD = 'admin123456'
export const DEV_DEFAULT_USER_PASSWORD = 'user123456'
