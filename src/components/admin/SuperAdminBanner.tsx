'use client'

import Link from 'next/link'
import { ShieldAlert, ArrowLeft } from 'lucide-react'

export default function SuperAdminBanner({ tenantName }: { tenantName: string }) {
  return (
    <div className="w-full bg-purple-700 text-white px-4 py-2 flex items-center justify-between gap-4 text-sm shrink-0">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          Modo superadmin · accediendo a <strong>{tenantName}</strong>
        </span>
      </div>
      <Link
        href="/super/tenants"
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition px-3 py-1 rounded-md text-xs font-medium shrink-0"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver a superadmin
      </Link>
    </div>
  )
}
