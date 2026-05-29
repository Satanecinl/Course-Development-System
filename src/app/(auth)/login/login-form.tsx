'use client'

// src/app/(auth)/login/login-form.tsx
// Login form client component

import { useActionState } from 'react'
import { loginAction, type LoginResult } from './actions'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface LoginFormProps {
  serverError: string | null
}

export function LoginForm({ serverError }: LoginFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<
    LoginResult | null,
    FormData
  >(loginAction, null)

  // Handle successful login redirect
  useEffect(() => {
    if (state?.success && state.redirect) {
      router.push(state.redirect)
    }
  }, [state, router])

  const error = state?.error ?? serverError

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="username"
          className="block text-sm font-medium text-gray-700"
        >
          用户名
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="请输入用户名"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
        >
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="请输入密码"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? '登录中...' : '登录'}
      </button>
    </form>
  )
}
