'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CreditCard, Building2 } from 'lucide-react'

const NAV = [
  { href: '/super/dashboard', label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/super/payments',  label: 'Pagos',           icon: CreditCard },
  { href: '/super/tenants',   label: 'Organizaciones',  icon: Building2 },
]

export default function SuperNav() {
  const pathname = usePathname()
  return (
    <nav className="flex-1 p-3 space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
              active
                ? 'bg-purple-50 text-purple-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
