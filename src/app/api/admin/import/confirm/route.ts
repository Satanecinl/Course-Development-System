import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import type { ImportStrategy } from '@/lib/import/importer'
import { confirmImportBatchDryRun, confirmImportBatch } from '@/lib/import/importer'

interface ConfirmRequest {
  batchId: number
  strategy: ImportStrategy
  dryRun?: boolean
  confirmText?: string
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const body: ConfirmRequest = await request.json()

    if (!body.batchId || typeof body.batchId !== 'number') {
      return NextResponse.json({ success: false, error: '缺少 batchId' }, { status: 400 })
    }

    if (body.strategy !== 'UPSERT_BY_NATURAL_KEY') {
      return NextResponse.json({ success: false, error: `不支持的 strategy: ${body.strategy}` }, { status: 400 })
    }

    // dryRun 模式
    if (body.dryRun === true) {
      const plan = await confirmImportBatchDryRun(body.batchId, body.strategy)
      return NextResponse.json({ success: true, dryRun: true, plan })
    }

    // 真实 confirm 模式
    if (body.confirmText !== 'CONFIRM_IMPORT') {
      return NextResponse.json(
        { success: false, error: '真实导入需要 confirmText = "CONFIRM_IMPORT"' },
        { status: 400 },
      )
    }

    const result = await confirmImportBatch(body.batchId, body.strategy)
    return NextResponse.json({ success: true, dryRun: false, result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
