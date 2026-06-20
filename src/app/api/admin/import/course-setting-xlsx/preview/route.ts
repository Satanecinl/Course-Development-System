/**
 * L3/L6-B API Route — Course Setting XLSX Preview
 *
 * POST /api/admin/import/course-setting-xlsx/preview
 *
 * Preview-only endpoint for 课程设置 xlsx parsing. No DB writes, no
 * ImportBatch creation, no TeachingTask/Course/Teacher/ClassGroup/ScheduleSlot
 * writes. Read-only parse + response.
 *
 * L6-B: accepts targetSemesterId → semester-scoped dry-run + match summary.
 *
 * Permission: import:manage
 * Accepts: .xlsx only
 * Rejects: .docx
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { buildCourseSettingXlsxPreviewWithSemester } from '@/lib/import/course-setting-xlsx-preview'
import { getRequireExplicitSemesterForImport } from '@/lib/settings/import-rule-config'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

const ERROR_MISSING_TARGET_SEMESTER = 'MISSING_TARGET_SEMESTER'
const ERROR_INVALID_TARGET_SEMESTER = 'INVALID_TARGET_SEMESTER'
const ERROR_TARGET_SEMESTER_NOT_FOUND = 'TARGET_SEMESTER_NOT_FOUND'

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
          canConfirm: false,
          canApply: false,
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
          canConfirm: false,
          canApply: false,
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
          canConfirm: false,
          canApply: false,
        },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ── L6-B: targetSemesterId validation ───────────────────────────────
    const targetSemesterIdRaw = formData.get('targetSemesterId')
    const requireExplicit = await getRequireExplicitSemesterForImport()

    if (targetSemesterIdRaw == null || targetSemesterIdRaw === '') {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_MISSING_TARGET_SEMESTER,
          message: '请选择导入目标学期',
          previewOnly: true,
          canConfirm: false,
          canApply: false,
          requireExplicitSemesterForImport: requireExplicit,
          targetSemesterRequired: true,
        },
        { status: 400 },
      )
    }

    const targetSemesterId = Number(targetSemesterIdRaw)
    if (!Number.isInteger(targetSemesterId) || targetSemesterId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_INVALID_TARGET_SEMESTER,
          message: '目标学期 ID 无效',
          previewOnly: true,
          canConfirm: false,
          canApply: false,
        },
        { status: 400 },
      )
    }

    // Resolve active semester ID for isActiveSemester flag
    let activeSemesterId: number | null = null
    try {
      const { prisma } = await import('@/lib/prisma')
      const activeSem = await prisma.semester.findFirst({
        where: { isActive: true },
        select: { id: true },
      })
      activeSemesterId = activeSem?.id ?? null
    } catch {
      // ignore — will set isActiveSemester=false
    }

    // ── L6-B1: optional maxPreviewRows from form ────────────────────────
    const maxPreviewRowsRaw = formData.get('maxPreviewRows')
    let maxPreviewRows = 50
    if (maxPreviewRowsRaw != null && maxPreviewRowsRaw !== '') {
      const parsed = Number(maxPreviewRowsRaw)
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 200) {
        maxPreviewRows = parsed
      }
    }

    // ── L6-B: Semester-aware preview with dry-run ──────────────────────
    const result = await buildCourseSettingXlsxPreviewWithSemester(
      buffer,
      file.name,
      targetSemesterId,
      activeSemesterId,
      requireExplicit,
      { maxPreviewRows },
    )

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const errorCode = message === 'TARGET_SEMESTER_NOT_FOUND'
      ? ERROR_TARGET_SEMESTER_NOT_FOUND
      : 'INTERNAL'
    return NextResponse.json(
      {
        success: false,
        error: errorCode,
        message,
        previewOnly: true,
        canConfirm: false,
        canApply: false,
      },
      { status: errorCode === ERROR_TARGET_SEMESTER_NOT_FOUND ? 400 : 500 },
    )
  }
}
