# K39-B1: Import Rules Explicit Semester Config Implementation

> Stage: K39-B1 | Status: CLOSED | Date: 2026-06-19

## Overview

K39-B1 implements the first configurable import rule: `requireExplicitSemesterForImport`. When `true`, the upload dialog shows the target semester and requires user confirmation before parsing. Default is `false` (current behavior preserved).

## Schema / Migration

```prisma
model ImportRuleConfig {
  id                               Int      @id @default(autoincrement())
  key                              String   @unique @default("default")
  requireExplicitSemesterForImport Boolean  @default(false)
  createdAt                        DateTime @default(now())
  updatedAt                        DateTime @updatedAt
}
```

Migration: `20260619000000_add_import_rule_config_k39_b1`

## API

- **GET** `/api/admin/settings/import-rules`: Returns `config.requireExplicitSemesterForImport` with `current`, `editable`, `source`, `description`
- **PATCH** `/api/admin/settings/import-rules`: Accepts `{ requireExplicitSemesterForImport: boolean }`, requires `settings:manage`

## UI

- **Settings panel**: Badge "基础可配置版", toggle with save/cancel
- **Upload dialog**: When `true`, shows amber banner with target semester + checkbox. Upload button disabled until checked.

## Default Value

`false` — preserves current behavior. No breaking changes.

## Backward Compatibility

- `false` = no behavior change
- `true` = enhanced safety gate in upload UI
- No backend semester resolution logic changed
- Parse API still uses active semester
