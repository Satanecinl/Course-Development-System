// src/app/admin/rooms/capacity/page.tsx
// Room capacity management — admin only

import { ProtectedShell } from '@/components/layout/protected-shell'
import CapacityContent from './capacity-content'

export default function RoomCapacityPage() {
  return (
    <ProtectedShell>
      <CapacityContent />
    </ProtectedShell>
  )
}
