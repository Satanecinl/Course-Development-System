'use client'

import { useState } from 'react'
import { SETTINGS_MODULES, getStatusBadge, type SettingsModule } from '@/lib/settings/settings-modules'
import { SettingsModuleCard } from '@/components/settings/settings-module-card'
import { SemesterSettingsPanel } from '@/components/settings/semester-settings-panel'
import { SchedulerConfigSettingsPanel } from '@/components/settings/scheduler-config-settings-panel'
import { WorkTimeSettingsPanel } from '@/components/settings/worktime-settings-panel'
import { Badge } from '@/components/ui/badge'
import { Settings, ArrowLeft } from 'lucide-react'

export function SettingsCenter() {
  const [activeModule, setActiveModule] = useState<string>('semester-settings')

  const currentModule = SETTINGS_MODULES.find((m) => m.key === activeModule)

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Module navigation */}
      <nav className="lg:w-72 shrink-0">
        <div className="space-y-2">
          {SETTINGS_MODULES.map((mod) => (
            <SettingsModuleCard
              key={mod.key}
              module={mod}
              isActive={activeModule === mod.key}
              onClick={() => setActiveModule(mod.key)}
            />
          ))}
        </div>
      </nav>

      {/* Right: Content area */}
      <main className="flex-1 min-w-0">
        {currentModule?.key === 'semester-settings' ? (
          <SemesterSettingsContent />
        ) : currentModule?.key === 'scheduler-config' ? (
          <SchedulerConfigSettingsPanel />
        ) : currentModule?.key === 'time-slot-worktime' ? (
          <WorkTimeSettingsPanel />
        ) : currentModule ? (
          <PlannedModuleContent module={currentModule} onBack={() => setActiveModule('semester-settings')} />
        ) : null}
      </main>
    </div>
  )
}

// ── Semester settings content (wraps existing K25-I panel) ──

function SemesterSettingsContent() {
  return <SemesterSettingsPanel />
}

// ── Planned module content ──

function PlannedModuleContent({ module, onBack }: { module: SettingsModule; onBack: () => void }) {
  const badge = getStatusBadge(module.status)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回学期设置
      </button>

      <div className="flex items-center gap-3 mb-4">
        <Settings className="w-6 h-6 text-gray-400" />
        <h3 className="text-lg font-bold text-gray-900">{module.title}</h3>
        <Badge className={`text-xs ${badge.color}`}>{badge.label}</Badge>
      </div>

      <p className="text-sm text-gray-600 mb-4">{module.description}</p>

      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-20">优先级</span>
          <span className="text-sm text-gray-700">{module.priority}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-20">推荐阶段</span>
          <span className="text-sm font-mono text-gray-700">{module.recommendedStage}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-20">风险等级</span>
          <span className={`text-sm ${module.riskLevel === 'high' ? 'text-red-600' : module.riskLevel === 'medium' ? 'text-amber-600' : 'text-green-600'}`}>
            {module.riskLevel === 'high' ? '高' : module.riskLevel === 'medium' ? '中' : '低'}
          </span>
        </div>
        {module.notes && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-gray-500 w-20">备注</span>
            <span className="text-sm text-gray-600">{module.notes}</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        该模块将在后续阶段实现。请关注 {module.recommendedStage} 阶段的开发计划。
      </p>
    </div>
  )
}
