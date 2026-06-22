// src/app/403/page.tsx
// Forbidden page — shown when user lacks permission for a route

import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm mx-auto text-center">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-900">无权访问</h1>
          <p className="mt-4 text-gray-600">
            当前账号没有访问该页面的权限
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard"
              className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
            >
              返回排课展示
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
