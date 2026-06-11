// src/components/layout/app-sidebar.tsx
// App sidebar — client component for navigation
// Renders nav items filtered by user permissions
// K30-A: collapsible — width 14rem (expanded) / 3.5rem (collapsed), icon-only mode,
// localStorage persistence, accessible title/aria-label on every nav link.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useSyncExternalStore } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Database,
  Upload,
  Table,
  Users,
  Settings,
  Activity,
  Sparkles,
  DoorOpen,
  ScrollText,
  CheckCircle,
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
  'scroll-text': ScrollText,
  'check-circle': CheckCircle,
}

// K30-A: localStorage key for collapsed state.
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

/**
 * K30-A: useSyncExternalStore-based localStorage subscription.
 *
 * Reads / writes `sidebar-collapsed` to localStorage without triggering the
 * `react-hooks/set-state-in-effect` rule. The `getServerSnapshot` returns the
 * default (`false`) so the server-rendered HTML always matches the first
 * client render; the real stored value is picked up on the next render via
 * `useSyncExternalStore`'s `subscribe` callback firing `storage` events.
 */
function subscribeToCollapsed(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === SIDEBAR_COLLAPSED_KEY) callback()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

function getClientSnapshot(): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // Ignore — return default
  }
  return false
}

function getServerSnapshot(): boolean {
  return false
}

export function setSidebarCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? 'true' : 'false')
  } catch {
    // Ignore — UI state is still updated in the component
  }
}

interface AppSidebarProps {
  navItems: NavItem[]
}

export function AppSidebar({ navItems }: AppSidebarProps) {
  const pathname = usePathname()
  // K30-A: collapsed state with localStorage persistence.
  // useSyncExternalStore avoids setState-in-useEffect and any hydration mismatch.
  const collapsed = useSyncExternalStore(
    subscribeToCollapsed,
    getClientSnapshot,
    getServerSnapshot,
  )

  const toggleCollapsed = useCallback(() => {
    setSidebarCollapsed(!collapsed)
    // Force re-read by dispatching a manual storage event isn't ideal; instead
    // we trigger a state change via a local event the component subscribes to.
    // Simplest: rely on the same `storage` event by writing a fresh value and
    // emitting a synthetic storage event the component's `subscribe` will see.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SIDEBAR_COLLAPSED_KEY,
          newValue: collapsed ? 'false' : 'true',
        }),
      )
    }
  }, [collapsed])

  // K30-A: width classes — w-56 (14rem) when expanded, w-14 (3.5rem) when collapsed.
  const widthClass = collapsed ? 'w-14' : 'w-56'
  // K30-A: label visibility — hidden when collapsed, shown when expanded.
  const labelVisibilityClass = collapsed ? 'hidden' : 'inline'
  // K30-A: system name visibility — same gate as label.
  const brandVisibilityClass = collapsed ? 'hidden' : 'inline'
  // K30-A: tooltip on toggle button.
  const toggleTitle = collapsed ? '展开侧边栏' : '折叠侧边栏'
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft

  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="主导航"
      className={`${widthClass} bg-gray-900 text-gray-100 flex flex-col shrink-0 transition-[width] duration-200`}
    >
      {/* Logo / Brand + collapse toggle */}
      <div className="h-14 flex items-center px-4 border-b border-gray-700">
        <span
          className={`${brandVisibilityClass} text-sm font-semibold tracking-wide whitespace-nowrap overflow-hidden`}
        >
          排课管理系统
        </span>
        {/* K30-A: collapse toggle button. Pushed to right via ml-auto. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={toggleTitle}
          aria-label={toggleTitle}
          aria-expanded={!collapsed}
          aria-controls="primary-nav"
          className="ml-auto p-1.5 rounded-md text-gray-400 hover:bg-gray-800 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-600"
        >
          <ToggleIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav id="primary-nav" className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.icon ?? ''] ?? LayoutDashboard
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className={`${labelVisibilityClass} whitespace-nowrap overflow-hidden`}>
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
