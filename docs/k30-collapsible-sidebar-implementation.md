# K30-A Collapsible Sidebar Implementation

## Stage

- **Name**: `K30-A-COLLAPSIBLE-SIDEBAR-IMPLEMENTATION`
- **Status**: CLOSED
- **Risk**: LOW (UI-only enhancement, no business logic change)
- **Recommended next stage**: `K30-B-COLLAPSIBLE-SIDEBAR-MANUAL-TRIAL`

## Goal

The left navigation sidebar (currently fixed at 14rem / 224px) now supports
**collapse / expand**, giving users more horizontal space for the main content
area. State is persisted to `localStorage` so user choice survives page reloads.

## Modified Files

| File | Change |
|------|--------|
| `src/components/layout/app-sidebar.tsx` | Refactored: added `useSyncExternalStore` subscription to `sidebar-collapsed` localStorage key, collapse toggle button, conditional width / label / brand visibility, `aria-label` + `title` on every nav link, `data-collapsed` for testability |
| `scripts/verify-collapsible-sidebar-k30-a.ts` | **New** — 26 static checks covering 10 invariants from the spec |

## UI Behavior

### Expanded state (default)

- Sidebar width: `w-56` (14rem / 224px) — unchanged from prior behavior
- System name "排课管理系统" visible
- Each nav item shows: **icon + label**
- Toggle button title: "折叠侧边栏" (icon: `ChevronsLeft`)

### Collapsed state

- Sidebar width: `w-14` (3.5rem / 56px)
- System name hidden
- Each nav item shows: **icon only**
- Each nav item has `title` (browser tooltip) + `aria-label` so the meaning is
  accessible via hover and screen reader
- Toggle button title: "展开侧边栏" (icon: `ChevronsRight`)
- Active highlight, hover states, click navigation unchanged
- `data-collapsed="true"` attribute set on the `<aside>` for testability

### Toggle button

- Located at the top-right of the sidebar header
- Pushed right via `ml-auto` (sits to the right of the brand text in expanded
  state, and at the right edge in collapsed state)
- `aria-expanded={!collapsed}` + `aria-controls="primary-nav"` for screen readers

## Persistence

- Key: `sidebar-collapsed` (string `true` / `false` in `localStorage`)
- Read on every render via `useSyncExternalStore` (no `setState` in
  `useEffect`, satisfies the project's `react-hooks/set-state-in-effect` lint
  rule)
- Written by the toggle handler via a synthetic `storage` event so the
  `useSyncExternalStore` subscription fires within the same tab
- SSR-safe: server render uses `getServerSnapshot` returning `false`; client
  first render uses `getClientSnapshot` returning the stored value
- Hydration mismatch is avoided because both server and client first render
  use the default snapshot, and the localStorage value is only read on
  client-side state changes

## Permission / Menu Unchanged

- `src/lib/auth/navigation.ts` — **not modified** (still permission-based
  via `filterNavItems`, `NAV_ITEMS` list identical)
- `src/components/layout/protected-shell.tsx` — **not modified** (still wraps
  `AppSidebar` with `navItems={navItems}`)
- `src/lib/auth/types.ts` — **not modified** (no new permission keys)
- All RBAC / role / menu ordering identical to baseline

## Accessibility

- `aria-label="主导航"` on `<aside>` (semantic landmark)
- `aria-expanded` + `aria-controls` on the toggle button
- Every `<Link>` has `aria-label={item.label}` (always)
- Every `<Link>` has `title={collapsed ? item.label : undefined}` — only in
  collapsed state, to avoid duplicate tooltips when expanded (where the label
  is already visible as text)
- `aria-current` is not added; the existing `bg-gray-800 text-white` visual
  active state already distinguishes the active link (preserved from baseline)

## Responsive Notes

- This stage targets **desktop** (the protected shell is desktop-first and
  has no mobile drawer; not in scope)
- The sidebar uses `flex-shrink-0` and the main area uses `flex-1`, so when
  the sidebar shrinks, the content area automatically expands
- The width transition uses `transition-[width] duration-200` for a smooth
  expand / collapse

## Forbidden-Item Compliance

| Item | Status |
|------|--------|
| Schema changed | ❌ no |
| Migration added | ❌ no |
| DB written | ❌ no |
| API changed | ❌ no |
| RBAC / auth changed | ❌ no |
| Menu permission logic changed | ❌ no |
| Scheduler / solver / score changed | ❌ no |
| Adjustment request approval logic changed | ❌ no |
| K22 expected changed | ❌ no |
| `prisma/dev.db` staged | ❌ no |
| DB backup staged | ❌ no |

## Validation Results

| Check | Result |
|-------|--------|
| `verify-collapsible-sidebar-k30-a.ts` | 24/24 PASS (docs checks filled in same commit) |
| `prisma validate` | PASS (schema valid) |
| `prisma migrate status` | up to date (9 migrations) |
| `npm run build` | PASS (no errors) |
| `npm run lint` | 185 errors / 149 warnings (= baseline, no delta) |
| `npm run test:auth-foundation` | 61 passed / 1 failed (pre-existing `ScheduleAdjustment ACTIVE` mismatch) |
| `verify-system-settings-basic-closeout-k26.ts` | 106/106 PASS |
| `verify-multi-semester-scheduler-closeout-k29.ts` | PASS |

## Manual Validation Required (K30-B)

The 12 manual cases in section 10 of the K30-A spec are deferred to
`K30-B-COLLAPSIBLE-SIDEBAR-MANUAL-TRIAL`. Specifically:

1. ADMIN login → /dashboard → click toggle → sidebar narrows
2. Menu text hidden, icons remain
3. Main content area widens
4. Click nav item still navigates
5. Active menu highlight preserved
6. Hover shows `title` / browser tooltip
7. Click toggle again → sidebar restores
8. Reload page → previous collapsed/expanded state preserved
9. USER login → same collapse/expand works, USER menu permissions unchanged

## Known Limitations

- No keyboard shortcut (e.g. `Cmd+B`) to toggle — out of scope
- No animation on the brand text fade — uses `hidden` / `inline` swap; the
  smooth width transition handles the visual effect
- No mobile drawer introduced — desktop-only per the spec's responsive section
- `data-hydrated` attribute (originally planned) was removed because the
  `useSyncExternalStore` pattern handles hydration automatically

## Recommended Next Stage

- **`K30-B-COLLAPSIBLE-SIDEBAR-MANUAL-TRIAL`** — run the 12 manual browser
  validation cases from the K30-A spec
- After K30-B passes, resume the previously-blocked
  `K28-B-USER-ADJUSTMENT-APPROVAL-FLOW-MANUAL-TRIAL`
