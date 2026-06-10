'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  fetchPermissionRoles,
  getPermissionRoleErrorMessage,
  type PermissionRolesData,
  type PermissionRow,
} from '@/lib/settings/permission-roles-client'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  Lock,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Users,
  KeyRound,
  ListChecks,
  GitBranch,
  UserCog,
} from 'lucide-react'

export function PermissionRolesSettingsPanel() {
  const [data, setData] = useState<PermissionRolesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPermissionRoles()
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    setLoading(true)
    setError(null)
    fetchPermissionRoles()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <div className="flex items-center gap-2 text-red-600 mb-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">加载失败</span>
        </div>
        <p className="text-sm text-red-500">{getPermissionRoleErrorMessage(error)}</p>
        <button onClick={reload} className="mt-2 text-sm text-blue-600 hover:underline">
          重试
        </button>
      </div>
    )
  }

  if (!data) return null

  const { summary, roles, permissions, rolePermissionMatrix, userRoleOverview, keyPermissionStatus } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">权限与角色设置</h2>
          <Badge className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200">
            基础只读版
          </Badge>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* Read-only notice (top-level) */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-start gap-2">
        <Lock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700">当前为基础只读版，不提供编辑功能。</p>
          <p>暂不支持编辑角色、权限或用户角色绑定。如需修改请在后续阶段设计配置化方案。</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="角色数" value={String(summary.roleCount)} icon={<Users className="w-4 h-4" />} />
        <SummaryCard
          label="权限 key 数"
          value={String(summary.permissionKeyCount)}
          ok
          icon={<KeyRound className="w-4 h-4" />}
        />
        <SummaryCard
          label="用户数"
          value={String(summary.userCount)}
          icon={<UserCog className="w-4 h-4" />}
        />
        <SummaryCard
          label="用户-角色绑定"
          value={String(summary.userRoleBindingCount)}
          ok={summary.userRoleBindingCount > 0}
          icon={<GitBranch className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="系统设置管理员" value={String(summary.systemSettingManagers)} />
        <SummaryCard label="调课管理员" value={String(summary.adjustmentManagers)} />
        <SummaryCard label="导入管理员" value={String(summary.importManagers)} />
        <SummaryCard label="用户管理员" value={String(summary.userManagers)} />
      </div>

      {/* Role list */}
      <Section icon={<Users className="w-4 h-4" />} title="角色列表">
        {roles.length === 0 ? (
          <div className="text-sm text-gray-500">暂无角色</div>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.key} className="p-3 rounded bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 font-mono">
                    {r.key}
                  </Badge>
                  <span className="text-sm font-medium text-gray-900">{r.name}</span>
                  {r.builtIn ? (
                    <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                      系统内置
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200">
                      自定义
                    </Badge>
                  )}
                  <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                    <Lock className="w-3 h-3" /> 只读
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{r.description}</p>
                <div className="text-xs text-gray-500 mt-1 flex items-center gap-4">
                  <span>权限数: <code className="bg-gray-100 px-1">{r.permissionCount}</code></span>
                  <span>用户数: <code className="bg-gray-100 px-1">{r.userCount}</code></span>
                  <span className="text-gray-400">来源: {r.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Permission list grouped by category */}
      <Section icon={<KeyRound className="w-4 h-4" />} title="权限列表 (按 category 分组)">
        <PermissionsGrouped permissions={permissions} />
      </Section>

      {/* Role-Permission matrix */}
      <Section icon={<ListChecks className="w-4 h-4" />} title="角色-权限矩阵">
        <RolePermissionMatrix matrix={rolePermissionMatrix} permissions={permissions} />
      </Section>

      {/* User-Role binding overview */}
      <Section icon={<GitBranch className="w-4 h-4" />} title="用户-角色绑定概览">
        {userRoleOverview.length === 0 ? (
          <div className="text-sm text-gray-500">暂无用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">ID</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">用户名</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">显示名</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">激活</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">角色</th>
                </tr>
              </thead>
              <tbody>
                {userRoleOverview.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-4 font-mono text-xs text-gray-500">{u.id}</td>
                    <td className="py-1.5 pr-4 text-gray-700">{u.username}</td>
                    <td className="py-1.5 pr-4 text-gray-700">{u.name ?? '-'}</td>
                    <td className="py-1.5 pr-4">
                      {u.isActive ? (
                        <Badge className="text-xs bg-green-100 text-green-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 激活
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-gray-100 text-gray-700 inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> 停用
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 pr-4">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-gray-400">无角色绑定</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge
                              key={r}
                              className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200 font-mono"
                            >
                              {r}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">
              展示字段: id / username / displayName / isActive / roles。
              敏感字段 (passwordHash / tokenHash / sessionToken / email / phone) 不返回。
            </p>
          </div>
        )}
      </Section>

      {/* Key permission status */}
      <Section icon={<ShieldCheck className="w-4 h-4" />} title="关键权限状态">
        <div className="space-y-2">
          {keyPermissionStatus.map((kp) => (
            <div
              key={kp.key}
              className="flex items-start gap-2 p-3 rounded bg-gray-50 border border-gray-100"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">
                    {kp.key}
                  </code>
                  <span className="text-sm font-medium text-gray-900">{kp.label}</span>
                  {kp.roles.length === 0 ? (
                    <Badge className="text-xs bg-red-100 text-red-700 inline-flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> 暂无角色持有
                    </Badge>
                  ) : (
                    kp.roles.map((r) => (
                      <Badge
                        key={r}
                        className="text-xs bg-green-100 text-green-700 border-green-200 font-mono inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" /> {r}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">{kp.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Read-only bottom notice */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-500 space-y-1">
          <p>本面板仅用于展示当前 RBAC 配置状态，不修改任何数据。</p>
          <p>
            角色-权限绑定由 <code className="font-mono">seed-auth.ts</code> 初始化，用户-角色绑定由{' '}
            <code className="font-mono">/admin/users</code> 维护。如需修改，请在下一阶段引入编辑能力。
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  ok,
  danger,
  icon,
}: {
  label: string
  value: string
  ok?: boolean
  danger?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div
      className={`bg-white rounded-lg border p-4 ${
        danger
          ? 'border-red-300 bg-red-50'
          : ok
            ? 'border-green-200'
            : 'border-gray-200'
      }`}
    >
      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div
        className={`text-2xl font-bold ${
          danger ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

function PermissionsGrouped({ permissions }: { permissions: PermissionRow[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionRow[]>()
    for (const p of permissions) {
      const list = map.get(p.category) ?? []
      list.push(p)
      map.set(p.category, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [permissions])

  return (
    <div className="space-y-3">
      {grouped.map(([category, list]) => (
        <div key={category}>
          <div className="text-xs font-medium text-gray-500 mb-1">{category}</div>
          <div className="space-y-1">
            {list.map((p) => (
              <div
                key={p.key}
                className="flex items-center gap-2 flex-wrap p-2 rounded border border-gray-100 bg-gray-50"
              >
                <code className="text-xs font-mono bg-white px-1 py-0.5 rounded border border-gray-200">
                  {p.key}
                </code>
                <span className="text-sm text-gray-700">{p.description}</span>
                {p.critical ? (
                  <Badge className="text-xs bg-red-100 text-red-700 border-red-200">
                    关键
                  </Badge>
                ) : null}
                {p.inDatabase ? null : (
                  <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                    待配置化
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RolePermissionMatrix({
  matrix,
  permissions,
}: {
  matrix: Array<{ roleKey: string; permissions: string[] }>
  permissions: PermissionRow[]
}) {
  if (matrix.length === 0) {
    return <div className="text-sm text-gray-500">暂无角色</div>
  }

  // Distinct permission keys across all roles (preserve first-seen order from permissions list)
  const allKeys: string[] = []
  const seen = new Set<string>()
  for (const p of permissions) {
    if (!seen.has(p.key)) {
      seen.add(p.key)
      allKeys.push(p.key)
    }
  }

  const matrixByRole = new Map<string, Set<string>>()
  for (const m of matrix) {
    matrixByRole.set(m.roleKey, new Set(m.permissions))
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-1.5 pr-3 font-medium text-gray-500 sticky left-0 bg-white">
              权限
            </th>
            {matrix.map((m) => (
              <th
                key={m.roleKey}
                className="text-left py-1.5 px-3 font-medium text-gray-500 font-mono"
              >
                {m.roleKey}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allKeys.map((k) => {
            const perm = permissions.find((p) => p.key === k)
            return (
              <tr key={k} className="border-t border-gray-100">
                <td className="py-1 pr-3 sticky left-0 bg-white">
                  <div className="flex items-center gap-1">
                    <code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">
                      {k}
                    </code>
                    {perm?.critical ? (
                      <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                        关键
                      </Badge>
                    ) : null}
                  </div>
                </td>
                {matrix.map((m) => {
                  const has = matrixByRole.get(m.roleKey)?.has(k) ?? false
                  return (
                    <td key={m.roleKey} className="py-1 px-3 text-center">
                      {has ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 inline" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-300 inline" />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-2">
        ✓ 表示该角色拥有该权限, ✗ 表示不拥有。来源: 数据库 RolePermission 表 (与 seed-auth.ts 一致)。
      </p>
    </div>
  )
}
