'use client'

import { Badge } from '@/components/ui/badge'
import { getStatusBadge, type SettingsModule, type ModuleStatus } from '@/lib/settings/settings-modules'
import { ChevronRight, CheckCircle, Clock, MapPin, Lock } from 'lucide-react'

interface SettingsModuleCardProps {
  module: SettingsModule
  isActive: boolean
  onClick: () => void
}

function getStatusIcon(status: ModuleStatus) {
  switch (status) {
    case 'ready':
      return <CheckCircle className="w-4 h-4 text-green-600" />
    case 'planned':
      return <Clock className="w-4 h-4 text-blue-500" />
    case 'coming-soon':
      return <MapPin className="w-4 h-4 text-amber-500" />
    case 'roadmap':
      return <Lock className="w-4 h-4 text-gray-400" />
  }
}

export function SettingsModuleCard({ module, isActive, onClick }: SettingsModuleCardProps) {
  const badge = getStatusBadge(module.status)
  const isClickable = module.status === 'ready'

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      className={`
        w-full text-left px-4 py-3 rounded-lg border transition-colors
        ${isActive
          ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
          : isClickable
            ? 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
            : 'bg-gray-50 border-gray-100 cursor-default'
        }
      `}
      disabled={!isClickable}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(module.status)}
          <span className={`font-medium text-sm ${isActive ? 'text-blue-900' : isClickable ? 'text-gray-900' : 'text-gray-500'}`}>
            {module.title}
          </span>
          <Badge className={`text-xs ${badge.color}`}>{badge.label}</Badge>
        </div>
        {isClickable && (
          <ChevronRight className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-300'}`} />
        )}
      </div>
      <p className={`mt-1 text-xs leading-relaxed ${isActive ? 'text-blue-700' : isClickable ? 'text-gray-500' : 'text-gray-400'}`}>
        {module.description}
      </p>
      {module.status !== 'ready' && (
        <p className="mt-1 text-xs text-gray-400">
          推荐阶段：{module.recommendedStage}
        </p>
      )}
    </button>
  )
}
