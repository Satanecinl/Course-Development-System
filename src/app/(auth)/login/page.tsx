// src/app/(auth)/login/page.tsx
// Login page — redirects to dashboard if already authenticated

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants'
import { getCurrentUser } from '@/lib/auth/current-user'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // If already logged in, redirect
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionToken) {
    const user = await getCurrentUser(sessionToken)
    if (user) {
      if (user.permissions.has('schedule:view')) redirect('/dashboard')
    }
  }

  const params = await searchParams
  const errorParam = params.error

  let errorMessage: string | null = null
  if (errorParam === 'no-permission') {
    errorMessage = '当前账号无可访问模块'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-center text-gray-900">
            排课管理系统
          </h1>
          <p className="mt-2 text-sm text-center text-gray-500">
            请使用分配的账号登录
          </p>

          <LoginForm serverError={errorMessage} />
        </div>
      </div>
    </div>
  )
}
