// src/components/layout/app-header.tsx
// App header — client component
// Shows system name, current user info, logout button

'use client'

import { LogOut } from 'lucide-react'

interface AppHeaderProps {
  displayName: string
  roles: string[]
}

export function AppHeader({ displayName, roles }: AppHeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-800">排课管理系统</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* User info */}
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">{displayName}</p>
          {roles.length > 0 && (
            <p className="text-xs text-gray-400">{roles.join(', ')}</p>
          )}
        </div>

        {/* Logout */}
        <a
          href="/logout"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          title="退出登录"
        >
          <LogOut className="w-4 h-4" />
          <span>退出</span>
        </a>
      </div>
    </header>
  )
}
