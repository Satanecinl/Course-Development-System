// src/components/layout/app-sidebar.tsx
// App sidebar — client component for navigation
// Renders nav items filtered by user permissions

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Database,
  Upload,
  Table,
  Users,
  Settings,
  Activity,
  Sparkles,
  DoorOpen,
  type LucideIcon,
} from 'lucide-react'
import type { NavItem } from '@/lib/auth/navigation'

// Map icon names to lucide-react components
const ICON_MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'database': Database,
  'upload': Upload,
  'table': Table,
  'users': Users,
  'settings': Settings,
  'activity': Activity,
  'sparkles': Sparkles,
  'door-open': DoorOpen,
}

interface AppSidebarProps {
  navItems: NavItem[]
}

export function AppSidebar({ navItems }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col shrink-0">
      {/* Logo / Brand */}
      <div className="h-14 flex items-center px-4 border-b border-gray-700">
        <span className="text-sm font-semibold tracking-wide">排课管理系统</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.icon ?? ''] ?? LayoutDashboard
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
