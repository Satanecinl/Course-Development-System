// scripts/audit-api-permissions.ts
// Read-only inventory of API route permission coverage
// Scans all route.ts files and checks for requirePermission calls

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

interface RouteInfo {
  file: string
  methods: string[]
  hasAuth: boolean
  permissions: string[]
}

function findRouteFiles(dir: string, base: string = ''): string[] {
  const results: string[] = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const relPath = base ? `${base}/${entry}` : entry
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...findRouteFiles(fullPath, relPath))
    } else if (entry === 'route.ts') {
      results.push(relPath)
    }
  }
  return results
}

function analyzeRoute(file: string): RouteInfo {
  const content = readFileSync(join(process.cwd(), file), 'utf-8')

  const methods: string[] = []
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
    if (content.includes(`export async function ${method}`)) {
      methods.push(method)
    }
  }

  const hasAuth = content.includes('requirePermission') || content.includes('requireAuth') || content.includes('requireAnyPermission')

  const permMatches = content.match(/requirePermission\('([^']+)'\)/g) ?? []
  const permissions = permMatches.map((m) => {
    const match = m.match(/requirePermission\('([^']+)'\)/)
    return match?.[1] ?? ''
  }).filter(Boolean)

  return { file, methods, hasAuth, permissions }
}

function main() {
  console.log('📋 API Route Permission Inventory\n')

  const apiDir = join(process.cwd(), 'src', 'app', 'api')
  const routeFiles = findRouteFiles(apiDir, 'src/app/api')

  const routes = routeFiles
    .map(analyzeRoute)
    .sort((a, b) => a.file.localeCompare(b.file))

  let protectedCount = 0
  let unprotectedCount = 0

  for (const route of routes) {
    const status = route.hasAuth ? '✅ PROTECTED' : '❌ MISSING'
    if (route.hasAuth) protectedCount++
    else unprotectedCount++

    console.log(`${status}  ${route.file}`)
    console.log(`         Methods: ${route.methods.join(', ')}`)
    if (route.permissions.length > 0) {
      console.log(`         Permissions: ${route.permissions.join(', ')}`)
    }
    console.log()
  }

  console.log(`${'═'.repeat(50)}`)
  console.log(`📊 总计: ${routes.length} routes, ${protectedCount} protected, ${unprotectedCount} missing`)
  console.log(`${'═'.repeat(50)}`)

  if (unprotectedCount > 0) {
    console.log('\n⚠️  以下路由缺少权限保护:')
    for (const route of routes) {
      if (!route.hasAuth) {
        console.log(`   - ${route.file} (${route.methods.join(', ')})`)
      }
    }
  }
}

main()
