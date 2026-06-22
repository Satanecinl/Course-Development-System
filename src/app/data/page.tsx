// src/app/data/page.tsx
// Legacy read-only data page. Kept as a redirect so old links do not render it.

import { redirect } from 'next/navigation'

export default function DataPage() {
  redirect('/dashboard')
}
