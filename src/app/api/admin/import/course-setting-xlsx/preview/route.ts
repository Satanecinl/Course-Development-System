/**
 * L3 API Route — Course Setting XLSX Preview
 *
 * POST /api/admin/import/course-setting-xlsx/preview
 *
 * Preview-only endpoint for 课程设置 xlsx parsing. No DB writes, no
 * ImportBatch creation, no TeachingTask/Course/Teacher/ClassGroup/ScheduleSlot
 * writes. Read-only parse + response.
 *
 * Permission: import:manage
 * Accepts: .xlsx only
 * Rejects: .docx
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { buildCourseSettingXlsxPreview } from '@/lib/import/course-setting-xlsx-preview'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: '请上传 .xlsx 文件',
          message: '未收到文件',
          previewOnly: true,
        },
        { status: 400 },
      )
    }

    const fileName = file.name.toLowerCase()

    if (!fileName.endsWith('.xlsx')) {
      const detail = fileName.endsWith('.docx')
        ? '不支持 .docx 格式，请使用 .xlsx 课程设置文件'
        : `收到的文件: ${file.name}，仅支持 .xlsx 格式`
      return NextResponse.json(
        {
          success: false,
          error: '只支持 .xlsx 格式',
          message: detail,
          previewOnly: true,
        },
        { status: 400 },
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: '文件过大',
          message: `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，限制 20MB`,
          previewOnly: true,
        },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const result = await buildCourseSettingXlsxPreview(buffer, file.name)

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        error: '服务器错误',
        message,
        previewOnly: true,
      },
      { status: 500 },
    )
  }
}
