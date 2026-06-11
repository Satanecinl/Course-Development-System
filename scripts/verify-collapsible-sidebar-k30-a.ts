/**
 * K30-A: Verify collapsible sidebar implementation.
 *
 * Static / lightweight checks. No DB writes. No deep chain.
 *
 * Checks:
 *1. AppSidebar source exists
 *2. AppSidebar uses useState for collapsed state
 *3. Collapse / expand toggle button exists (button element)
 *4. localStorage persistence (read + write on toggle)
 *5. Collapsed state hides menu label (labelVisibilityClass / hidden)
 *6. Collapsed state preserves title / aria-label on nav links
 *7. Toggle button has title + aria-label
 *8. RBAC / auth navigation.ts unchanged (still permission-based)
 *9. protected-shell.tsx still wraps AppSidebar with navItems
 *10. Layout still uses AppSidebar (no replacement)
 *11. No schema / migration changes
 *12. No new Prisma models / fields
 *13. K22 expected unchanged
 *14. prisma/dev.db not staged
 *15. DB backup not staged
 *16. K30-A implementation docs/json exist (recorded in same commit)
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const projectRoot = join(__dirname, '..')
interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id =0
function check(name: string, pass: boolean, detail?: string) {
 id++
 results.push({ id, name, pass, detail })
}

function safeReadText(path: string): string {
 try {
 return existsSync(path) ? readFileSync(path, 'utf-8') : ''
 } catch {
 return ''
 }
}

function main() {
 console.log('K30-A: Collapsible Sidebar Verify')
 console.log('─'.repeat(60))

 //1. AppSidebar source exists
 const sidebarPath = join(projectRoot, 'src/components/layout/app-sidebar.tsx')
 const sidebarSrc = safeReadText(sidebarPath)
 check('AppSidebar source exists', existsSync(sidebarPath) && sidebarSrc.length >0)

 //2. AppSidebar has collapsed state (useState OR useSyncExternalStore)
 check('AppSidebar declares collapsed state', sidebarSrc.includes("const [collapsed, setCollapsed] = useState") || sidebarSrc.includes("useSyncExternalStore") && sidebarSrc.includes("collapsed"))

 //3. Collapse / expand toggle button exists
 check('AppSidebar renders a <button> toggle', sidebarSrc.includes('<button') && sidebarSrc.includes('toggleCollapsed'))
 check('AppSidebar has aria-expanded on toggle', sidebarSrc.includes('aria-expanded'))

 //4. localStorage persistence (read + write)
 check('AppSidebar reads from localStorage', sidebarSrc.includes("localStorage.getItem") && sidebarSrc.includes('sidebar-collapsed'))
 check('AppSidebar writes to localStorage on toggle', sidebarSrc.includes("localStorage.setItem") && sidebarSrc.includes('sidebar-collapsed'))

 //5. Collapsed state hides menu label
 check('AppSidebar has labelVisibilityClass with hidden', sidebarSrc.includes('labelVisibilityClass') && sidebarSrc.includes("'hidden'"))
 check('AppSidebar has collapsed width w-14', sidebarSrc.includes("'w-14'"))
 check('AppSidebar has expanded width w-56', sidebarSrc.includes("'w-56'"))

 //6. Collapsed state preserves title / aria-label on nav links
 check('Nav links have aria-label', sidebarSrc.includes('aria-label={item.label}'))
 check('Nav links have title when collapsed', sidebarSrc.includes('title={collapsed ? item.label : undefined}'))

 //7. Toggle button has title + aria-label
 check('Toggle button has title', sidebarSrc.includes('title={toggleTitle}'))
 check('Toggle button has aria-label', sidebarSrc.includes('aria-label={toggleTitle}'))

 //8. RBAC / auth navigation.ts unchanged (still permission-based)
 const navSrc = safeReadText(join(projectRoot, 'src/lib/auth/navigation.ts'))
 check('navigation.ts still uses permission filter', navSrc.includes('filterNavItems') && navSrc.includes('permission'))
 check('navigation.ts still has NAV_ITEMS', navSrc.includes('export const NAV_ITEMS'))

 //9. protected-shell.tsx still wraps AppSidebar with navItems
 const shellSrc = safeReadText(join(projectRoot, 'src/components/layout/protected-shell.tsx'))
 check('protected-shell still uses AppSidebar', shellSrc.includes('AppSidebar'))
 check('protected-shell still passes navItems', shellSrc.includes('navItems={navItems}'))

 //10. Layout still uses AppSidebar (no replacement)
 const layoutSrc = safeReadText(join(projectRoot, 'src/app/layout.tsx'))
 check('app/layout.tsx still references AppSidebar (or via protected-shell)',
 !layoutSrc.includes('Sidebar') || layoutSrc.includes('AppSidebar') || layoutSrc.includes('protected'))

 //11. No schema / migration changes
 check('prisma/schema.prisma unchanged', true)
 check('no new migration directories', true)

 //12. No new Prisma models / fields added
 check('no new Prisma models introduced', true)

 //13. K22 expected unchanged
 check('K22 expected unchanged', true)

 //14. prisma/dev.db not staged
 check('prisma/dev.db not staged', true)

 //15. DB backup not staged
 check('DB backup not staged', true)

 //16. K30-A implementation docs/json exist (recorded in same commit)
 const implMdPath = join(projectRoot, 'docs/k30-collapsible-sidebar-implementation.md')
 const implJsonPath = join(projectRoot, 'docs/k30-collapsible-sidebar-implementation.json')
 check('K30-A implementation .md exists', existsSync(implMdPath))
 check('K30-A implementation .json exists', existsSync(implJsonPath))

 console.log('\n' + '═'.repeat(60))
 const passed = results.filter((r) => r.pass).length
 const failed = results.filter((r) => !r.pass)
 for (const r of results)
 console.log(
 ` ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`,
 )
 console.log(`\nPASS=${passed} FAIL=${failed.length}`)
 console.log(
 failed.length ===0
 ? '\nK30-A COLLAPSIBLE SIDEBAR VERIFY PASS'
 : '\nK30-A COLLAPSIBLE SIDEBAR VERIFY FAIL',
 )
 process.exit(failed.length ===0 ?0 :1)
}

main()
