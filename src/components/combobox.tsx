'use client'

import { useState } from 'react'
import { CheckIcon, ChevronsUpDown, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface EntityOption {
  id: number
  name: string
}

/* ─────────────── Creatable 单选搜索框 ─────────────── */

interface CreatableComboboxProps {
  options: EntityOption[]
  value: number | null
  onChange: (id: number) => void
  onCreate: (name: string) => Promise<number | void>
  placeholder?: string
  searchPlaceholder?: string
  creatableLabel?: (name: string) => string
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder = '请选择...',
  searchPlaceholder = '搜索...',
  creatableLabel = (name) => `创建 "${name}"`,
}: CreatableComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const safeOptions = Array.isArray(options) ? options : []
  const selectedOption = safeOptions.find((o) => o.id === value)
  const filtered = search
    ? safeOptions.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : safeOptions
  const exactMatch = safeOptions.some((o) => o.name === search)
  const showCreate = search && !exactMatch

  async function handleCreate() {
    if (!search || creating) return
    setCreating(true)
    try {
      const newId = await onCreate(search)
      if (newId) {
        onChange(newId)
        setSearch('')
        setOpen(false)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          !selectedOption && 'text-muted-foreground'
        )}
      >
        <span className="truncate">{selectedOption?.name || placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {showCreate ? (
                <button
                  type="button"
                  className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? '创建中...' : creatableLabel(search)}
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">未找到</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.id}
                  value={String(option.id)}
                  onSelect={() => {
                    onChange(option.id)
                    setSearch('')
                    setOpen(false)
                  }}
                >
                  <span className="truncate">{option.name}</span>
                  {value === option.id && (
                    <CheckIcon className="ml-auto size-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ─────────────── Multi-Select 搜索多选框 ─────────────── */

interface MultiSelectComboboxProps {
  options: EntityOption[]
  selected: number[]
  onChange: (selected: number[]) => void
  placeholder?: string
  searchPlaceholder?: string
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = '请选择...',
  searchPlaceholder = '搜索...',
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const safeOptions = Array.isArray(options) ? options : []
  const filtered = search
    ? safeOptions.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : safeOptions

  function toggle(id: number) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  function remove(id: number) {
    onChange(selected.filter((s) => s !== id))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          selected.length === 0 && 'text-muted-foreground'
        )}
      >
        {selected.length === 0 ? (
          <span>{placeholder}</span>
        ) : (
          selected.map((id) => {
            const name = safeOptions.find((o) => o.id === id)?.name
            return (
              <Badge
                key={id}
                variant="secondary"
                className="flex items-center gap-1 px-1.5 py-0 text-xs"
              >
                {name}
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded-full outline-none hover:bg-secondary-foreground/20 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    remove(id)
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      remove(id)
                    }
                  }}
                >
                  <XIcon className="size-3" />
                </span>
              </Badge>
            )
          })
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              <span className="text-sm text-muted-foreground">未找到</span>
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.id}
                  value={String(option.id)}
                  onSelect={() => toggle(option.id)}
                >
                  <span className="truncate">{option.name}</span>
                  {selected.includes(option.id) && (
                    <CheckIcon className="ml-auto size-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
