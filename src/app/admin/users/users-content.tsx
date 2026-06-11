'use client'

import { Users, Plus, UserCheck, UserX, Shield, KeyRound, Pencil, Trash2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

interface Role {
  id: number
  name: string
  description: string | null
}

interface User {
  id: number
  username: string
  displayName: string
  isActive: boolean
  roles: string[]
  createdAt: string
}

export function UsersContent() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)

  // Create form state
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [creating, setCreating] = useState(false)

  // Password reset state
  const [resettingUserId, setResettingUserId] = useState<number | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  // K33-A: Edit display name state
  const [editingNameId, setEditingNameId] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)

  // K33-A: Delete user state
  const [deletingUser, setDeletingUser] = useState<{ id: number; username: string; displayName: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
      } else {
        setError(data.error || '获取用户列表失败')
      }
    } catch {
      setError('获取用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles')
      const data = await res.json()
      if (data.success) {
        setRoles(data.roles)
      }
    } catch {
      // Silent fail for roles
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [fetchUsers, fetchRoles])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || undefined,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setShowCreateForm(false)
        setNewUsername('')
        setNewPassword('')
        setNewDisplayName('')
        fetchUsers()
      } else {
        setError(data.error || '创建用户失败')
      }
    } catch {
      setError('创建用户失败')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleStatus = async (userId: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      })
      const data = await res.json()

      if (data.success) {
        fetchUsers()
      } else {
        setError(data.error || '更新用户状态失败')
      }
    } catch {
      setError('更新用户状态失败')
    }
  }

  const handleRoleToggle = async (userId: number, roleId: number, currentRoles: string[], roleName: string) => {
    const hasRole = currentRoles.includes(roleName)
    const roleObj = roles.find((r) => r.name === roleName)

    if (!roleObj) return

    // Calculate new role IDs
    const currentUser = users.find((u) => u.id === userId)
    if (!currentUser) return

    // Get current role IDs by looking up role names
    const currentRoleIds = roles
      .filter((r) => currentUser.roles.includes(r.name))
      .map((r) => r.id)

    let newRoleIds: number[]
    if (hasRole) {
      // Remove role
      newRoleIds = currentRoleIds.filter((id) => id !== roleId)
    } else {
      // Add role
      newRoleIds = [...currentRoleIds, roleId]
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleIds: newRoleIds }),
      })
      const data = await res.json()

      if (data.success) {
        fetchUsers()
        setEditingUserId(null)
      } else {
        setError(data.error || '更新角色失败')
      }
    } catch {
      setError('更新角色失败')
    }
  }

  const handleResetPassword = async (userId: number) => {
    if (!resetPassword || resetPassword.length < 8) {
      setError('密码长度不能少于 8 位')
      return
    }

    setResetting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()

      if (data.success) {
        setResettingUserId(null)
        setResetPassword('')
        alert('密码已重置，用户所有会话已撤销')
      } else {
        setError(data.error || '重置密码失败')
      }
    } catch {
      setError('重置密码失败')
    } finally {
      setResetting(false)
    }
  }

  // K33-A: Edit display name handler
  const handleEditName = async (userId: number) => {
    const trimmed = editingNameValue.trim()
    if (trimmed.length === 0) {
      setError('显示名称不能为空')
      return
    }
    if (trimmed.length > 50) {
      setError('显示名称长度不能超过 50 字符')
      return
    }

    setSavingName(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      })
      const data = await res.json()

      if (data.success) {
        setEditingNameId(null)
        setEditingNameValue('')
        toast.success('显示名称已更新')
        fetchUsers()
      } else {
        setError(data.error || '修改显示名称失败')
      }
    } catch {
      setError('修改显示名称失败')
    } finally {
      setSavingName(false)
    }
  }

  // K33-A: Delete user handler
  const handleDeleteUser = async () => {
    if (!deletingUser) return
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        toast.success(`用户 ${deletingUser.username} 已删除`)
        setDeletingUser(null)
        fetchUsers()
      } else {
        let msg = data.message || data.error || '删除用户失败'
        if (data.dependencies) {
          const deps = Object.entries(data.dependencies).map(([k, v]) => `${k}: ${v}`)
          msg += `（${deps.join(', ')}）`
        }
        setError(msg)
        toast.error(msg)
      }
    } catch {
      setError('删除用户失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">用户管理</h2>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          创建用户
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {showCreateForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">创建新用户</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  用户名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入用户名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="至少 8 位"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  显示名称
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="默认使用用户名"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-500">加载中...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">用户名</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">显示名称</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">角色</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">状态</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">创建时间</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{user.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{user.username}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{user.displayName}</td>
                  <td className="px-4 py-3 text-sm">
                    {editingUserId === user.id ? (
                      <div className="flex flex-wrap gap-2">
                        {roles.map((role) => {
                          const hasRole = user.roles.includes(role.name)
                          return (
                            <button
                              key={role.id}
                              onClick={() => handleRoleToggle(user.id, role.id, user.roles, role.name)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                hasRole
                                  ? 'bg-blue-100 text-blue-800 hover:bg-red-100 hover:text-red-800'
                                  : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-800'
                              }`}
                            >
                              <Shield className="w-3 h-3" />
                              {role.name}
                              {hasRole && ' ✓'}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          完成
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              role === 'ADMIN'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.isActive ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {resettingUserId === user.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="新密码（至少 8 位）"
                          className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 w-32"
                          minLength={8}
                        />
                        <button
                          onClick={() => handleResetPassword(user.id)}
                          disabled={resetting}
                          className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 rounded disabled:opacity-50"
                        >
                          {resetting ? '...' : '确认'}
                        </button>
                        <button
                          onClick={() => { setResettingUserId(null); setResetPassword('') }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded"
                        >
                          取消
                        </button>
                      </div>
                    ) : editingNameId === user.id ? (
                      /* K33-A: Inline edit display name */
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          placeholder="新显示名称"
                          className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 w-40"
                          maxLength={50}
                        />
                        <button
                          onClick={() => handleEditName(user.id)}
                          disabled={savingName}
                          className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded disabled:opacity-50"
                        >
                          {savingName ? '...' : '保存'}
                        </button>
                        <button
                          onClick={() => { setEditingNameId(null); setEditingNameValue('') }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {/* K33-A: Edit display name button */}
                        <button
                          onClick={() => { setEditingNameId(user.id); setEditingNameValue(user.displayName) }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                          title="修改显示名称"
                        >
                          <Pencil className="w-3 h-3" />
                          编辑
                        </button>
                        <button
                          onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
                        >
                          <Shield className="w-3 h-3" />
                          {editingUserId === user.id ? '取消' : '角色'}
                        </button>
                        <button
                          onClick={() => { setResettingUserId(user.id); setResetPassword('') }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200"
                        >
                          <KeyRound className="w-3 h-3" />
                          重置密码
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.isActive)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            user.isActive
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="w-3 h-3" />
                              停用
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3 h-3" />
                              启用
                            </>
                          )}
                        </button>
                        {/* K33-A: Delete button */}
                        <button
                          onClick={() => setDeletingUser({ id: user.id, username: user.username, displayName: user.displayName })}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200"
                          title="删除用户（仅允许无业务记录的用户）"
                        >
                          <Trash2 className="w-3 h-3" />
                          删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* K33-A: Delete user confirmation dialog */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除用户？</h3>
            <p className="text-sm text-gray-600 mb-4">
              该操作只允许删除无业务记录的用户。已有业务记录的用户应使用&ldquo;停用&rdquo;。
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div><span className="font-medium">用户名：</span>{deletingUser.username}</div>
              <div><span className="font-medium">显示名称：</span>{deletingUser.displayName}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingUser(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
