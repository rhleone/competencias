'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/lib/tenant-context'

export default function AdminNav() {
  const { slug } = useTenant()
  const pathname = usePathname()
  const base = `/t/${slug}/admin`

  const navItems = [
    { href: base, label: 'Panel', exact: true },
  ]

  return (
    <nav className="flex-1 p-4 space-y-1">
      {navItems.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
