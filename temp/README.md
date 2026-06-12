# temp

`temp/` is a local-only scratch space for the **Course Development System (my-app)** repo.

## Purpose

`temp/` exists so we have a designated, git-ignored location for files that should not enter the repo, including:

- Manual trial outputs (e.g. K28-B USER → ADMIN approval flow manual runs)
- Untracked drafts of documents that are not yet ready to commit
- Notes / 草稿 / 内部草稿 / 项目汇报表格 等 local-only artifacts
- Pointers / short descriptions to DB backups kept on the local machine only
- One-off debug output that would otherwise litter the repo root

## Rules

1. `temp/` is **git-ignored** by `.gitignore` (rule added in K35-A).
2. The only tracked file inside `temp/` is this `README.md` (and any future `.gitkeep`).
3. Everything else under `temp/` is **local-only**. It is not committed, not pushed, not reviewed.
4. If you want to **preserve** an artifact for later reference, copy it into `docs/` (or a stage-specific doc) and commit the doc instead.
5. If you want to **share** an artifact with reviewers, link to it in a stage closeout doc — do not push raw temp content.

## Layout (suggested)

```txt
temp/
  README.md                              ← this file (only tracked item)
  local-artifacts/
    k28-b/                               ← K28-B manual trial outputs
    <other-stage>/                       ← similar per-stage local scratch
  drafts/                                ← untracked md drafts
  db-backup-pointers/                    ← short notes pointing to real backups on disk
```

## DO

- Use `temp/local-artifacts/<stage>/` for ad-hoc outputs of that stage's manual work.
- Reference a temp path in a commit message or closeout doc if you want reviewers to know it exists.
- Move things OUT of `temp/` (into `docs/`) once they are stable.

## DO NOT

- Commit anything from `temp/` other than `README.md` / `.gitkeep`.
- Reference temp paths from production code or business scripts.
- Delete the only tracked file `temp/README.md`.
- Treat `temp/` as a substitute for `docs/` — temp is local-only.

## Why this exists

Before K35-A, K28-B manual trial outputs and other untracked artifacts sat in the repo root, `scripts/`, and `docs/`, polluting `git status` and confusing future contributors. K35-A established `temp/` as the canonical home for these files, with explicit `.gitignore` rules so they remain local but don't clutter the worktree.
