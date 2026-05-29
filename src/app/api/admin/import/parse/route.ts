import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { ImportParseResult, ImportParseError, ImportScheduleRecord } from '@/types/import'
import { runPythonScript } from '@/lib/server/python-runner'
import { computeImportParseStats, computeImportParseQuality } from '@/lib/import/parse-utils'
import { prisma } from '@/lib/prisma'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const PARSE_TIMEOUT_MS = 60_000 // 60 seconds

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getTmpDir(): string {
  const dir = path.join(os.tmpdir(), 'schedule-import')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getUploadsDir(): string {
  const dir = path.join(process.cwd(), 'uploads', 'imports')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  let tmpDocx: string | null = null
  let tmpJson: string | null = null

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      const errBody: ImportParseError = { success: false, error: '请上传 .docx 文件', details: '未收到文件' }
      return NextResponse.json(errBody, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.docx')) {
      const errBody: ImportParseError = { success: false, error: '只支持 .docx 格式', details: `收到的文件: ${file.name}` }
      return NextResponse.json(errBody, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      const errBody: ImportParseError = { success: false, error: '文件过大', details: `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，限制 20MB` }
      return NextResponse.json(errBody, { status: 400 })
    }

    const tmpDir = getTmpDir()
    const id = randomId()
    tmpDocx = path.join(tmpDir, `${id}.docx`)
    tmpJson = path.join(tmpDir, `${id}.json`)

    const arrayBuffer = await file.arrayBuffer()
    fs.writeFileSync(tmpDocx, Buffer.from(arrayBuffer))

    const scriptPath = path.join(process.cwd(), 'scripts', 'parse_schedule.py')
    const teachersPath = path.join(process.cwd(), 'scripts', 'teachers.txt')

    const args = [tmpDocx, '-o', tmpJson]
    if (fs.existsSync(teachersPath)) {
      args.push('--teachers', teachersPath)
    }

    const result = await runPythonScript({ scriptPath, args, timeoutMs: PARSE_TIMEOUT_MS })

    if (result.exitCode !== 0) {
      const errBody: ImportParseError = {
        success: false,
        error: '解析脚本执行失败',
        details: result.stderr || result.stdout || `exit code: ${result.exitCode}`,
      }
      return NextResponse.json(errBody, { status: 500 })
    }

    if (!fs.existsSync(tmpJson)) {
      const errBody: ImportParseError = {
        success: false,
        error: '解析脚本未生成输出文件',
        details: result.stdout || '无输出',
      }
      return NextResponse.json(errBody, { status: 500 })
    }

    const jsonContent = fs.readFileSync(tmpJson, 'utf-8')
    const records = JSON.parse(jsonContent) as ImportScheduleRecord[]

    const stats = computeImportParseStats(records)
    const quality = computeImportParseQuality(records)

    // 保存文件到稳定路径
    const uploadsDir = getUploadsDir()
    const batchId = randomId()
    const stableDocx = path.join(uploadsDir, `${batchId}.docx`)
    const stableJson = path.join(uploadsDir, `${batchId}.json`)

    fs.copyFileSync(tmpDocx, stableDocx)
    fs.copyFileSync(tmpJson, stableJson)

    // 创建 pending ImportBatch
    const batch = await prisma.importBatch.create({
      data: {
        filename: file.name,
        originalFilePath: `uploads/imports/${batchId}.docx`,
        parsedJsonPath: `uploads/imports/${batchId}.json`,
        statsJson: JSON.stringify(stats),
        qualityJson: JSON.stringify(quality),
        warningsJson: JSON.stringify(quality.warnings),
        status: 'pending',
        recordCount: records.length,
      },
    })

    const body: ImportParseResult & { batchId: number } = {
      success: true,
      batchId: batch.id,
      filename: file.name,
      stats,
      quality,
      records,
    }
    return NextResponse.json(body)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const errBody: ImportParseError = { success: false, error: '服务器错误', details: message }
    return NextResponse.json(errBody, { status: 500 })
  } finally {
    // 清理临时文件（稳定路径的文件保留）
    try { if (tmpDocx && fs.existsSync(tmpDocx)) fs.unlinkSync(tmpDocx) } catch {}
    try { if (tmpJson && fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson) } catch {}
  }
}
