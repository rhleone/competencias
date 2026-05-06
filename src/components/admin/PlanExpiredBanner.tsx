'use client'

import Link from 'next/link'
import { useTenant } from '@/lib/tenant-context'
import { AlertTriangle } from 'lucide-react'

export default function PlanExpiredBanner({ expiresAt }: { expiresAt: string | null }) {
  const { slug } = useTenant()
  if (!expiresAt) return null

  const expired = new Date(expiresAt) < new Date()
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)

  if (!expired && daysLeft > 7) return null

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-between gap-4 text-sm shrink-0 ${
      expired ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
    }`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          {expired
            ? 'Tu plan venció. Algunas funciones pueden estar limitadas.'
            : `Tu plan vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}.`
          }
        </span>
      </div>
      <Link
        href={`/t/${slug}/admin/billing`}
        className="bg-white/20 hover:bg-white/30 transition px-3 py-1 rounded-md text-xs font-medium shrink-0"
      >
        Renovar plan
      </Link>
    </div>
  )
}
